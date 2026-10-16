"""Sea surface temperature off the Cyprus coast from the Open-Meteo marine model.

CyDoM's sea bulletins give one whole-degree value for the whole coast, which stays put for
weeks. The model gives tenths of a degree at points a few kilometres offshore; the app shows
the point nearest the selected station, with the CyDoM value beside it as the official one.
Network only in the collector, never in API handlers.
"""
import json
import math
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cyprus_weather import weather

API = 'https://marine-api.open-meteo.com/v1/marine'
UA = {'User-Agent': 'cyprus-weather/0.1'}
# Sea points around the island, a few km offshore (every one returns model data).
POINTS = [('PAPHOS', 34.75, 32.33), ('POLIS', 35.08, 32.38), ('MORPHOU', 35.22, 32.85),
          ('KYRENIA', 35.38, 33.30), ('KARPASIA', 35.40, 33.95), ('FAMAGUSTA', 35.12, 34.02),
          ('PROTARAS', 34.98, 34.10), ('LARNACA', 34.88, 33.68), ('LIMASSOL', 34.62, 33.10),
          ('PISSOURI', 34.58, 32.75)]
KEEP_SECONDS = 10 * 86400


def connect(path):
    c = weather.connect(path)
    c.executescript("""CREATE TABLE IF NOT EXISTS sea_model (
      point TEXT, ts INTEGER, sst REAL, fetched INTEGER, PRIMARY KEY(point, ts));
      CREATE TABLE IF NOT EXISTS collection_status (
      source TEXT PRIMARY KEY, attempted INTEGER, succeeded INTEGER, error TEXT);""")
    return c


def collect(path, opener=urlopen, now=None):
    """The past 8 days and the next day, hourly, at every point."""
    now = int(time.time()) if now is None else now
    c = connect(path)
    try:
        c.execute('INSERT INTO collection_status VALUES (?, ?, NULL, NULL) ON CONFLICT(source) DO UPDATE SET attempted=excluded.attempted',
                  ('sea_model', now))
        q = {'latitude': ','.join(str(p[1]) for p in POINTS), 'longitude': ','.join(str(p[2]) for p in POINTS),
             'hourly': 'sea_surface_temperature', 'past_days': 8, 'forecast_days': 1,
             'timeformat': 'unixtime', 'timezone': 'GMT'}
        try:
            with opener(Request(API + '?' + urlencode(q), headers=UA), timeout=60) as r:
                data = json.load(r)
            if isinstance(data, dict):
                if data.get('error'):
                    raise ValueError(data.get('reason'))
                data = [data]
            with c:
                for (name, _, _), loc in zip(POINTS, data):
                    h = loc['hourly']
                    c.executemany('INSERT OR REPLACE INTO sea_model VALUES (?, ?, ?, ?)',
                                  [(name, t, v, now) for t, v in zip(h['time'], h['sea_surface_temperature']) if v is not None])
                c.execute('DELETE FROM sea_model WHERE ts < ?', (now - KEEP_SECONDS,))
                c.execute('UPDATE collection_status SET succeeded=?, error=NULL WHERE source=?', (now, 'sea_model'))
        except Exception as e:
            with c:
                c.execute('UPDATE collection_status SET error=? WHERE source=?', (str(e)[:300], 'sea_model'))
            raise
    finally:
        c.close()


def nearest(lat, lon):
    """(point, km) of the sea point nearest to a place."""
    def km(p):
        dy = (p[1] - lat) * 110.574
        dx = (p[2] - lon) * 111.320 * math.cos(math.radians(lat))
        return math.hypot(dx, dy)
    best = min(POINTS, key=km)
    return best, km(best)


def readings(c, lat, lon, start, end, now):
    """Hourly model SST at the point nearest (lat, lon); 'current' is the latest hour not in the future."""
    (name, plat, plon), km = nearest(lat, lon)
    try:
        rows = c.execute('SELECT ts, sst FROM sea_model WHERE point=? AND ts BETWEEN ? AND ? ORDER BY ts',
                         (name, start, end)).fetchall()
    except Exception:
        rows = []
    past = [r for r in rows if r[0] <= now]
    return {'source': 'Open-Meteo marine model', 'point': name, 'lat': plat, 'lon': plon, 'km': round(km, 1),
            'ts': [r[0] for r in rows], 'sst': [r[1] for r in rows],
            'current': {'ts': past[-1][0], 'sst': past[-1][1]} if past else None}
