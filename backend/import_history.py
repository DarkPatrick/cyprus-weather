"""Import only public weather tables from an explicitly supplied SQLite database."""
import argparse
import sqlite3
from pathlib import Path
from server import initialize

TABLES=['stations','observations','uv_station','uv','rad_model','air_obs','air_model',
        'sea_forecasts','warnings','alerts','radar','bulletins','translations','climate_docs']

def import_history(source,target):
    if Path(source).resolve()==Path(target).resolve(): raise ValueError('Source and target must differ')
    initialize(target)
    src=sqlite3.connect(Path(source).resolve().as_uri()+'?mode=ro',uri=True)
    dest=sqlite3.connect(target)
    try:
        for table in TABLES:
            old=[r[1] for r in src.execute(f'PRAGMA table_info("{table}")')]
            new=[r[1] for r in dest.execute(f'PRAGMA table_info("{table}")')]
            common=[c for c in new if c in old]
            if not common: continue
            cols=','.join('"'+c+'"' for c in common)
            with dest:
                dest.executemany(f'INSERT OR IGNORE INTO "{table}" ({cols}) VALUES ({",".join("?" for _ in common)})',
                                 src.execute(f'SELECT {cols} FROM "{table}"'))
            print(table, 'imported (existing target rows preserved)')
    finally: src.close();dest.close()

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('source');a.add_argument('--db',default='data/weather.db');args=a.parse_args()
    import_history(args.source,args.db)
