"""Hourly weather model; network only in the collector, never in API handlers."""
import json
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from aranet_monitor import weather, thermal

VARS = {'temp':'temperature_2m','rh':'relative_humidity_2m','rain':'precipitation',
        'rain_probability':'precipitation_probability','wind10':'wind_speed_10m',
        'wdir':'wind_direction_10m','p_station':'surface_pressure',
        'p_msl':'pressure_msl','rad_global':'shortwave_radiation'}

def connect(path):
    c = weather.connect(path)
    c.executescript("""CREATE TABLE IF NOT EXISTS hourly_model (
      station TEXT, ts INTEGER, data TEXT NOT NULL, fetched INTEGER,
      PRIMARY KEY(station, ts));
      CREATE TABLE IF NOT EXISTS collection_status (
      source TEXT PRIMARY KEY, attempted INTEGER, succeeded INTEGER, error TEXT);""")
    return c

def collect(path):
    c = connect(path)
    try:
        stations = list(c.execute('SELECT code, lat, lon FROM stations ORDER BY code'))
        for offset in range(0, len(stations), 20):
            batch = stations[offset:offset+20]
            q = {'latitude':','.join(str(s[1]) for s in batch),
                 'longitude':','.join(str(s[2]) for s in batch),
                 'hourly':','.join(VARS.values()), 'wind_speed_unit':'ms',
                 'past_days':1, 'forecast_days':3, 'timeformat':'unixtime', 'timezone':'GMT'}
            with urlopen(Request('https://api.open-meteo.com/v1/forecast?'+urlencode(q),
                                 headers={'User-Agent':'cyprus-weather/0.1'}), timeout=60) as r:
                data = json.load(r)
            if isinstance(data, dict):
                if data.get('error'): raise ValueError(data.get('reason'))
                data = [data]
            with c:
                for st, loc in zip(batch, data):
                    h = loc['hourly']
                    if loc.get('elevation') is not None:
                        c.execute('INSERT OR REPLACE INTO uv_station VALUES (?, ?)', (st[0],loc['elevation']))
                    for i,t in enumerate(h['time']):
                        row={k:h[v][i] for k,v in VARS.items()}
                        # shortwave_radiation is an average over the preceding hour.
                        row['net']=weather.net(row['temp'],row['rh'],row['wind10'])
                        a,b=thermal.feels(row['temp'],row['rh'],row['wind10'],row['rad_global'],st[1],st[2],t-1800)
                        row.update(utci_shade=a,utci_sun=b)
                        c.execute('INSERT OR REPLACE INTO hourly_model VALUES (?, ?, ?, ?)',
                                  (st[0],t,json.dumps(row),int(time.time())))
    finally: c.close()

def readings(c, station, start, end):
    rows=c.execute('SELECT ts, data, fetched FROM hourly_model WHERE station=? AND ts BETWEEN ? AND ? ORDER BY ts',
                   (station,start,end)).fetchall()
    elev=c.execute('SELECT elevation FROM uv_station WHERE station=?',(station,)).fetchone()
    out={'ts':[r[0] for r in rows],'elevation':elev[0] if elev else None,'source':'Open-Meteo weather model',
         'fetched':max((r[2] for r in rows),default=None)}
    values=[json.loads(r[1]) for r in rows]
    for k in [*VARS,'net','utci_shade','utci_sun']: out[k]=[r.get(k) for r in values]
    return out
