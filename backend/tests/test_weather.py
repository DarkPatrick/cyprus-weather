import json
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pytest

from aranet_monitor import weather

SAMPLE = (Path(__file__).parent / "fixtures" / "cydom_sample.xml").read_bytes()
# 2026-10-03 20:20 EEST (UTC+3) = 17:20 UTC
SAMPLE_TS = int(datetime(2026, 10, 3, 17, 20, tzinfo=timezone.utc).timestamp())


def test_parse_sample():
    stations, rows = weather.parse(SAMPLE, now=SAMPLE_TS)
    assert {s[0] for s in stations} == {"ACHNA", "AMARGETI", "LCLK"}
    by = {r["station"]: r for r in rows}
    a = by["ACHNA"]
    assert a["ts"] == SAMPLE_TS
    assert (a["temp"], a["rh"], a["rain"], a["wind2"], a["wdir"]) == (20.9, 70, 0.0, 0.3, 293)
    assert a["wind10"] == pytest.approx(1.5 * 0.514444, abs=1e-3)  # knots -> m/s
    assert a["extra"] is None
    assert by["AMARGETI"]["p_station"] == 966.7
    lclk = by["LCLK"]
    assert lclk["p_qnh"] == 1018.2 and lclk["wind10"] is None
    assert json.loads(lclk["extra"]) == {
        "Wind Speed (10m) at Runway 22 [Knots]": 2.4,
        "Wind Direction (10m) at Runway 22 [Degrees]": 317.0,
    }


def test_dst_end_ambiguous_hour_picks_closest():
    # 2026-10-25 03:30 EEST -> 04:00 back to 03:00 EET: 03:30 local happens twice
    first = int(datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc).timestamp())   # 03:30 EEST
    second = int(datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc).timestamp())  # 03:30 EET
    text = "2026-10-25 03:30 (Local Time)"
    assert weather.local_to_epoch(text, near=first + 60) == first
    assert weather.local_to_epoch(text, near=second + 60) == second


def test_store_dedupes_repeated_polls(tmp_path):
    conn = weather.connect(str(tmp_path / "w.db"))
    stations, rows = weather.parse(SAMPLE, now=SAMPLE_TS)
    assert weather.store(conn, stations, rows) == 3
    assert weather.store(conn, stations, rows) == 0  # same 10-minute values again
    later = [dict(r, ts=r["ts"] + 600, temp=21.5) for r in rows[:1]]
    assert weather.store(conn, stations, later) == 1
    data = weather.readings(conn, "ACHNA")
    assert data["ts"] == [SAMPLE_TS, SAMPLE_TS + 600] and data["temp"] == [20.9, 21.5]
    assert weather.readings(conn, "ACHNA", SAMPLE_TS + 1)["temp"] == [21.5]


def test_station_list(tmp_path):
    conn = weather.connect(str(tmp_path / "w.db"))
    weather.store(conn, *weather.parse(SAMPLE, now=SAMPLE_TS))
    st = {s["code"]: s for s in weather.station_list(conn)}
    assert st["AMARGETI"]["latest"]["p_station"] == 966.7
    assert "p_station" in st["AMARGETI"]["metrics"] and "p_station" not in st["ACHNA"]["metrics"]
    assert st["ACHNA"]["lat"] == pytest.approx(35.0255, abs=1e-3)
    assert st["ACHNA"]["first"] == SAMPLE_TS


def test_collect_once_uses_etag(monkeypatch, tmp_path):
    calls = []

    def fake_fetch(url, etag, timeout=30):
        calls.append(etag)
        return (SAMPLE, '"v1"') if etag is None else (None, etag)

    monkeypatch.setattr(weather, "fetch", fake_fetch)
    monkeypatch.setattr(weather.time, "time", lambda: SAMPLE_TS + 120)
    path = str(tmp_path / "w.db")
    assert weather.collect_once(path) == 3
    assert weather.collect_once(path) == 0
    assert calls == [None, '"v1"']




