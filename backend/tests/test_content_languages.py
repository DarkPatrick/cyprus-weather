import json
import threading
from urllib.request import urlopen
from unittest.mock import Mock

import content_languages as languages
from aranet_monitor import forecast
from server import initialize, make_server


def test_language_cache_keys_and_greek_original(tmp_path):
    path=str(tmp_path/'translations.db')
    cache=languages.Cache(path,True)
    calls=[]
    def translate(items):
        calls.extend(items);return {item['id']:item['language']+': '+item['text'] for item in items}
    for target in ('en','ru'):
        cache.prepare_many([('Ασθενείς άνεμοι.','el',target)],translate)
    assert cache.text('Ασθενείς άνεμοι.','el','el')=='Ασθενείς άνεμοι.'
    assert cache.text('Ασθενείς άνεμοι.','el','en')=='en: Ασθενείς άνεμοι.'
    assert cache.text('Ασθενείς άνεμοι.','el','ru')=='ru: Ασθενείς άνεμοι.'
    cache.prepare_many([('Ασθενείς άνεμοι.','el','en')],translate)
    assert len(calls)==2
    cache.close()
    readonly=languages.Cache(path)
    assert readonly.text('Ασθενείς άνεμοι.','el','en')=='en: Ασθενείς άνεμοι.'
    assert readonly.text('Missing text','ru','en') is None
    readonly.close()


def test_codex_structured_batch_is_read_only_and_preserves_weather_values(monkeypatch):
    from pathlib import Path
    from types import SimpleNamespace
    calls=[]
    def run(args,**kwargs):
        calls.append((args,kwargs))
        Path(args[args.index('-o')+1]).write_text(json.dumps({'translations':[{'id':'0','text':'Light winds, 5 m/s.'}]}))
        return SimpleNamespace(returncode=0,stderr='')
    monkeypatch.setattr(languages.subprocess,'run',run)
    result=languages.codex_batch([{'id':'0','source_language':'el','language':'en','text':'Άνεμοι 5 m/s.'}])
    assert result=={'0':'Light winds, 5 m/s.'}
    args,kwargs=calls[0]
    assert args[args.index('--sandbox')+1]=='read-only'
    assert '--output-schema' in args and '--ephemeral' in args
    assert 'model_reasoning_effort="low"' in args and 'web_search="disabled"' in args
    assert 'shell_tool' in args and 'apps' in args
    assert 'meteorological translator for Cyprus' in kwargs['input']
    assert 'Greek καταιγίδα means thunderstorm' in kwargs['input']


def test_missing_translation_does_not_fall_back_to_russian(tmp_path):
    cache=languages.Cache(str(tmp_path/'absent.db'))
    data={'bulletins':[{'paragraphs':[{'el':'Ελληνικά','ru':'Русский'}],
        'observed':[{'place_el':'Λευκωσία','place':'Никосия'}]}]}
    en=languages.localize_forecast(data,'en',cache)
    assert en['translation_status']=='pending'
    assert en['bulletins'][0]['paragraphs'][0]['text'] is None
    assert 'ru' not in en['bulletins'][0]['paragraphs'][0]
    assert en['bulletins'][0]['observed'][0]['place']=='Nicosia'
    el=languages.localize_forecast(data,'el',cache)
    assert el['bulletins'][0]['paragraphs'][0]['text']=='Ελληνικά'
    assert el['bulletins'][0]['paragraphs'][0]['translated'] is False
    assert el['bulletins'][0]['observed'][0]['place']=='Λευκωσία'
    assert data['bulletins'][0]['paragraphs'][0]['ru']=='Русский'


def test_background_collection_separate_cache_and_failures_do_not_replace_source(tmp_path):
    db=str(tmp_path/'weather.db');initialize(db)
    c=forecast.connect(db)
    forecast.store_bulletin(c,{'issue':'A','issued':1,'valid_from':1,'valid_to':2,
        'outlook':None,'paragraphs':['Καταιγίδες.'], 'observed':[]})
    c.close()
    ai=tmp_path/'ai';ai.mkdir()
    (ai/'latest.json').write_text(json.dumps({'issued':1,'forecast':{'summary':'Возможны грозы.',
        'horizons':[{'hours':4,'valid_until':'2026-10-08T12:00:00+03:00','confidence':'средняя',
                     'regions':[{'region':'Ларнака и восток','notes':'Порывистый ветер.','wind':'5 м/с'}]}]}}))
    calls=[]
    def translate(items):
        calls.extend((i['text'],i['source_language'],i['language']) for i in items)
        return {i['id']:i['language']+': '+i['text'] for i in items if i['text']!='Порывистый ветер.'}
    languages.collect(db,str(ai),translator=translate)
    assert ('Καταιγίδες.','el','en') in calls
    assert ('Возможны грозы.','ru','el') in calls
    cache=languages.Cache(languages.cache_path(db))
    localized=languages.localize_ai(json.loads((ai/'latest.json').read_text()),'el',cache)
    assert localized['forecast']['horizons'][0]['regions'][0]['region']=='Λάρνακα και ανατολική Κύπρος'
    assert localized['forecast']['horizons'][0]['regions'][0]['notes'] is None
    assert localized['translation_status']=='pending'
    cache.close()
    c=forecast.connect(db)
    assert json.loads(c.execute('SELECT paragraphs FROM bulletins').fetchone()[0])==['Καταιγίδες.']
    assert c.execute("SELECT name FROM sqlite_master WHERE name='content_translations'").fetchone() is None
    c.close()


def test_requests_never_translate_and_response_cache_separates_languages(tmp_path,monkeypatch):
    db=str(tmp_path/'weather.db');initialize(db)
    c=forecast.connect(db)
    forecast.store_bulletin(c,{'issue':'A','issued':1,'valid_from':1,'valid_to':2,
        'outlook':None,'paragraphs':['Καταιγίδες.'],'observed':[]})
    c.close()
    cache=languages.Cache(languages.cache_path(db),True)
    cache.prepare_many([('Καταιγίδες.','el','en')],lambda items:{'0':'Thunderstorms.'})
    cache.close()
    blocked=Mock(side_effect=AssertionError('Network translator called on API request'))
    monkeypatch.setattr(languages,'codex_batch',blocked)
    monkeypatch.setattr(forecast,'google',blocked)
    server=make_server('127.0.0.1',0,db)
    worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    base=f'http://127.0.0.1:{server.server_port}/api/weather/forecast?lang='
    try:
        outputs=[]
        for language in ('el','en','el','en'):
            with urlopen(base+language) as response:
                outputs.append((json.load(response),response.headers['X-Weather-Cache']))
        assert outputs[0][0]['bulletins'][0]['paragraphs'][0]['text']=='Καταιγίδες.'
        assert outputs[1][0]['bulletins'][0]['paragraphs'][0]['text']=='Thunderstorms.'
        assert [v[1] for v in outputs]==['MISS','MISS','HIT','HIT']
        blocked.assert_not_called()
    finally:server.shutdown();server.server_close();worker.join()


def test_marine_preserves_official_greek_description_and_no_english_fallback(tmp_path):
    cache=languages.Cache(str(tmp_path/'absent.db'))
    data={'alerts':[{'headline':'Thunderstorm warning','event':'Thunderstorms',
                    'description':'Scattered thunderstorms expected.','description_el':'Αναμένονται μεμονωμένες καταιγίδες.'}]}
    localized=languages.localize_marine(data,'el',cache)
    assert localized['alerts'][0]['description']=='Αναμένονται μεμονωμένες καταιγίδες.'
    assert localized['alerts'][0]['headline'] is None
    assert localized['translation_status']=='pending'
    assert languages.localize_marine(data,'en',cache)['alerts'][0]['headline']=='Thunderstorm warning'


def test_codex_retry_and_overlapping_bulletins_are_deduplicated(tmp_path):
    cache=languages.Cache(str(tmp_path/'cache.db'),True)
    calls=[]
    def provider(items):calls.append(items);return {item['id']:'Light winds.' for item in items}
    requests=[('Ασθενείς άνεμοι.','el','en')]*3
    cache.prepare_many(requests,provider)
    cache.prepare_many(requests,provider)
    assert len(calls)==1 and len(calls[0])==1
    cache.close()


def test_codex_output_rejects_changed_weather_numbers(monkeypatch):
    import pytest
    from pathlib import Path
    from types import SimpleNamespace
    def run(args,**kwargs):
        Path(args[args.index('-o')+1]).write_text(json.dumps({'translations':[{'id':'0','text':'Wind 50 m/s.'}]}))
        return SimpleNamespace(returncode=0,stderr='')
    monkeypatch.setattr(languages.subprocess,'run',run)
    assert languages.codex_batch([{'id':'0','source_language':'el','language':'en','text':'Άνεμοι 5 m/s.'}])=={'0':None}


def test_public_collector_reads_original_weather_locales_only(tmp_path,monkeypatch):
    from io import BytesIO
    calls=[]
    official={'bulletins':[{'paragraphs':[{'el':'Ασθενείς άνεμοι.','text':'Ασθενείς άνεμοι.'}]}]}
    ai={'forecast':{'summary':'Слабый ветер.'}}
    def open_url(url,timeout):
        calls.append(url)
        if '/forecast?' in url:data=official
        elif '/ai-forecast?' in url:data=ai
        else:data={'alerts':[]}
        return BytesIO(json.dumps(data).encode())
    monkeypatch.setattr(languages,'urlopen',open_url)
    batches=[]
    def translate(items):
        batches.extend(items);return {item['id']:item['language']+': '+item['text'] for item in items}
    languages.collect_public('http://localhost:8092/api/weather',str(tmp_path/'cache.db'),translate)
    assert calls==['http://localhost:8092/api/weather/forecast?lang=el',
                   'http://localhost:8092/api/weather/ai-forecast?lang=ru',
                   'http://localhost:8092/api/weather/marine?lang=en',
                   'http://localhost:8092/api/weather/marine?lang=el']
    assert any(item['source_language']=='ru' and item['language']=='el' for item in batches)
    assert any(item['source_language']=='el' and item['language']=='en' for item in batches)


def test_codex_preserves_negative_temperature_sign(monkeypatch):
    from pathlib import Path
    from types import SimpleNamespace
    def run(args,**kwargs):
        Path(args[args.index('-o')+1]).write_text(json.dumps({'translations':[{'id':'0','text':'Temperature 5°C.'}]}))
        return SimpleNamespace(returncode=0,stderr='')
    monkeypatch.setattr(languages.subprocess,'run',run)
    assert languages.codex_batch([{'id':'0','source_language':'el','language':'en','text':'Θερμοκρασία -5°C.'}])=={'0':None}


def test_codex_equivalent_worded_day_does_not_change_weather_magnitudes(monkeypatch):
    from pathlib import Path
    from types import SimpleNamespace
    def run(args,**kwargs):
        Path(args[args.index('-o')+1]).write_text(json.dumps({'translations':[{'id':'0','text':'Over the past 24 hours, temperatures were 2°C higher.'}]}))
        return SimpleNamespace(returncode=0,stderr='')
    monkeypatch.setattr(languages.subprocess,'run',run)
    result=languages.codex_batch([{'id':'0','source_language':'ru','language':'en','text':'За прошедшие сутки температура была на 2°C выше.'}])
    assert result['0']=='Over the past 24 hours, temperatures were 2°C higher.'


def test_marine_warning_presence_survives_pending_translation(tmp_path):
    cache = languages.Cache(str(tmp_path / 'cache.sqlite3'), True)
    source = {'alerts': [], 'warnings': {'text': 'Προειδοποίηση'},
              'forecast': {'warnings': 'Heavy seas'}}
    result = languages.localize_marine(source, 'ru', cache)
    assert result['warnings']['has_warning'] is True
    assert result['forecast']['has_warning'] is True
    assert result['warnings']['text'] is None
    assert result['forecast']['warnings'] is None
    assert 'has_warning' not in source['warnings']
    empty = languages.localize_marine({'alerts': [], 'warnings': {'text': ''},
                                      'forecast': {'warnings': ' NIL '}}, 'el', cache)
    assert empty['warnings']['has_warning'] is False
    assert empty['forecast']['has_warning'] is False
    cache.close()
