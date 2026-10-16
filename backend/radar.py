"""Rain radar composite from the Cyprus Department of Meteorology raw volumes.

CyDoM publishes every radar volume (GAMIC HDF5, ~27-43 MB, about every 9 minutes per
radar) at agromet.dom.org.cy. Only the lowest sweep's reflectivity is needed, so the file
is read through HTTP range requests (~1.3 MB instead of the whole volume). The two radars
(Larnaca, Paphos) are combined per pixel by their maximum and drawn as a transparent PNG
on a Web Mercator grid around Cyprus.

    python backend/radar.py --dir /var/lib/cyprus-weather/radar --loop
"""
import argparse
import calendar
import io
import json
import logging
import math
import re
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import h5py
import numpy as np
from PIL import Image

import radar_store

LIST_URL = 'https://agromet.dom.org.cy/stations_data/radar'
FILE_URL = 'https://agromet.dom.org.cy/uploads/radars/'
FILE_NAME = re.compile(r'LONGRANGE_(LCA|PFO)_(\d{14})_00\.h5')
UA = {'User-Agent': 'cyprus-weather/0.1'}
WIDTH, HEIGHT = 480, 400          # about 1 km per pixel
PAIR_SECONDS = 12 * 60            # sweeps of the two radars combined into one frame
KEEP_SECONDS = 7 * 86400          # frames, cell summaries and the sweeps they were built from
MIN_DBZ = 10                      # weaker echoes are mostly noise and sea clutter
HEAVY_DBZ = 30                    # about 3 mm/h and more
MAX_RAY_GAP = 1.5                 # degrees between a pixel and the nearest ray
LOOP_SECONDS = 180
GONE_SECONDS = 20 * 60           # a listed volume answering 404 for longer than this is deleted
# dBZ lower bound -> colour, the usual rain-radar scale (drizzle blue to hail magenta).
COLOURS = [(10, (140, 200, 255)), (15, (80, 160, 240)), (20, (30, 110, 220)), (25, (20, 70, 190)), (30, (40, 180, 70)),
           (35, (20, 135, 45)), (40, (245, 215, 30)), (45, (250, 150, 20)), (50, (230, 45, 30)),
           (55, (165, 0, 40)), (60, (210, 50, 200))]
ALPHA = 200


def file_time(name):
    """UTC epoch from the file name (the sweep attributes carry local time labelled as UTC)."""
    stamp = FILE_NAME.fullmatch(name).group(2)
    return calendar.timegm(time.strptime(stamp, '%Y%m%d%H%M%S'))


def list_files(html):
    """{site: [names, oldest first]} from the CyDoM radar page."""
    sites = {}
    for site, stamp in sorted(set(FILE_NAME.findall(html)), key=lambda x: x[1]):
        sites.setdefault(site, []).append(f'LONGRANGE_{site}_{stamp}_00.h5')
    return sites


class RangeFile(io.RawIOBase):
    """Read-only file over HTTP range requests, cached in 256 KB blocks."""

    def __init__(self, url, block=256 * 1024, retries=3):
        self.url, self.block, self.retries, self.pos, self.cache, self.fetched = url, block, retries, 0, {}, 0
        with urlopen(Request(url, method='HEAD', headers=UA), timeout=30) as response:
            self.size = int(response.headers['Content-Length'])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def _block(self, index):
        if index not in self.cache:
            lo = index * self.block
            hi = min(self.size, lo + self.block) - 1
            for attempt in range(self.retries):
                try:
                    with urlopen(Request(self.url, headers={**UA, 'Range': f'bytes={lo}-{hi}'}), timeout=60) as response:
                        self.cache[index] = response.read()
                    break
                except OSError:
                    if attempt == self.retries - 1:
                        raise
                    time.sleep(2)
            self.fetched += len(self.cache[index])
        return self.cache[index]

    def readinto(self, buffer):
        n = min(len(buffer), self.size - self.pos)
        if n <= 0:
            return 0
        out = bytearray()
        while len(out) < n:
            index, offset = divmod(self.pos + len(out), self.block)
            out += self._block(index)[offset:offset + n - len(out)]
        buffer[:n] = out
        self.pos += n
        return n


def _text(value):
    return value.decode() if isinstance(value, bytes) else value


def decode(raw, attrs):
    """GAMIC UV8/UV16 to dBZ; 0 is 'no data'."""
    lo, hi = float(_text(attrs['dyn_range_min'])), float(_text(attrs['dyn_range_max']))
    steps = 254 if raw.dtype == np.uint8 else 65534
    dbz = lo + (raw.astype(np.float32) - 1) * (hi - lo) / steps
    dbz[raw == 0] = np.nan
    return dbz


def read_sweep(fileobj):
    """Lowest sweep of a volume: site position, ray azimuths, gate size and dBZ."""
    with h5py.File(fileobj, 'r') as volume:
        lat = float(volume['where'].attrs['lat'])
        lon = float(volume['where'].attrs['lon'])
        scans = sorted((k for k in volume if k.startswith('scan')), key=lambda k: float(volume[k]['how'].attrs['elevation']))
        scan = volume[scans[0]]
        moment = next(scan[k] for k in scan if k.startswith('moment_') and _text(scan[k].attrs.get('moment')) == 'Zh')
        dbz = decode(moment[:], moment.attrs)
        rays = scan['ray_header'][:]
        start, stop = rays['azimuth_start'] % 360, rays['azimuth_stop'] % 360
        azimuth = (start + ((stop - start) % 360) / 2) % 360
        step = float(scan['how'].attrs['range_step'])
    return {'lat': lat, 'lon': lon, 'azimuth': azimuth, 'range_step': step, 'dbz': dbz}


def grid():
    """Latitude and longitude of every pixel centre; rows uniform in Web Mercator."""
    merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    y = np.linspace(merc(radar_store.NORTH), merc(radar_store.SOUTH), HEIGHT, endpoint=False)
    y += (y[1] - y[0]) / 2
    lat = np.degrees(2 * np.arctan(np.exp(y)) - math.pi / 2)
    lon = radar_store.WEST + (np.arange(WIDTH) + 0.5) * (radar_store.EAST - radar_store.WEST) / WIDTH
    return np.meshgrid(lat, lon, indexing='ij')


def sample(sweep, lat, lon):
    """dBZ of the sweep at each pixel (nan outside its coverage)."""
    kx = 111.320 * math.cos(math.radians(sweep['lat']))
    dx = (lon - sweep['lon']) * kx
    dy = (lat - sweep['lat']) * 110.574
    distance = np.hypot(dx, dy) * 1000
    bearing = np.degrees(np.arctan2(dx, dy)) % 360
    order = np.argsort(sweep['azimuth'])
    centres = sweep['azimuth'][order]
    wrapped = np.concatenate([centres - 360, centres, centres + 360])
    right = np.clip(np.searchsorted(wrapped, bearing), 1, len(wrapped) - 1)
    left = right - 1
    nearest = np.where(bearing - wrapped[left] <= wrapped[right] - bearing, left, right)
    gap = np.abs(bearing - wrapped[nearest])
    ray = order[nearest % len(centres)]
    gate = (distance / sweep['range_step']).astype(np.int64)
    ok = (gate < sweep['dbz'].shape[1]) & (gap <= MAX_RAY_GAP)
    out = np.full(lat.shape, np.nan, dtype=np.float32)
    out[ok] = sweep['dbz'][ray[ok], gate[ok]]
    return out


def cell_summary(dbz, lat, lon):
    """[lat, lon, echo_km2, heavy_km2, max_dbz] per radar_store.CELL_DEGREES cell that has echo."""
    step = radar_store.CELL_DEGREES
    # pixel area: a fixed longitude step, rows uniform in Mercator so their height varies with latitude
    width = (radar_store.EAST - radar_store.WEST) / WIDTH * 111.32 * np.cos(np.radians(lat))
    edges = np.degrees(2 * np.arctan(np.exp(np.linspace(
        math.log(math.tan(math.pi / 4 + math.radians(radar_store.NORTH) / 2)),
        math.log(math.tan(math.pi / 4 + math.radians(radar_store.SOUTH) / 2)), HEIGHT + 1))) - math.pi / 2)
    area = width * (np.abs(np.diff(edges)) * 110.574)[:, None]
    with np.errstate(invalid='ignore'):
        echo, heavy = dbz >= MIN_DBZ, dbz >= HEAVY_DBZ
    keys = np.stack([np.round(lat / step), np.round(lon / step)], axis=-1)[echo]
    out = []
    for key in np.unique(keys, axis=0):
        cell = echo & (np.round(lat / step) == key[0]) & (np.round(lon / step) == key[1])
        out.append([round(float(key[0] * step), 2), round(float(key[1] * step), 2), round(float(area[cell].sum())),
                    round(float(area[cell & heavy].sum())), round(float(np.nanmax(dbz[cell])), 1)])
    return out


def composite(sweeps, lat, lon):
    layers = [sample(s, lat, lon) for s in sweeps]
    with np.errstate(all='ignore'):
        stacked = np.stack(layers)
        best = np.where(np.isnan(stacked), -np.inf, stacked).max(axis=0)
    best[np.isinf(best)] = np.nan
    return best


def render(dbz):
    """Transparent PNG bytes; pixels below MIN_DBZ stay clear."""
    rgba = np.zeros(dbz.shape + (4,), dtype=np.uint8)
    for (lower, colour), upper in zip(COLOURS, [c[0] for c in COLOURS[1:]] + [np.inf]):
        mask = (dbz >= lower) & (dbz < upper)
        rgba[mask] = (*colour, ALPHA)
    out = io.BytesIO()
    Image.fromarray(rgba).save(out, 'PNG', optimize=True)
    return out.getvalue()


def sweep_path(directory, name):
    """Where the lowest sweep of a raw volume is kept: sweeps/<SITE>_<epoch>.npz."""
    site = FILE_NAME.fullmatch(name).group(1)
    return Path(directory) / 'sweeps' / f'{site}_{file_time(name)}.npz'


def save_sweep(path, sweep):
    """dBZ in tenths as int16 (-32768 = no data), compressed: about 100 KB a sweep."""
    path.parent.mkdir(parents=True, exist_ok=True)
    dbz10 = np.where(np.isnan(sweep['dbz']), -32768, np.round(sweep['dbz'] * 10)).astype(np.int16)
    tmp = path.with_suffix('.tmp.npz')
    np.savez_compressed(tmp, dbz10=dbz10, azimuth=sweep['azimuth'].astype(np.float32),
                        site=np.array([sweep['lat'], sweep['lon'], sweep['range_step']]))
    tmp.replace(path)


def load_sweep(path):
    with np.load(path) as data:
        lat, lon, step = (float(x) for x in data['site'])
        dbz = data['dbz10'].astype(np.float32) / 10
        dbz[data['dbz10'] == -32768] = np.nan
        return {'lat': lat, 'lon': lon, 'azimuth': data['azimuth'].astype(np.float64), 'range_step': step, 'dbz': dbz}


def sweep_of(directory, name, opener):
    """The lowest sweep of a volume: from the local copy if there is one, else downloaded and kept."""
    path = sweep_path(directory, name)
    if path.is_file():
        try:
            return load_sweep(path)
        except (OSError, ValueError, KeyError):
            logging.warning('Saved sweep %s unreadable, reading the volume again', path.name)
    sweep = read_sweep(opener(FILE_URL + name))
    save_sweep(path, sweep)
    return sweep


def collect(directory, html=None, opener=RangeFile, now=None):
    """Turn every new raw volume into a frame; returns the number of new frames."""
    now = int(time.time()) if now is None else now
    html = html if html is not None else urlopen(Request(LIST_URL, headers=UA), timeout=60).read().decode('utf-8', 'replace')
    conn = radar_store.connect(directory)
    lat, lon = grid()
    made = 0
    try:
        done = {r[0] for r in conn.execute('SELECT name FROM radar_files')}
        files = list_files(html)
        pending = sorted((file_time(n), site, n) for site, names in files.items() for n in names if n not in done)
        latest = {}  # site -> (ts, sweep) of the newest sweep read in this run
        for ts, site, name in pending:
            try:
                sweep = sweep_of(directory, name, opener)
            except HTTPError as error:
                # The page keeps listing volumes the server has already deleted: give up on those
                # once they are old enough that a 404 cannot be an upload still in progress.
                if error.code == 404 and now - ts > GONE_SECONDS:
                    with conn:
                        conn.execute('INSERT OR REPLACE INTO radar_files(name, site, ts, processed) VALUES (?, ?, ?, ?)',
                                     (name, site, ts, now))
                    logging.info('Radar file %s is gone (404), skipped', name)
                else:
                    logging.warning('Radar file %s not read: %s', name, error)
                continue
            except Exception:
                logging.exception('Radar file %s not read', name)
                continue
            latest[site] = (ts, sweep)
            # Pair with the other radar's newest sweep; read it if this run has not.
            for other, names in files.items():
                if other == site or other in latest:
                    continue
                candidates = [n for n in names if abs(file_time(n) - ts) <= PAIR_SECONDS and file_time(n) <= ts]
                if candidates:
                    try:
                        latest[other] = (file_time(candidates[-1]), sweep_of(directory, candidates[-1], opener))
                    except HTTPError as error:
                        logging.warning('Radar file %s not read: %s', candidates[-1], error)
                    except Exception:
                        logging.exception('Radar file %s not read', candidates[-1])
            used = sorted(s for s, (t, _) in latest.items() if 0 <= ts - t <= PAIR_SECONDS)
            field = composite([latest[s][1] for s in used], lat, lon)
            radar_store.frame_path(directory, ts).write_bytes(render(field))
            summary = json.dumps(cell_summary(field, lat, lon), separators=(',', ':'))
            with conn:
                conn.execute('INSERT OR REPLACE INTO radar_frames(ts, sites, cells) VALUES (?, ?, ?)',
                             (ts, ','.join(used), summary))
                conn.execute('INSERT OR REPLACE INTO radar_files(name, site, ts, processed) VALUES (?, ?, ?, ?)',
                             (name, site, ts, now))
            made += 1
        old = now - KEEP_SECONDS
        for (ts,) in conn.execute('SELECT ts FROM radar_frames WHERE ts < ?', (old,)).fetchall():
            radar_store.frame_path(directory, ts).unlink(missing_ok=True)
        with conn:
            conn.execute('DELETE FROM radar_frames WHERE ts < ?', (old,))
            conn.execute('DELETE FROM radar_files WHERE ts < ?', (old - 86400,))
        for path in (Path(directory) / 'sweeps').glob('*.npz'):
            stamp = path.stem.rpartition('_')[2]
            if not stamp.isdigit() or int(stamp) < old:
                path.unlink(missing_ok=True)
    finally:
        conn.close()
    return made


def main():
    parser = argparse.ArgumentParser(description='CyDoM rain radar frames')
    parser.add_argument('--dir', required=True, help='frames directory (radar.sqlite3 lives there too)')
    parser.add_argument('--loop', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            made = collect(args.dir)
            if made:
                logging.info('Radar frames added: %d', made)
        except Exception:
            logging.exception('Radar collection failed')
            if not args.loop:
                raise
        if not args.loop:
            break
        time.sleep(LOOP_SECONDS)


if __name__ == '__main__':
    main()
