"""Current weather condition at a station: clear, clouds, rain, thunderstorm, fog or dust.

Measurements first: lightning from the satellite, rain from the station's gauge and,
in daylight, cloudiness from measured solar radiation against the clear-sky value.
At night and without a radiation sensor nearby, cloud cover and fog come from the
hourly Open-Meteo model; dust from the CAMS model. Every result says its source.
"""
import json
import math
import sqlite3

import lightning_readings
from cyprus_weather import thermal, weather

THUNDER_KM = 20
THUNDER_SECONDS = 30 * 60
RAIN_SECONDS = 30 * 60
DUST_HAZE = 50          # µg/m³, the moderate band of the PM10 scale used for dust in the app
MIN_ELEVATION = 10      # below this the radiation ratio is too noisy to judge clouds
CLEAR_INDEX = ((0.75, 'clear'), (0.5, 'partly_cloudy'), (0.25, 'cloudy'))
CLOUD_COVER = ((25, 'clear'), (60, 'partly_cloudy'), (85, 'cloudy'))
FOG_CODES = {45, 48}


def clear_sky_ghi(elevation):
    """Haurwitz clear-sky global horizontal irradiance, W/m²."""
    if elevation is None or elevation <= 0:
        return 0.0
    s = math.sin(math.radians(elevation))
    return 1098 * s * math.exp(-0.057 / s)


def rain_level(rate):
    return 'rain_light' if rate < 2.5 else 'rain_moderate' if rate < 7.6 else 'rain_heavy'


def classify(*, flashes_near=0, rain_rate=None, model_code=None, rh=None, dust=None,
             clear_index=None, cloud_cover=None):
    """(code, source) by priority; (None, None) when nothing is known."""
    if flashes_near:
        return 'thunderstorm', 'measured'
    if rain_rate:
        return rain_level(rain_rate), 'measured'
    if model_code in FOG_CODES and (rh is None or rh >= 95):
        return 'fog', 'model'
    if dust is not None and dust >= DUST_HAZE:
        return 'dust', 'model'
    if clear_index is not None:
        return next((code for limit, code in CLEAR_INDEX if clear_index >= limit), 'overcast'), 'measured'
    if cloud_cover is not None:
        return next((code for limit, code in CLOUD_COVER if cloud_cover < limit), 'overcast'), 'model'
    return None, None


def _nearest_hour(conn, sql, station, now):
    try:
        return conn.execute(sql + ' WHERE station=? AND ts BETWEEN ? AND ? ORDER BY ABS(ts-?) LIMIT 1',
                            (station, now - 3600, now + 3600, now)).fetchone()
    except sqlite3.OperationalError:
        return None


def current(conn, station, now, lightning_db=None):
    site = conn.execute('SELECT lat, lon FROM stations WHERE code=?', (station,)).fetchone()
    if not site:
        return None
    lat, lon = site[0], site[1]
    elevation = thermal.sun_elevation(now, lat, lon)
    rows = conn.execute('SELECT ts, rain, rh FROM observations WHERE station=? AND ts>? AND ts<=? ORDER BY ts',
                        (station, now - RAIN_SECONDS, now)).fetchall()
    rain = [r[1] for r in rows if r[1] is not None]
    rain_rate = round(sum(rain) * 3600 / RAIN_SECONDS, 1) if rain else None
    rh = next((r[2] for r in reversed(rows) if r[2] is not None), None)

    clear_index = None
    if rows and elevation >= MIN_ELEVATION:
        src = weather.radiation_source(conn, station)
        if src['kind'] in ('own', 'near'):
            ts = [r[0] for r in rows]
            pairs = [(g, clear_sky_ghi(thermal.sun_elevation(t, lat, lon)))
                     for t, g in zip(ts, weather.radiation_series(conn, src, ts)) if g is not None]
            expected = sum(c for _, c in pairs)
            if pairs and expected > 0:
                clear_index = round(sum(g for g, _ in pairs) / expected, 2)

    model = _nearest_hour(conn, 'SELECT data FROM hourly_model', station, now)
    model = json.loads(model[0]) if model else {}
    dust = _nearest_hour(conn, 'SELECT dust FROM air_model', station, now)
    dust = dust[0] if dust else None

    flashes = lightning_readings.readings(lightning_db, now - THUNDER_SECONDS, now)
    near = sum(1 for la, lo in zip(flashes['lat'], flashes['lon']) if weather._km(lat, lon, la, lo) <= THUNDER_KM)

    code, source = classify(flashes_near=near, rain_rate=rain_rate, model_code=model.get('weather_code'), rh=rh,
                            dust=dust, clear_index=clear_index, cloud_cover=model.get('cloud_cover'))
    if code is None:
        return None
    return {'code': code, 'source': source, 'night': elevation < -0.833, 'clear_index': clear_index,
            'cloud_cover': model.get('cloud_cover'), 'rain_rate': rain_rate, 'flashes_near': near}
