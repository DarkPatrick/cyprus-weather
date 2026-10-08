import json
import threading
import urllib.error
import urllib.request
from datetime import datetime

import pytest

from cyprus_weather import agg, weather

T = lambda *a: int(datetime(*a, tzinfo=weather.LOCAL_TZ).timestamp())


def test_auto_kind_by_span():
    day = 86400
    assert [agg.auto_kind(s * day) for s in (0, 1, 2, 7, 27, 30, 365, 800, 3650)] == \
        ["raw", "raw", "raw", "hour", "hour", "day", "day", "week", "month"]


def test_local_calendar_buckets():
    t = T(2026, 10, 7, 15, 40)  # a Wednesday, EEST
    assert agg.bucket(t, "hour") == T(2026, 10, 7, 15)
    assert agg.bucket(t, "day") == T(2026, 10, 7)
    assert agg.bucket(t, "week") == T(2026, 10, 5)  # Monday
    assert agg.bucket(t, "month") == T(2026, 10, 1)
    assert agg.bucket(t, "year") == T(2026, 1, 1)
    assert agg.bucket(T(2026, 3, 1, 1), "month") == T(2026, 3, 1)  # winter time, +02:00


def test_aggregate_mean_median_sum_max_circular():
    ts = [T(2026, 10, 7, h) for h in (0, 6, 12, 18)] + [T(2026, 10, 8, 0)]
    data = {"ts": ts, "temp": [10.0, 20.0, 30.0, 100.0, 5.0], "rain": [1.0, None, 2.5, 0.0, None],
            "rain24": [1.0, 1.0, 3.5, 3.5, 0.0], "wdir": [350.0, 10.0, None, None, 90.0], "empty": [],
            "meta": {"x": 1}}
    d = agg.aggregate(data, "day", sums={"rain"}, maxes={"rain24"}, circular={"wdir"})
    assert d["agg"] == "day" and d["step"] == 86400 and d["ts"] == [T(2026, 10, 7), T(2026, 10, 8)]
    assert d["temp"] == [40.0, 5.0] and d["rain"] == [3.5, None] and d["rain24"] == [3.5, 0.0]
    assert d["wdir"] == [0.0, 90.0]  # 350° and 10° average to north, not 180°
    assert d["empty"] == [] and d["meta"] == {"x": 1}
    assert agg.aggregate(data, "day", "median")["temp"] == [25.0, 5.0]
    raw = agg.aggregate(data, "auto")
    assert raw["agg"] == "raw" and raw["temp"] == data["temp"]
    with pytest.raises(ValueError):
        agg.aggregate(data, "fortnight")


