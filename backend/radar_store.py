"""Rain radar frames as the API sees them: where they live and which exist.

The collector (backend/radar.py, with h5py/numpy/Pillow) writes one transparent PNG per
frame plus a row in radar.sqlite3. This module only reads them, so the API process needs
no scientific libraries.
"""
import json
import re
import sqlite3
from pathlib import Path

# Image bounds, south-west and north-east corners. Rows of the PNG are uniform in Web
# Mercator, so Leaflet's imageOverlay places every pixel where it belongs.
SOUTH, WEST, NORTH, EAST = 33.3, 30.9, 36.6, 35.9
BOUNDS = [[SOUTH, WEST], [NORTH, EAST]]
FRAME_NAME = re.compile(r'\d{10}')
SCHEMA = """CREATE TABLE IF NOT EXISTS radar_frames (
    ts INTEGER PRIMARY KEY, sites TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS radar_files (
    name TEXT PRIMARY KEY, site TEXT NOT NULL, ts INTEGER NOT NULL, processed INTEGER NOT NULL);"""
CELL_DEGREES = 0.5


def default_dir(db):
    return str(Path(db).parent / 'radar')


def frame_path(directory, ts):
    return Path(directory) / f'{int(ts)}.png'


def connect(directory, readonly=False):
    path = Path(directory) / 'radar.sqlite3'
    if readonly:
        return sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=10)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript(SCHEMA)
    for column in ('cells TEXT', 'rev INTEGER'):  # added after the first frames were written
        try:
            conn.execute(f'ALTER TABLE radar_frames ADD COLUMN {column}')
        except sqlite3.OperationalError:
            pass
    return conn


def frames(directory, start, end):
    """Frames with timestamps in [start, end], oldest first."""
    if not (Path(directory) / 'radar.sqlite3').is_file():
        return {'available': False, 'bounds': BOUNDS, 'frames': []}
    conn = connect(directory, readonly=True)
    try:
        rows = conn.execute('SELECT ts, sites, rev FROM radar_frames WHERE ts BETWEEN ? AND ? ORDER BY ts',
                            (start, end)).fetchall()
    except sqlite3.OperationalError:
        rows = []
    finally:
        conn.close()
    # rev changes when a frame is redrawn: the client adds it to the (long-cached) image URL.
    return {'available': True, 'bounds': BOUNDS,
            'frames': [{'ts': ts, 'sites': sites.split(','), 'rev': rev} for ts, sites, rev in rows]}


def cells(directory, start, end):
    """Per-cell echo summary of the frames in [start, end], oldest first: what the AI forecast reads.

    Each cell is [lat, lon, echo_km2, heavy_km2, max_dbz] for a CELL_DEGREES square (centre),
    echo meaning at least radar.MIN_DBZ and heavy at least radar.HEAVY_DBZ; cells without echo
    are left out, so an empty list is a frame with no rain anywhere in range.
    """
    if not (Path(directory) / 'radar.sqlite3').is_file():
        return {'available': False, 'cell_degrees': CELL_DEGREES, 'frames': []}
    conn = connect(directory, readonly=True)
    try:
        rows = conn.execute('SELECT ts, sites, cells FROM radar_frames WHERE ts BETWEEN ? AND ? AND cells IS NOT NULL '
                            'ORDER BY ts', (start, end)).fetchall()
    except sqlite3.OperationalError:
        rows = []
    finally:
        conn.close()
    return {'available': True, 'cell_degrees': CELL_DEGREES,
            'frames': [{'ts': ts, 'sites': sites.split(','), 'cells': json.loads(c)} for ts, sites, c in rows]}


def frame_bytes(directory, name):
    """PNG bytes for '<ts>.png', or None."""
    stem = name[:-4] if name.endswith('.png') else None
    if not stem or not FRAME_NAME.fullmatch(stem):
        return None
    path = frame_path(directory, stem)
    return path.read_bytes() if path.is_file() else None
