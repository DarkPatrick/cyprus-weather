"""Independent collectors; bounded fresh startup rather than years of backfill."""
import argparse
import logging
import time
import threading
from cyprus_weather import weather, uv, air, dom, forecast
import model
from server import initialize

def air_update(path):
    c=air.connect(path)
    try:
        stations=[tuple(r) for r in c.execute('SELECT code,lat,lon FROM stations ORDER BY code')]
        for i in range(0,len(stations),air.CHUNK):
            air.store_model(c,air.fetch_model(stations[i:i+air.CHUNK],past_days=1))
        air.collect_obs(c,default_days=2)
    finally: c.close()

JOBS=[('stations',300,weather.collect_once),('uv',3600,uv.collect),
      ('hourly_weather',3600,model.collect),('air',3600,air_update),
      ('marine',1800,dom.collect_forecast),('bulletins',1800,forecast.collect)]

def run(path,only=None):
    initialize(path)
    for name,interval,fn in JOBS:
        if only and name!=only: continue
        c=model.connect(path)
        try:
            attempted=int(time.time()); error=None
            try: fn(path)
            except Exception as exc:
                error=str(exc); logging.exception('Collector %s failed',name)
            with c:
                c.execute('INSERT INTO collection_status(source,attempted,succeeded,error) VALUES(?,?,?,?) '
                          'ON CONFLICT(source) DO UPDATE SET attempted=excluded.attempted, '
                          'succeeded=COALESCE(excluded.succeeded,collection_status.succeeded),error=excluded.error',
                          (name,attempted,None if error else int(time.time()),error))
        finally: c.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--db',default='data/weather.db'); p.add_argument('--loop',action='store_true')
    p.add_argument('--source',choices=[j[0] for j in JOBS]); a=p.parse_args(); logging.basicConfig(level=logging.INFO)
    if not a.loop:
        run(a.db,a.source)
    else:
        initialize(a.db)
        def worker(name, interval):
            while True:
                run(a.db,name)
                time.sleep(interval)
        workers=[]
        for name,interval,_ in JOBS:
            if a.source and name!=a.source: continue
            t=threading.Thread(target=worker,args=(name,interval),daemon=True)
            t.start();workers.append(t)
        try:
            while True: time.sleep(15)
        except KeyboardInterrupt: pass
