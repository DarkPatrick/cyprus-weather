"""Anonymous app-open log: a random per-install id and the server time, nothing else.

No IP address, device data or location is stored. The log lives in its own SQLite file,
separate from the weather mirror. Stats: python backend/visits.py stats --db <weather.db>
"""
import argparse
import re
import sqlite3
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCHEMA = """CREATE TABLE IF NOT EXISTS visits (
    anonymous_id TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS visits_id_ts ON visits(anonymous_id, ts);
    CREATE INDEX IF NOT EXISTS visits_ts ON visits(ts);"""
# crypto.randomUUID() on the client: a lowercase version 4 UUID.
ANONYMOUS_ID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
# Repeated opens of one install within this window count once (double launches, retries).
DEDUPE_SECONDS = 60
# Opens older than this are deleted (the retention period stated in the privacy policy).
RETENTION_SECONDS = 730 * 86400
TZ = ZoneInfo('Asia/Nicosia')


def default_path(db):
    return str(Path(db).parent / 'analytics' / 'visits.sqlite3')


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript(SCHEMA)
    return conn


def valid_id(anonymous_id):
    return bool(ANONYMOUS_ID.fullmatch(anonymous_id or ''))


def record(path, anonymous_id, ts):
    """Store one open; returns False for a duplicate within DEDUPE_SECONDS."""
    if not valid_id(anonymous_id):
        raise ValueError('Invalid anonymous id')
    conn = connect(path)
    try:
        with conn:
            recent = conn.execute('SELECT 1 FROM visits WHERE anonymous_id=? AND ts>? AND ts<?',
                                  (anonymous_id, ts - DEDUPE_SECONDS, ts + DEDUPE_SECONDS)).fetchone()
            if recent:
                return False
            conn.execute('INSERT INTO visits(anonymous_id, ts) VALUES (?, ?)', (anonymous_id, ts))
            conn.execute('DELETE FROM visits WHERE ts<?', (ts - RETENTION_SECONDS,))
            return True
    finally:
        conn.close()


def daily(path, days=30, now=None):
    """Opens and unique installs per Asia/Nicosia day, newest first."""
    now = int(time.time()) if now is None else now
    conn = connect(path)
    try:
        rows = conn.execute('SELECT anonymous_id, ts FROM visits WHERE ts>=?', (now - (days + 1) * 86400,)).fetchall()
    finally:
        conn.close()
    opens, users = defaultdict(int), defaultdict(set)
    for anonymous_id, ts in rows:
        day = datetime.fromtimestamp(ts, TZ).date().isoformat()
        opens[day] += 1
        users[day].add(anonymous_id)
    return [(day, opens[day], len(users[day])) for day in sorted(opens, reverse=True)[:days]]


def totals(path):
    conn = connect(path)
    try:
        return conn.execute('SELECT COUNT(*), COUNT(DISTINCT anonymous_id), MIN(ts), MAX(ts) FROM visits').fetchone()
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description='Anonymous app-open statistics')
    parser.add_argument('command', choices=['stats'])
    parser.add_argument('--db', default='data/weather.db', help='weather DB; the log sits next to it')
    parser.add_argument('--visits-db', help='explicit visits log path')
    parser.add_argument('--days', type=int, default=30)
    args = parser.parse_args()
    path = args.visits_db or default_path(args.db)
    opens, installs, first, last = totals(path)
    fmt = lambda ts: datetime.fromtimestamp(ts, TZ).strftime('%Y-%m-%d %H:%M') if ts else '—'
    print(f'{path}\nopens {opens} · unique installs {installs} · {fmt(first)} — {fmt(last)} (Asia/Nicosia)\n')
    print('day         opens  installs')
    for day, day_opens, day_installs in daily(path, args.days):
        print(f'{day}  {day_opens:5}  {day_installs:8}')


if __name__ == '__main__':
    main()
