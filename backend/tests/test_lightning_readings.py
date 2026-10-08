import sqlite3
from lightning_readings import readings

def test_public_lightning_window_without_modifying_source(tmp_path):
    path=tmp_path/'lightning.db';c=sqlite3.connect(path)
    c.executescript('CREATE TABLE flashes(ts REAL,lat REAL,lon REAL,radiance REAL); CREATE TABLE lightning_files(start INTEGER,end INTEGER,fetched INTEGER);')
    c.executemany('INSERT INTO flashes VALUES(?,?,?,?)',[(1,35,33,1),(2,35.1,33.1,2),(3,35.2,33.2,3)])
    c.execute('INSERT INTO lightning_files VALUES(?,?,?)',(0,4,5));c.commit();c.close()
    before=path.read_bytes();d=readings(str(path),2,3)
    assert d['ts']==[2,3] and d['lat']==[35.1,35.2]
    assert d['available'] and d['window']['end']==4
    assert before==path.read_bytes()
    assert readings(str(tmp_path/'missing.db'),0,9)['available'] is False
    assert not (tmp_path/'missing.db').exists()
