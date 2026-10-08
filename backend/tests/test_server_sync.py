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
