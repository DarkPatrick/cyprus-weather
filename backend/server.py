"""Public weather API. No indoor data, auth, subprocess or collector on request."""
import argparse
import json
import logging
import math
import time
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from cyprus_weather import weather, uv, air, dom, forecast, agg
import model
import lightning_readings
from domain import summary, pressure_source, pressure_at, recent_readings
from response_cache import ResponseCache
import content_languages
import visits

def initialize(path):
    for connect in (dom.connect,uv.connect,air.connect,forecast.connect,model.connect):
        connect(path).close()

class Handler(BaseHTTPRequestHandler):
    def __init__(self,*a,db_path,ai_dir,lightning_db=None,translations_db=None,visits_db=None,**kw):
        self.db_path=db_path; self.ai_dir=ai_dir; self.lightning_db=lightning_db
        self.visits_db=visits_db or visits.default_path(db_path)
        self.translations_db=translations_db or content_languages.cache_path(db_path)
        super().__init__(*a,**kw)
    def respond(self,data,status=200,cache_status=None):
        body=data if isinstance(data,bytes) else json.dumps(data,allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Access-Control-Allow-Origin','*')
        if cache_status:self.send_header('X-Weather-Cache',cache_status)
        self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        u=urlparse(self.path); q=parse_qs(u.query); now=int(time.time())
        # GET because nginx forwards only GET to this API; never cached, no body.
        if u.path=='/api/visit':return self.record_visit(q.get('id',[''])[0],now)
        global_routes={'/api/health','/api/weather/stations','/api/weather/forecast',
                       '/api/weather/marine','/api/weather/ai-forecast'}
        range_routes={'/api/weather/lightning','/api/weather/map-history'}
        station_routes={'/api/weather/readings','/api/weather/uv','/api/weather/air',
                        '/api/weather/snapshot','/api/weather/model'}
        if u.path not in global_routes|range_routes|station_routes:
            return self.respond({'error':'Not found'},404)
        try:
            station=q.get('station',[''])[0]
            language=q.get('lang',['ru'])[0]
            if language not in content_languages.LANGUAGES:raise ValueError('Unsupported language')
            lo=int(q.get('from',[now-86400])[0]); hi=int(q.get('to',[now+86400])[0])
            if hi<lo or hi-lo>8*86400:raise ValueError('Range must be ordered and at most 8 days')
            altitude=q.get('altitude',[None])[0] if u.path.endswith('/snapshot') else None
            altitude=None if altitude is None else float(altitude)
            if altitude is not None and (not math.isfinite(altitude) or not -500<=altitude<=4000):
                raise ValueError('Altitude must be between -500 and 4000 metres')
            kind=q.get('agg',['hour'])[0] if u.path.endswith('/readings') else None
            if kind is not None and kind not in ('auto',)+agg.KINDS:raise ValueError('Unknown aggregation')
            if u.path in station_routes and not station:raise ValueError('Unknown station')
            # Only live rolling windows share a minute-aligned range. Exact historical
            # ranges and raw samples retain their original bounds.
            rolling=abs(hi-now-86400)<=120 and min(abs(lo-now+86400),abs(lo-now+93600))<=120
            if rolling and kind!='raw':lo=lo//60*60;hi=hi//60*60
            if u.path in global_routes:key=(u.path,)
            # Snapshot is cached per station; altitude only rescales pressure after the cache,
            # so arbitrary altitudes cannot force a full pressure-source scan per request.
            elif u.path.endswith('/snapshot'):key=(u.path,station)
            elif u.path in range_routes:key=(u.path,lo,hi)
            else:key=(u.path,station,lo,hi,kind)
            if u.path in ('/api/weather/forecast','/api/weather/ai-forecast','/api/weather/marine'):key += (language,)
            def load():
                data=self.read_data(u.path,station,lo,hi,kind,altitude,now)
                if u.path in ('/api/weather/forecast','/api/weather/ai-forecast','/api/weather/marine'):
                    cache=content_languages.Cache(self.translations_db)
                    try:
                        localize={'/api/weather/forecast':content_languages.localize_forecast,
                                  '/api/weather/ai-forecast':content_languages.localize_ai,
                                  '/api/weather/marine':content_languages.localize_marine}[u.path]
                        data=localize(data,language,cache)
                    finally:cache.close()
                return json.dumps(data,allow_nan=False).encode()
            body,hit=self.server.response_cache.get(key,load)
            if u.path.endswith('/snapshot'):
                d=json.loads(body);d['pressure']=pressure_at(d.pop('pressure_source',None),altitude)
                body=json.dumps(d,allow_nan=False).encode()
            self.respond(body,cache_status=hit)
        except (ValueError,OverflowError) as e:self.respond({'error':str(e)},400)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception:
            logging.exception('API request failed');self.respond({'error':'Weather data temporarily unavailable'},503)

    def record_visit(self,anonymous_id,now):
        if not visits.valid_id(anonymous_id):return self.respond({'error':'Invalid anonymous id'},400)
        try:visits.record(self.visits_db,anonymous_id,now)
        except Exception:logging.exception('Visit not recorded')
        self.send_response(204)
        self.send_header('Cache-Control','no-store')
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()

    def read_data(self,path,station,lo,hi,kind,altitude,now):
        # A cache hit never opens SQLite or recalculates the thermal indices.
        c=weather.connect(self.db_path)
        try:
            if path=='/api/health':return {'now':now,'collectors':[dict(r) for r in c.execute('SELECT * FROM collection_status')]}
            if path=='/api/weather/lightning':return lightning_readings.readings(self.lightning_db,lo,hi)
            if path=='/api/weather/stations':return weather.station_list(c)
            if path=='/api/weather/forecast':return content_languages.read_forecast(c)
            if path=='/api/weather/marine':
                d=dom.marine(c);d['sst']=agg.aggregate(d['sst'],'day');return d
            if path=='/api/weather/ai-forecast':
                p=Path(self.ai_dir)/'latest.json';return json.loads(p.read_text()) if p.is_file() else None
            if path=='/api/weather/map-history':return weather.map_history(c,lo,hi)
            if not c.execute('SELECT 1 FROM stations WHERE code=?',(station,)).fetchone():raise ValueError('Unknown station')
            if path.endswith('/snapshot'):
                d=recent_readings(c,station,now)
                return {'now':now,'summary':summary(d,now),'rad_src':d['rad_src'],'pressure_source':pressure_source(c,station,now)}
            if path.endswith('/model'):return model.readings(c,station,lo,hi)
            if path.endswith('/uv'):return uv.readings(c,station,lo,hi)
            if path.endswith('/air'):return air.readings(c,station,lo,hi)
            d=weather.readings(c,station,lo,hi)
            if d['rad_src']['kind'] in ('own','near'):d['radiation_observed']=weather.radiation_series(c,d['rad_src'],d['ts'])
            else:d['radiation_observed']=[None]*len(d['ts'])
            return agg.aggregate(d,kind,sums={'rain'},circular={'wdir'})
        finally:c.close()

class WeatherServer(ThreadingHTTPServer):
    request_queue_size=256
    daemon_threads=True

def make_server(host,port,path,ai_dir='data/ai',lightning_db=None,translations_db=None,visits_db=None):
    initialize(path)
    server=WeatherServer((host,port),partial(Handler,db_path=path,ai_dir=ai_dir,lightning_db=lightning_db,translations_db=translations_db,visits_db=visits_db))
    server.response_cache=ResponseCache()
    return server

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--host',default='127.0.0.1'); p.add_argument('--port',type=int,default=8092)
    p.add_argument('--db',default='data/weather.db'); p.add_argument('--ai-dir',default='data/ai'); p.add_argument('--lightning-db'); p.add_argument('--translations-db'); p.add_argument('--visits-db'); a=p.parse_args()
    logging.basicConfig(level=logging.INFO)
    server=make_server(a.host,a.port,a.db,a.ai_dir,a.lightning_db,a.translations_db,a.visits_db)
    print(f'Weather API: http://{a.host}:{a.port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
