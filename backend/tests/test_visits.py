import threading
from urllib.error import HTTPError
from urllib.request import urlopen

import pytest

import visits
from server import make_server

ID = '0f8fad5b-d9cb-469f-a165-70867728950e'


def test_record_dedupes_and_counts_per_nicosia_day(tmp_path):
    path = str(tmp_path / 'analytics' / 'visits.sqlite3')
    day = 1791493200  # 2026-10-09 00:00 Asia/Nicosia (21:00 UTC the day before)
    assert visits.record(path, ID, day + 3600)
    assert not visits.record(path, ID, day + 3600 + visits.DEDUPE_SECONDS - 1)
    assert visits.record(path, ID, day + 7200)
    assert visits.record(path, ID.replace('0f8f', '1f8f'), day + 7300)
    assert visits.record(path, ID, day - 60)  # 23:59 the previous local day
    rows = visits.daily(path, now=day + 86400)
    assert rows == [('2026-10-09', 3, 2), ('2026-10-08', 1, 1)]
    assert visits.totals(path)[:2] == (4, 2)
    with pytest.raises(ValueError):
        visits.record(path, 'not-an-id', day)


def test_visit_endpoint_stores_only_valid_ids_and_is_never_cached(tmp_path):
    db = str(tmp_path / 'w.db')
    server = make_server('127.0.0.1', 0, db, str(tmp_path / 'ai'))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}/api/visit'
    try:
        with urlopen(base + '?id=' + ID) as response:
            assert response.status == 204 and response.headers['Cache-Control'] == 'no-store'
        with pytest.raises(HTTPError) as error:
            urlopen(base + '?id=../../etc')
        assert error.value.code == 400
        assert visits.totals(visits.default_path(db))[:2] == (1, 1)
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
