import io
import json
import threading
from urllib.request import urlopen

import pytest

import sea
from cyprus_weather import weather
from server import make_server, initialize

NOW = 1_792_150_000


def marine(points, values):
    """A fake Open-Meteo marine answer: one location per point, three hours each."""
    body = [{'hourly': {'time': [NOW - 7200, NOW - 3600, NOW + 3600], 'sea_surface_temperature': v}}
            for v in values[:len(points)]]
    return lambda request, timeout: io.BytesIO(json.dumps(body).encode())


def test_collect_stores_every_point_and_skips_missing_hours(tmp_path):
    path = str(tmp_path / 'w.db')
    initialize(path)
    values = [[25.1, None, 25.4]] + [[26.0, 26.1, 26.2]] * (len(sea.POINTS) - 1)
    sea.collect(path, opener=marine(sea.POINTS, values), now=NOW)
    c = weather.connect(path)
    rows = c.execute('SELECT point, COUNT(*) FROM sea_model GROUP BY point').fetchall()
    assert len(rows) == len(sea.POINTS) and dict(map(tuple, rows))["PAPHOS"] == 2
    status = c.execute("SELECT succeeded, error FROM collection_status WHERE source='sea_model'").fetchone()
    assert tuple(status) == (NOW, None)


def test_a_failed_request_is_recorded_and_raised(tmp_path):
    path = str(tmp_path / 'w.db')
    initialize(path)

    def down(request, timeout):
        raise OSError('marine API down')

    with pytest.raises(OSError):
        sea.collect(path, opener=down, now=NOW)
    c = weather.connect(path)
    assert 'down' in c.execute("SELECT error FROM collection_status WHERE source='sea_model'").fetchone()[0]


def test_nearest_point_and_api_current_value(tmp_path):
    assert sea.nearest(34.68, 33.04)[0][0] == 'LIMASSOL' and sea.nearest(34.77, 32.42)[0][0] == 'PAPHOS'
    path = str(tmp_path / 'w.db')
    initialize(path)
    c = weather.connect(path)
    weather.store(c, [('LIMASSOL', 34.68, 33.04)], [])
    with c:
        c.executemany('INSERT INTO sea_model VALUES (?, ?, ?, ?)',
                      [('LIMASSOL', NOW - 3600, 25.3, NOW), ('LIMASSOL', NOW + 3600, 25.2, NOW)])
    c.close()
    d = sea.readings(weather.connect(path), 34.68, 33.04, NOW - 86400, NOW + 86400, NOW)
    assert d['point'] == 'LIMASSOL' and d['current'] == {'ts': NOW - 3600, 'sst': 25.3} and d['km'] < 10
    server = make_server('127.0.0.1', 0, path, str(tmp_path / 'ai'))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f'http://127.0.0.1:{server.server_port}/api/weather/sea?station=LIMASSOL&from={NOW - 86400}&to={NOW + 86400}'
        with urlopen(url) as response:
            assert json.load(response)['sst'] == [25.3, 25.2]
    finally:
        server.shutdown()
        server.server_close()
