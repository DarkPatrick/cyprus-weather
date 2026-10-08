"""Read public Meteosat lightning history; no collector or credentials required."""
import sqlite3
from pathlib import Path

BOX=(33.3,36.7,30.8,35.9)
def readings(path,start,end):
    if not path or not Path(path).is_file():
        return {'ts':[],'lat':[],'lon':[],'radiance':[],'window':None,'box':BOX,'available':False}
    c=sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True,timeout=10)
    try:
        rows=c.execute('SELECT ts,lat,lon,radiance FROM flashes WHERE ts BETWEEN ? AND ? ORDER BY ts',(start,end)).fetchall()
        last=c.execute('SELECT start,end,fetched FROM lightning_files ORDER BY end DESC LIMIT 1').fetchone()
        return {'ts':[r[0] for r in rows],'lat':[r[1] for r in rows],'lon':[r[2] for r in rows],
                'radiance':[r[3] for r in rows],'window':{'start':last[0],'end':last[1],'fetched':last[2]} if last else None,
                'box':BOX,'available':bool(last)}
    finally:c.close()
