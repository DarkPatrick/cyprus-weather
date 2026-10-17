"""Health check for the Kairo backend with ntfy push alerts.

Checks that the API answers and that observations are fresh, both in the app's mirror
and in the aranet4 source DB (their ages tell a broken sync from a broken collector), and
that the AI forecast (made by aranet4's own job, 4 times a day) is not stale.
One alert when a problem starts, a reminder every REMIND_SECONDS, and a recovery
message. The ntfy topic comes from NTFY_TOPIC (kept on the server, not in the repo).

    python backend/monitor.py --db /var/lib/cyprus-weather/weather.db \
        --source /home/aranet/weather/weather.db --state /var/lib/cyprus-weather/monitor-state.json
"""
import argparse
import json
import logging
import os
import socket
import sqlite3
import time
from pathlib import Path
from urllib.request import Request, urlopen

STALE_SECONDS = 3600  # the app stops showing current values after one hour
REMIND_SECONDS = 6 * 3600
# AI forecast runs at 05:40, 11:40, 16:40 and 22:40 Cyprus time: the longest normal gap is 7 h.
AI_STALE_SECONDS = 8 * 3600


def newest_observation(path):
    conn = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=30)
    try:
        return conn.execute('SELECT MAX(ts) FROM observations').fetchone()[0]
    finally:
        conn.close()


def ai_issued(directory):
    """Issue time of the latest AI forecast; None when there is none or it is unreadable."""
    try:
        return int(json.loads((Path(directory) / 'latest.json').read_text())['issued'])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def api_ok(url):
    try:
        with urlopen(url, timeout=20) as response:
            return response.status == 200
    except Exception:
        return False


def problems(now, mirror_ts, source_ts, api_up, ai_ts=...):
    """Human-readable problems, empty when healthy (ai_ts left out: the AI forecast is not checked)."""
    age = lambda ts: 'no data' if ts is None else f'{(now - ts) // 60} min old'
    found = []
    if not api_up:
        found.append('API is not answering')
    if mirror_ts is None or now - mirror_ts > STALE_SECONDS:
        where = ('sync from aranet4 is broken' if source_ts is not None and now - source_ts <= STALE_SECONDS
                 else 'the aranet4 collector is not updating either')
        found.append(f'App data {age(mirror_ts)}, source {age(source_ts)}: {where}')
    if ai_ts is not ... and (ai_ts is None or now - ai_ts > AI_STALE_SECONDS):
        found.append('AI forecast missing' if ai_ts is None else
                     f'AI forecast {(now - ai_ts) // 3600} h old: aranet-ai-forecast runs are failing')
    return found


def decide(state, found, now):
    """Return (message or None, new state) for the current check."""
    if found:
        text = '; '.join(found)
        if not state.get('failing') or now - state.get('alerted', 0) >= REMIND_SECONDS or text != state.get('text'):
            first = not state.get('failing')
            title = 'Kairo backend problem' if first else 'Kairo backend still failing'
            return {'title': title, 'text': text, 'priority': 'high'}, {
                'failing': True, 'since': state.get('since', now) if not first else now, 'alerted': now, 'text': text}
        return None, state
    if state.get('failing'):
        minutes = (now - state.get('since', now)) // 60
        return {'title': 'Kairo backend recovered', 'text': f'All checks pass again after {minutes} min.',
                'priority': 'default'}, {'failing': False}
    return None, state


def send(topic, message, server='https://ntfy.sh'):
    request = Request(f'{server.rstrip("/")}/{topic}', data=message['text'].encode(), method='POST',
                      headers={'Title': message['title'], 'Priority': message['priority'], 'Tags': 'cloud'})
    # ntfy.sh rate-limits anonymous publishing per IPv6 /64, and hosting providers share
    # those subnets (the droplet's IPv6 quota is exhausted by neighbours): use IPv4 only.
    resolve = socket.getaddrinfo
    socket.getaddrinfo = lambda *a, **k: [r for r in resolve(*a, **k) if r[0] == socket.AF_INET]
    try:
        with urlopen(request, timeout=20) as response:
            response.read()
    finally:
        socket.getaddrinfo = resolve


def main():
    parser = argparse.ArgumentParser(description='Kairo backend health check with ntfy alerts')
    parser.add_argument('--db', required=True, help="the app's mirror DB")
    parser.add_argument('--source', help='aranet4 source DB (for diagnosis)')
    parser.add_argument('--api', default='http://127.0.0.1:8092/api/health')
    parser.add_argument('--ai-dir', help="the AI forecast directory (latest.json); checked when given")
    parser.add_argument('--state', required=True)
    parser.add_argument('--dry-run', action='store_true', help='print instead of sending')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    now = int(time.time())
    read = lambda path: newest_observation(path) if path and Path(path).is_file() else None
    try:
        mirror_ts = read(args.db)
    except sqlite3.Error:
        mirror_ts = None
    try:
        source_ts = read(args.source)
    except sqlite3.Error:
        source_ts = None
    found = problems(now, mirror_ts, source_ts, api_ok(args.api),
                     *([ai_issued(args.ai_dir)] if args.ai_dir else []))
    state_path = Path(args.state)
    state = json.loads(state_path.read_text()) if state_path.is_file() else {}
    message, state = decide(state, found, now)
    logging.info('checks: %s', '; '.join(found) or 'ok')
    if message:
        if args.dry_run:
            print(json.dumps(message))
        else:
            topic = os.environ.get('NTFY_TOPIC')
            if not topic:
                raise SystemExit('NTFY_TOPIC is not set')
            send(topic, message, os.environ.get('NTFY_SERVER', 'https://ntfy.sh'))
            logging.info('sent: %s', message['title'])
    if not args.dry_run:
        state_path.write_text(json.dumps(state))


if __name__ == '__main__':
    main()
