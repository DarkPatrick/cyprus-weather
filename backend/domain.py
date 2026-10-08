"""Window summaries and pressure provenance independent of HTTP/UI."""
import math
import statistics
from aranet_monitor import weather

def recent_readings(c, station, now):
    """Exactly the last six recorded observations, independent of clock-hour edges."""
    rows=c.execute('SELECT ts FROM observations WHERE station=? AND ts<=? ORDER BY ts DESC LIMIT 6',
                   (station,now)).fetchall()
    return weather.readings(c,station,rows[-1][0] if rows else now,now)


def summary(data, now):
    indices=sorted((i for i,t in enumerate(data['ts']) if t<=now),key=lambda i:data['ts'][i])[-6:]
    latest=max((data['ts'][i] for i in indices),default=None)
    ready=len(indices)==6 and latest is not None and now-latest<=3600
    result={'window_from':data['ts'][indices[0]] if indices else None,
            'window_to':latest,'samples':len(indices),'ready':ready,
            'coverage':{},'latest_ts':latest}
    for k,v in data.items():
        if k=='ts' or not isinstance(v,list): continue
        values=[v[i] for i in indices if i<len(v) and v[i] is not None]
        result['coverage'][k]=len(values)
        if not ready or not values: result[k]=None
        elif k=='rain': result[k]=round(sum(values),2)
        elif k=='wdir':
            result[k]=math.degrees(math.atan2(sum(math.sin(math.radians(x)) for x in values),
                                             sum(math.cos(math.radians(x)) for x in values)))%360
        else: result[k]=round(statistics.fmean(values),2)
    return result

def adjust_pressure(p, source_height, target_height, temp=15):
    return round(p*math.exp(-9.80665*(target_height-source_height)/(287.05*(temp+273.15))),2)

def pressure_source(c, station, now):
    """Nearest usable pressure observation; independent of any requested altitude."""
    sites={r[0]:(r[1],r[2]) for r in c.execute('SELECT code,lat,lon FROM stations')}
    elevations=dict(c.execute('SELECT station,elevation FROM uv_station'))
    if station not in sites: return None
    candidates=[]
    for code,coords in sites.items():
        d=recent_readings(c,code,now)
        s=summary(d,now)
        p=s.get('p_station'); kind='station'
        source_height=elevations.get(code)
        if p is None:
            p=s.get('p_msl') if s.get('p_msl') is not None else s.get('p_qnh')
            kind='msl' if s.get('p_msl') is not None else 'qnh'; source_height=0
        if p is None or source_height is None: continue
        km=weather._km(*sites[station],*coords)
        candidates.append((0 if code==station else 1, km, code, p, source_height, s,kind))
    if not candidates: return None
    _,km,code,p,height,s,kind=min(candidates,key=lambda r:(r[0],r[1]))
    return {'source_station':code,'km':round(km,1),'source_pressure':p,'source_kind':kind,'source_height':height,
            'source_temp':s.get('temp'),'station_height':elevations.get(station),
            'samples':s['coverage'].get('p_station' if kind=='station' else 'p_'+kind,0)}

def pressure_at(source, altitude=None):
    """Adjust a pressure source to the user's altitude, else to the station height."""
    if source is None: return None
    target=source['station_height'] if altitude is None else altitude
    # No invented sea-level default when altitude is unknown.
    if target is None: return None
    temp=source['source_temp'] if source.get('source_temp') is not None else 15
    public={k:v for k,v in source.items() if k not in ('source_temp','station_height')}
    return {'value':adjust_pressure(source['source_pressure'],source['source_height'],target,temp),**public,
            'target_height':target,'target_kind':'user' if altitude is not None else 'station'}

def pressure(c, station, now, altitude=None):
    return pressure_at(pressure_source(c,station,now),altitude)
