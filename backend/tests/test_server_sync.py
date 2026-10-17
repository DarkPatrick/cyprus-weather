import sqlite3
from server import initialize
from sync_server import sync

def test_mirror_updates_public_values_and_preserves_added_model_fields(tmp_path):
    source=str(tmp_path/'source.db');target=str(tmp_path/'target.db')
    s=sqlite3.connect(source)
    s.executescript('CREATE TABLE stations(code TEXT PRIMARY KEY,lat REAL,lon REAL); CREATE TABLE air_model(station TEXT,ts INTEGER,pm25 REAL,PRIMARY KEY(station,ts)); CREATE TABLE indoor(secret TEXT);')
    s.execute('INSERT INTO stations VALUES(?,?,?)',('TEST',35,33))
    import time
    at=int(time.time())
    s.execute('INSERT INTO air_model VALUES(?,?,?)',('TEST',at,10));s.execute('INSERT INTO indoor VALUES(?)',('private',));s.commit()
    initialize(target)
    d=sqlite3.connect(target);d.execute('INSERT INTO air_model(station,ts,co) VALUES(?,?,?)',('TEST',at,100));d.commit();d.close()
    sync(source,target)
    s.execute('UPDATE air_model SET pm25=20');s.commit()
    sync(source,target)
    d=sqlite3.connect(target)
    assert d.execute('SELECT pm25,co FROM air_model').fetchone()==(20,100)
    assert d.execute("SELECT name FROM sqlite_master WHERE name='indoor'").fetchone() is None
    assert s.execute('SELECT secret FROM indoor').fetchone()==('private',)
    d.close();s.close()


def test_fast_sync_copies_only_recent_observations(tmp_path):
    import time
    from sync_server import FAST_TABLES, FAST_WINDOW
    source=str(tmp_path/'source.db');target=str(tmp_path/'target.db')
    initialize(source)
    now=int(time.time())
    s=sqlite3.connect(source)
    s.execute('INSERT INTO stations(code,lat,lon) VALUES(?,?,?)',('A',35,33))
    s.executemany('INSERT INTO observations(station,ts,temp) VALUES(?,?,?)',[('A',now-FAST_WINDOW-600,10),('A',now-600,20)])
    s.commit();s.close()
    sync(source,target,FAST_TABLES,FAST_WINDOW)
    d=sqlite3.connect(target)
    assert d.execute('SELECT ts,temp FROM observations').fetchall()==[(now-600,20)]
    assert d.execute('SELECT COUNT(*) FROM stations').fetchone()[0]==0
    assert d.execute("SELECT COUNT(*) FROM collection_status WHERE source='existing_server'").fetchone()[0]==0
    d.close()


def test_impossible_values_from_a_failed_sensor_are_not_mirrored(tmp_path):
    import time
    source=str(tmp_path/'source.db');target=str(tmp_path/'target.db')
    initialize(source)
    now=int(time.time())
    s=sqlite3.connect(source)
    s.execute('INSERT INTO stations(code,lat,lon) VALUES(?,?,?)',('A',35,33))
    s.executemany('INSERT INTO observations(station,ts,temp,rh,wind10,wind2) VALUES(?,?,?,?,?,?)',
                  [('A',now-1200,21.5,60,3.0,2.0),('A',now-600,-40.0,0.0,0.0,7.2),('A',now-300,58.0,40,1.0,1.0)])
    s.commit();s.close()
    sync(source,target)
    d=sqlite3.connect(target)
    rows=d.execute('SELECT temp,rh,wind10,wind2 FROM observations ORDER BY ts').fetchall()
    assert rows==[(21.5,60,3.0,2.0),(None,None,None,7.2),(None,40,1.0,1.0)]
    d.close()
