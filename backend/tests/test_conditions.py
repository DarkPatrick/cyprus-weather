import time
import json

import conditions
import model
from cyprus_weather import thermal, weather
from server import initialize


def test_priority_and_levels():
    assert conditions.classify(flashes_near=3, rain_rate=5) == ('thunderstorm', 'measured')
    assert conditions.classify(rain_rate=0.4) == ('rain_light', 'measured')
    assert conditions.classify(rain_rate=10) == ('rain_heavy', 'measured')
    assert conditions.classify(rain_rate=0, model_code=45, rh=98) == ('fog', 'model')
    assert conditions.classify(model_code=45, rh=70, cloud_cover=10) == ('clear', 'model')
    assert conditions.classify(dust=120, clear_index=0.3) == ('dust', 'model')
    assert conditions.classify(clear_index=0.9, cloud_cover=95) == ('clear', 'measured')
    assert conditions.classify(clear_index=0.6) == ('partly_cloudy', 'measured')
    assert conditions.classify(clear_index=0.1) == ('overcast', 'measured')
    assert conditions.classify(cloud_cover=70) == ('cloudy', 'model')
    assert conditions.classify() == (None, None)


def test_clear_sky_ghi_is_zero_at_night_and_about_1000_with_high_sun():
    assert conditions.clear_sky_ghi(-5) == 0
    assert 950 < conditions.clear_sky_ghi(75) < 1100


def _station(tmp_path):
    path = str(tmp_path / 'w.db')
    initialize(path)
    c = weather.connect(path)
    weather.store(c, [('A', 34.7, 33.0)], [])
    return c


def test_current_uses_measured_radiation_in_daylight(tmp_path):
    c = _station(tmp_path)
    # Yesterday 10:00 UTC (sun high): radiation sensors are looked up over the last 7 days of wall time.
    now = int(time.time()) // 86400 * 86400 - 86400 + 10 * 3600
    assert thermal.sun_elevation(now, 34.7, 33.0) > conditions.MIN_ELEVATION
    clear = conditions.clear_sky_ghi(thermal.sun_elevation(now, 34.7, 33.0))
    with c:
        c.executemany('INSERT INTO observations(station,ts,rain,rh,rad_global) VALUES (?,?,?,?,?)',
                      [('A', now - m * 60, 0, 60, clear * 0.3) for m in (0, 10, 20)])
    weather._SITES.clear()
    result = conditions.current(c, 'A', now)
    assert result['code'] == 'cloudy' and result['source'] == 'measured' and not result['night']
    with c:
        c.execute('UPDATE observations SET rain=0.5 WHERE ts=?', (now,))
    assert conditions.current(c, 'A', now)['code'] == 'rain_light'
    c.close()


def test_current_falls_back_to_model_cloud_cover_at_night(tmp_path):
    c = _station(tmp_path)
    now = 1791662400  # 2026-10-10 20:00 UTC, night
    model.connect(str(tmp_path / 'w.db')).close()
    with c:
        c.execute('INSERT INTO hourly_model VALUES (?,?,?,?)', ('A', now, json.dumps({'cloud_cover': 5, 'weather_code': 0}), now))
    result = conditions.current(c, 'A', now)
    assert result == {'code': 'clear', 'source': 'model', 'night': True, 'clear_index': None,
                      'cloud_cover': 5, 'rain_rate': None, 'flashes_near': 0}
    c.close()


def test_broken_clouds_and_cloudy_model_are_not_clear():
    # Limassol, 12 Oct 2026 ~10:10 local: sun between clouds, the average looked clear.
    assert conditions.sky_from_radiation([0.86, 0.95, 1.04]) == 'clear'
    assert conditions.sky_from_radiation([0.64, 0.95, 1.04]) == 'partly_cloudy'
    assert conditions.sky_from_radiation([0.78, 1.05, 0.8]) == 'partly_cloudy'
    assert conditions.sky_from_radiation([0.9, 0.92, 0.91], cloud_cover=85) == 'partly_cloudy'
    assert conditions.sky_from_radiation([0.9, 0.92, 0.91], cloud_cover=20) == 'clear'
    assert conditions.sky_from_radiation([0.3, 0.35, 0.4]) == 'cloudy'
    assert conditions.classify(ratios=[0.1, 0.12, 0.15]) == ('overcast', 'measured')
