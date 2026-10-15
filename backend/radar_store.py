"""Rain radar frames as the API sees them: where they live and which exist.

The collector (backend/radar.py, with h5py/numpy/Pillow) writes one transparent PNG per
frame plus a row in radar.sqlite3. This module only reads them, so the API process needs
no scientific libraries.
"""
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
    return conn


def frames(directory, start, end):
    """Frames with timestamps in [start, end], oldest first."""
    if not (Path(directory) / 'radar.sqlite3').is_file():
        return {'available': False, 'bounds': BOUNDS, 'frames': []}
    conn = connect(directory, readonly=True)
    try:
        rows = conn.execute('SELECT ts, sites FROM radar_frames WHERE ts BETWEEN ? AND ? ORDER BY ts',
                            (start, end)).fetchall()
    except sqlite3.OperationalError:
        rows = []
    finally:
        conn.close()
    return {'available': True, 'bounds': BOUNDS,
            'frames': [{'ts': ts, 'sites': sites.split(',')} for ts, sites in rows]}


def frame_bytes(directory, name):
    """PNG bytes for '<ts>.png', or None."""
    stem = name[:-4] if name.endswith('.png') else None
    if not stem or not FRAME_NAME.fullmatch(stem):
        return None
    path = frame_path(directory, stem)
    return path.read_bytes() if path.is_file() else None
