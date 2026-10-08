"""Read public weather history over SSH; never access the indoor database."""
import argparse
import json
import logging
import subprocess
import time
from pathlib import Path
from import_history import TABLES
from server import initialize
import model

REMOTE = '''import json,sqlite3,time,sys
path,tables=json.loads(sys.argv[1])
c=sqlite3.connect('file:'+path+'?mode=ro',uri=True)
c.execute('BEGIN')
data={}
for table in tables:
 cols=[r[1] for r in c.execute('PRAGMA table_info("'+table+'")')]
 if not cols: continue
 query='SELECT * FROM "'+table+'"'
 if 'ts' in cols: query+=' WHERE ts>='+str(int(time.time())-8*86400)
 data[table]={'columns':cols,'rows':c.execute(query).fetchall()}
print(json.dumps(data))
'''

def sync(host,source,db,ai_dir,remote_ai):
    initialize(db)
    # Arguments are shell quoted because SSH passes its command through a shell.
    import shlex
    command='python3 - '+shlex.quote(json.dumps([source,TABLES]))
    result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',host,command],input=REMOTE,text=True,capture_output=True,timeout=180,check=True)
    data=json.loads(result.stdout)
    c=model.connect(db)
    try:
        with c:
            for table,part in data.items():
                local=[r[1] for r in c.execute(f'PRAGMA table_info("{table}")')]
                cols=[k for k in part['columns'] if k in local]
                positions=[part['columns'].index(k) for k in cols]
                names=','.join('"'+k+'"' for k in cols)
                updates=','.join(f'"{k}"=excluded."{k}"' for k in cols)
                sql=f'INSERT INTO "{table}" ({names}) VALUES ({",".join("?" for _ in cols)}) ON CONFLICT DO UPDATE SET {updates}'
                c.executemany(sql,([row[i] for i in positions] for row in part['rows']))
        ai=subprocess.run(['ssh','-o','BatchMode=yes',host,'cat '+shlex.quote(remote_ai+'/latest.json')],capture_output=True,text=True,timeout=30,check=True)
        json.loads(ai.stdout)
        target=Path(ai_dir);target.mkdir(parents=True,exist_ok=True)
        temp=target/'latest.json.tmp';temp.write_text(ai.stdout);temp.replace(target/'latest.json')
        with c:
            at=int(time.time())
            c.execute('INSERT INTO collection_status(source,attempted,succeeded,error) VALUES(?,?,?,NULL) ON CONFLICT(source) DO UPDATE SET attempted=excluded.attempted,succeeded=excluded.succeeded,error=NULL',('server_sync',at,at))
        logging.info('Synced public weather from %s: %s',host,{k:len(v['rows']) for k,v in data.items()})
    finally:c.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--host',required=True);p.add_argument('--source',required=True);p.add_argument('--remote-ai',required=True);p.add_argument('--db',default='data/weather.db');p.add_argument('--ai-dir',default='data/ai');p.add_argument('--loop',action='store_true');a=p.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        try:sync(a.host,a.source,a.db,a.ai_dir,a.remote_ai)
        except Exception:
            logging.exception('Remote weather sync failed')
            if not a.loop:raise
        if not a.loop:break
        time.sleep(300)
