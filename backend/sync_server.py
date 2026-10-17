"""Mirror public source tables locally on the server; source opened read-only."""
import argparse
import logging
import sqlite3
import time
import json
from urllib.request import urlopen
from urllib.parse import urlencode
from import_history import TABLES
from server import initialize
import model
import sea

# Every minute: only fresh station observations, the time-critical part.
FAST_TABLES=('observations',)
FAST_WINDOW=2*3600
FAST_SECONDS=60
# Every 5 minutes: everything for 8 days. Forecast and model rows are rewritten in place
# (same timestamp, new values), so they cannot be picked up by "new rows only".
FULL_WINDOW=8*86400
FULL_SECONDS=300
# Values no Cyprus station can measure. A failed logger reports -40 °C with 0 % humidity (PENTAKOMO
# from 2026-10-17) and its 10 m wind channel reads 0 too; such rows become "no data" in the mirror.
SENTINEL_TEMP=-39.5
CLEAN_OBSERVATIONS=(f'UPDATE observations SET temp=NULL, rh=NULL, wind10=NULL WHERE temp<={SENTINEL_TEMP} AND ts>=?',
                    'UPDATE observations SET temp=NULL WHERE temp>55 AND ts>=?',
                    'UPDATE observations SET rh=NULL WHERE rh<=0 AND ts>=?')


def sync(source,target,tables=TABLES,window=FULL_WINDOW):
    initialize(target)
    src=sqlite3.connect('file:'+source+'?mode=ro',uri=True,timeout=30)
    dest=model.connect(target)
    try:
        src.execute('BEGIN')
        with dest:
            for table in tables:
                columns=[r[1] for r in src.execute(f'PRAGMA table_info("{table}")')]
                local=[r[1] for r in dest.execute(f'PRAGMA table_info("{table}")')]
                cols=[k for k in columns if k in local]
                if not cols:continue
                names=','.join('"'+k+'"' for k in cols)
                query=f'SELECT {names} FROM "{table}"'
                if 'ts' in cols:query+=' WHERE ts>='+str(int(time.time())-window)
                updates=','.join(f'"{k}"=excluded."{k}"' for k in cols)
                dest.executemany(f'INSERT INTO "{table}" ({names}) VALUES ({",".join("?" for _ in cols)}) ON CONFLICT DO UPDATE SET {updates}',src.execute(query))
                if table=='observations':
                    for sql in CLEAN_OBSERVATIONS:dest.execute(sql,(int(time.time())-window,))
            at=int(time.time())
            if tuple(tables)!=tuple(TABLES):return
            dest.execute('INSERT INTO collection_status VALUES(?,?,?,NULL) ON CONFLICT(source) DO UPDATE SET attempted=excluded.attempted,succeeded=excluded.succeeded,error=NULL',('existing_server',at,at))
    finally:src.close();dest.close()

def collect_co(path):
    # Existing aranet4 CAMS collection has no CO column; augment that variable only.
    c=model.connect(path)
    try:
        sites=list(c.execute('SELECT code,lat,lon FROM stations ORDER BY code'))
        for offset in range(0,len(sites),30):
            batch=sites[offset:offset+30]
            q={'latitude':','.join(str(s[1]) for s in batch),'longitude':','.join(str(s[2]) for s in batch),
               'hourly':'carbon_monoxide','past_days':1,'forecast_days':3,'timeformat':'unixtime','timezone':'GMT'}
            with urlopen('https://air-quality-api.open-meteo.com/v1/air-quality?'+urlencode(q),timeout=60) as response:
                data=json.load(response)
            if isinstance(data,dict):
                if data.get('error'):raise ValueError(data.get('reason'))
                data=[data]
            with c:
                for site,loc in zip(batch,data):
                    h=loc['hourly']
                    c.executemany('INSERT INTO air_model(station,ts,co,fetched) VALUES(?,?,?,?) ON CONFLICT(station,ts) DO UPDATE SET co=excluded.co',
                                  [(site[0],t,v,int(time.time())) for t,v in zip(h['time'],h['carbon_monoxide'])])
    finally:c.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--db',required=True);p.add_argument('--loop',action='store_true');a=p.parse_args()
    logging.basicConfig(level=logging.INFO)
    last_model=last_full=last_sea=0
    while True:
        full=time.time()-last_full>=FULL_SECONDS
        try:
            for attempt in range(30):
                try:
                    if full:sync(a.source,a.db)
                    else:sync(a.source,a.db,FAST_TABLES,FAST_WINDOW)
                    break
                except sqlite3.OperationalError:
                    if attempt==29:raise
                    time.sleep(2)
            if full:
                last_full=time.time();logging.info('Public server history synced')
            if time.time()-last_model>=3600:
                model.collect(a.db);collect_co(a.db);last_model=time.time();logging.info('Hourly weather and CO models updated')
        except Exception:
            logging.exception('Server sync failed')
            if not a.loop:raise
        # Sea temperature on its own hourly clock: a marine API failure never holds up the sync.
        if time.time()-last_sea>=3600:
            last_sea=time.time()
            try:sea.collect(a.db);logging.info('Hourly sea temperature model updated')
            except Exception:logging.exception('Sea temperature collection failed')
        if not a.loop:break
        time.sleep(FAST_SECONDS)
