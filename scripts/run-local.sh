#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f config.env ]; then
    set -a
    . ./config.env
    set +a
fi
.venv/bin/python backend/server.py &
api_pid=$!
if [ -n "${WEATHER_SSH_HOST:-}" ]; then
    .venv/bin/python backend/remote_sync.py --host "$WEATHER_SSH_HOST" --source "$WEATHER_REMOTE_DB" --remote-ai "$WEATHER_REMOTE_AI" --loop &
    collector_pid=$!
    .venv/bin/python backend/collect.py --source hourly_weather --loop &
    model_pid=$!
else
    .venv/bin/python backend/collect.py --loop &
    collector_pid=$!
    model_pid=""
fi
trap 'kill "$api_pid" "$collector_pid" ${model_pid:+"$model_pid"} 2>/dev/null || true' EXIT INT TERM
npm run dev
