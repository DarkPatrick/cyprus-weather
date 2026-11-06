"""Fallback for a radar whose raw volumes CyDoM stops publishing: read its MAX image instead.

dom.org.cy keeps a column-maximum picture per radar (RADAR_<SITE>_MAX_Static.png): reflectivity
in 5 dBZ colour steps on an azimuthal map centred on the radar. The radar sits at a fixed pixel
and the scale is fixed; both were fitted against the raw volumes of the same moment (2026-11-06
Paphos 14:10, IoU of echo 0.41; Larnaca 2026-11-04 05:36). Each image becomes a pseudo-sweep
(polar, 1 degree x 500 m, dBZ = middle of the colour step), saved beside the raw sweeps as
sweeps/<SITE>img_<epoch>.npz, so the rest of the pipeline treats it like a radar.

Images are re-saved every 15 minutes even when the radar is down (Larnaca's kept showing
04.11 05:36 for days), so freshness comes from the image itself: only a picture whose time
label (its top-right corner) changed while we watched is used, stamped with the moment it
changed (the file's Last-Modified).
"""
import calendar
import email.utils
import hashlib
import io
import logging
import time
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image

import radar
import radar_store

BASE = 'https://www.dom.org.cy/RADAR_IMG/'
# site -> (image, radar pixel (x, y), km per pixel, radar position (lat, lon) from its raw volumes)
SITES = {'LCA': ('RADAR_LCA_MAX_Static.png', (366.0, 318.0), 0.965, (34.93654, 33.56654)),
         'PFO': ('RADAR_PFO_MAX_Static.png', (269.5, 336.5), 0.975, (34.77085, 32.54716))}
PANEL = (5, 90, 712, 510)            # x0, y0, x1, y1 of the map panel (cross-sections are outside)
LABEL = (495, 86, 715, 108)          # the "Gamic HDF5 Polar <SITE>: dd.mm.yyyy HH:MM" box
LEGEND = [((0, 162, 240), 5), ((0, 255, 255), 10), ((0, 116, 0), 15), ((0, 161, 0), 20), ((51, 255, 0), 25),
          ((28, 255, 0), 30), ((129, 242, 9), 35), ((255, 242, 7), 40), ((254, 184, 41), 45), ((249, 157, 76), 50),
          ((200, 44, 59), 55), ((255, 0, 0), 60), ((150, 0, 162), 65), ((255, 0, 255), 70)]
COLOUR_TOLERANCE = 12                # squared RGB distance: the echo colours are drawn flat
GATE_M, RANGE_KM = 500.0, 300.0
SCHEMA = """CREATE TABLE IF NOT EXISTS radar_images (
    site TEXT PRIMARY KEY, label TEXT NOT NULL, since INTEGER NOT NULL, stored INTEGER)"""


def decode(rgb):
    """dBZ per panel pixel (nan = no echo), from the legend colours."""
    x0, y0, x1, y1 = PANEL
    panel = np.asarray(rgb, dtype=np.int32)[y0:y1, x0:x1]
    colours = np.array([c for c, _ in LEGEND])
    dist = ((panel[:, :, None, :] - colours[None, None]) ** 2).sum(-1)
    nearest = dist.argmin(-1)
    values = np.array([lo + 2.5 for _, lo in LEGEND], dtype=np.float32)[nearest]
    return np.where(dist.min(-1) <= COLOUR_TOLERANCE, values, np.nan).astype(np.float32)


def to_sweep(site, rgb):
    """Pseudo-sweep (360 rays x RANGE_KM / GATE_M gates) read off the image."""
    _, (cx, cy), kmpp, (lat, lon) = SITES[site]
    field = decode(rgb)
    x0, y0, x1, y1 = PANEL
    azimuth = np.arange(360) + 0.5
    rng = (np.arange(int(RANGE_KM * 1000 / GATE_M)) + 0.5) * GATE_M / 1000
    az, r = np.meshgrid(np.radians(azimuth), rng, indexing='ij')
    px = np.round(cx + r / kmpp * np.sin(az)).astype(int) - x0
    py = np.round(cy - r / kmpp * np.cos(az)).astype(int) - y0
    inside = (px >= 0) & (py >= 0) & (px < x1 - x0) & (py < y1 - y0)
    dbz = np.full(az.shape, np.nan, dtype=np.float32)
    dbz[inside] = field[py[inside], px[inside]]
    return {'lat': lat, 'lon': lon, 'azimuth': azimuth, 'range_step': GATE_M, 'dbz': dbz}


def label_hash(rgb):
    x0, y0, x1, y1 = LABEL
    return hashlib.sha1(np.ascontiguousarray(np.asarray(rgb)[y0:y1, x0:x1]).tobytes()).hexdigest()


def image_path(directory, site, ts):
    return Path(directory) / 'sweeps' / f'{site}img_{int(ts)}.npz'


def fetch(name):
    with urlopen(Request(BASE + name, headers=radar.UA), timeout=60) as response:
        modified = response.headers.get('Last-Modified')
        data = response.read()
    ts = calendar.timegm(email.utils.parsedate(modified)) if modified else int(time.time())
    return Image.open(io.BytesIO(data)).convert('RGB'), ts


def stamps(directory, site):
    """{epoch: path} of the stored image pseudo-sweeps of one radar."""
    out = {}
    for path in (Path(directory) / 'sweeps').glob(f'{site}img_*.npz'):
        stamp = path.stem.rpartition('_')[2]
        if stamp.isdigit():
            out[int(stamp)] = path
    return out


def poll(directory, site, now=None, fetcher=None):
    """Store a new pseudo-sweep when the site's image shows a new moment; returns its epoch or None."""
    now = int(time.time()) if now is None else now
    image, modified = (fetcher or fetch)(SITES[site][0])
    label = label_hash(image)
    conn = radar_store.connect(directory)
    try:
        conn.executescript(SCHEMA)
        row = conn.execute('SELECT label FROM radar_images WHERE site=?', (site,)).fetchone()
        if row and row[0] == label:
            return None  # the same moment as before: already stored, or a frozen picture
        with conn:
            conn.execute('INSERT OR REPLACE INTO radar_images(site, label, since, stored) VALUES (?, ?, ?, NULL)',
                         (site, label, now))
        if row is None:
            return None  # first sight: a live picture cannot be told from a frozen one yet
        ts = min(modified, now)
        radar.save_sweep(image_path(directory, site, ts), to_sweep(site, image))
        with conn:
            conn.execute('UPDATE radar_images SET stored=? WHERE site=?', (ts, site))
        logging.info('Radar %s from its image at %s', site, time.strftime('%H:%M', time.gmtime(ts)))
        return ts
    finally:
        conn.close()
