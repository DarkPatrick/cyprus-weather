import json
import threading
from urllib.request import urlopen
from urllib.error import HTTPError
import pytest
from cyprus_weather import weather, uv, air
from domain import summary, adjust_pressure, pressure
from server import make_server, initialize


def test_six_observations_cross_hour_boundary():
    # Just after the new hour, use six preceding points rather than one bucket.
    data={'ts':[32000,32600,33200,33800,34400,35000,35600,37000],
          'temp':[99,20,21,22,23,24,25,99],
          'rain':[99,.1,.2,.3,.4,.5,.6,99]}
    s=summary(data,36005)
    assert s['samples']==6 and s['ready']
    assert s['temp']==22.5 and s['rain']==2.1
    assert s['window_from']==32600 and s['latest_ts']==35600


def test_incomplete_or_stale_history_is_not_a_partial_six_point_summary():
    assert summary({'ts':[3600,4200],'temp':[20,22]},4200)['temp'] is None
    assert summary({'ts':[0,600,1200,1800,2400,3000],'rain':[0]*6},7200)['rain'] is None


def test_pressure_height_sign_and_identity():
    assert adjust_pressure(1000,100,100)==1000
    assert adjust_pressure(1000,0,100)<1000
    assert adjust_pressure(1000,100,0)>1000


def test_pressure_nearest_fresh_source_and_explicit_altitude(tmp_path):
    path=str(tmp_path/'w.db');initialize(path);c=weather.connect(path)
    weather.store(c,[('A',35,33),('B',35.01,33),('C',35.001,33)],[])
    with c:
        c.executemany('INSERT INTO uv_station VALUES (?,?)',[('A',50),('B',100),('C',0)])
        c.executemany('INSERT INTO observations(station,ts,p_station,temp) VALUES (?,?,?,?)',
                      [('B',t,1000,20) for t in range(4200,7201,600)]+[('C',t,999,20) for t in range(-3000,1,600)])
    d=pressure(c,'A',7200,80)
    assert d['source_station']=='B' and d['target_kind']=='user' and d['value']>1000
    assert pressure(c,'A',7200)['target_height']==50
    c.close()


def test_co_has_measured_and_model_series(tmp_path):
    c=air.connect(str(tmp_path/'w.db'));weather.store(c,[('A',35.1519,33.3478)],[])
    air.store_obs(c,[dict(station='NICTRA',ts=3600,pm25=None,pm10=None,no2=None,o3=None,so2=None,co=150)])
    air.store_model(c,[dict(station='A',ts=3600,pm25=None,pm10=None,no2=None,o3=None,so2=None,dust=None,eaqi=None,co=170,fetched=3600)])
    d=air.readings(c,'A');assert d['co']==[150] and d['co_cams']==[170] and d['sources']['co']['code']=='NICTRA'
    c.close()


def test_public_api_routes_and_input_validation(tmp_path):
    server=make_server('127.0.0.1',0,str(tmp_path/'w.db'),str(tmp_path/'ai'))
    c=weather.connect(str(tmp_path/'w.db'));weather.store(c,[('A',35,33)],[]);c.close()
    worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    base=f'http://127.0.0.1:{server.server_port}'
    try:
        for path in ['/api/weather/stations','/api/weather/marine','/api/weather/forecast','/api/weather/ai-forecast',
                     '/api/weather/readings?station=A','/api/weather/snapshot?station=A','/api/weather/model?station=A',
                     '/api/weather/air?station=A','/api/weather/uv?station=A','/api/health']:
            with urlopen(base+path) as r: json.load(r)
        for path,code in [('/api/latest',404),('/api/readings',404),('/weather/home',404),
                          ('/api/weather/snapshot?station=A&altitude=nan',400),
                          ('/api/weather/readings?station=missing',400),
                          ('/api/weather/map-history?from=9&to=1',400)]:
            with pytest.raises(HTTPError) as e: urlopen(base+path)
            assert e.value.code==code
    finally: server.shutdown();server.server_close();worker.join()


def test_cached_api_preserves_altitude_and_historical_ranges(tmp_path,monkeypatch):
    import server as api_server
    monkeypatch.setattr(api_server.time,'time',lambda:180000)
    calls=[]
    def read(self,path,station,lo,hi,kind,altitude,now):
        calls.append((path,station,lo,hi,altitude))
        source={'source_station':station,'source_pressure':1000,'source_height':0,'source_temp':15,'station_height':0}
        return {'lo':lo,'hi':hi,'station':station,'pressure_source':source}
    monkeypatch.setattr(api_server.Handler,'read_data',read)
    server=make_server('127.0.0.1',0,str(tmp_path/'cache.db'))
    worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    base=f'http://127.0.0.1:{server.server_port}/api/weather/'
    def get(path):
        with urlopen(base+path) as response:return json.load(response),response.headers['X-Weather-Cache']
    try:
        first,status=get('snapshot?station=A&altitude=10');assert status=='MISS'
        assert get('snapshot?altitude=10.0&station=A')==(first,'HIT')
        # A new altitude reuses the cached station snapshot and only rescales pressure.
        other,status=get('snapshot?station=A&altitude=20');assert status=='HIT'
        assert other['pressure']['target_height']==20 and other['pressure']['value']<first['pressure']['value']
        assert 'pressure_source' not in other
        assert get('snapshot?station=A')[0]['pressure']['target_kind']=='station'
        assert get('snapshot?station=B&altitude=10')[0]['station']=='B'
        assert sum(1 for call in calls if call[0].endswith('/snapshot'))==2
        a,status=get('model?station=A&from=93601&to=266401');assert status=='MISS'
        assert get('model?station=A&from=93615&to=266415')==(a,'HIT')
        a,_=get('readings?station=A&from=93601&to=266401&agg=raw')
        b,status=get('readings?station=A&from=93615&to=266415&agg=raw');assert status=='MISS' and a['lo']!=b['lo']
        exact,_=get('model?station=A&from=100&to=200');assert exact['lo']==100 and exact['hi']==200
        assert server.request_queue_size==256
    finally:server.shutdown();server.server_close();worker.join()
