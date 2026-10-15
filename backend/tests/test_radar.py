import io
import json
import threading
from urllib.error import HTTPError
from urllib.request import urlopen

import h5py
import numpy as np
import pytest
from PIL import Image

import radar
import radar_store
from server import make_server

LCA = (34.93654, 33.56654)


def volume(lat, lon, cell=None, rays=360, gates=2500, step=100.0, first_azimuth=0.0):
    """A minimal GAMIC-like volume: two sweeps, Zh as UV16, optional rain cell (azimuth, km, dBZ)."""
    buffer = io.BytesIO()
    with h5py.File(buffer, 'w') as f:
        f.create_group('where').attrs.update({'lat': lat, 'lon': lon, 'height': 100.0})
        for index, elevation in ((1, 5.0), (0, 0.5)):
            scan = f.create_group(f'scan{index}')
            scan.create_group('how').attrs.update({'elevation': elevation, 'range_step': step})
            start = (first_azimuth + np.arange(rays)) % 360
            header = np.zeros(rays, dtype=[('azimuth_start', '<f8'), ('azimuth_stop', '<f8')])
            header['azimuth_start'], header['azimuth_stop'] = start, (start + 1) % 360
            scan.create_dataset('ray_header', data=header)
            raw = np.zeros((rays, gates), dtype=np.uint16)
            if cell and index == 0:
                azimuth, km, dbz = cell
                ray = int((azimuth - first_azimuth) % 360)
                gate = int(km * 1000 / step)
                raw[ray - 2:ray + 3, gate - 20:gate + 20] = round((dbz + 64) * 65534 / 192 + 1)
            data = scan.create_dataset('moment_0', data=raw)
            data.attrs.update({'moment': b'Zh', 'dyn_range_min': b'-64.0', 'dyn_range_max': b'128.0'})
            scan.create_dataset('moment_1', data=raw).attrs.update({'moment': b'Zv'})
    buffer.seek(0)
    return buffer


def pixel_of(lat, lon, grid):
    glat, glon = grid
    return np.unravel_index(np.argmin((glat - lat) ** 2 + (glon - lon) ** 2), glat.shape)


def test_lowest_sweep_is_decoded_with_azimuths_and_gates():
    sweep = radar.read_sweep(volume(*LCA, cell=(0, 50, 40), first_azimuth=71))
    assert sweep['lat'] == pytest.approx(LCA[0]) and sweep['range_step'] == 100
    assert np.nanmax(sweep['dbz']) == pytest.approx(40, abs=0.01)
    assert np.isnan(sweep['dbz'][0, 0])
    assert sweep['azimuth'][0] == pytest.approx(71.5)


def test_a_cell_north_of_the_radar_lands_north_on_the_map():
    grid = radar.grid()
    sweep = radar.read_sweep(volume(*LCA, cell=(0, 50, 45), first_azimuth=200))
    field = radar.sample(sweep, *grid)
    row, col = np.unravel_index(np.nanargmax(field), field.shape)
    expected = pixel_of(LCA[0] + 50 / 110.574, LCA[1], grid)
    assert abs(row - expected[0]) <= 3 and abs(col - expected[1]) <= 3
    assert np.nanmax(field) == pytest.approx(45, abs=0.01)


def test_composite_keeps_the_stronger_echo_and_render_is_transparent_elsewhere():
    grid = radar.grid()
    weak = radar.read_sweep(volume(*LCA, cell=(90, 40, 20)))
    strong = radar.read_sweep(volume(*LCA, cell=(90, 40, 52)))
    field = radar.composite([weak, strong], *grid)
    assert np.nanmax(field) == pytest.approx(52, abs=0.01)
    image = np.array(Image.open(io.BytesIO(radar.render(field))))
    assert image.shape == (radar.HEIGHT, radar.WIDTH, 4)
    assert image[..., 3].max() == radar.ALPHA and (image[..., 3] == 0).mean() > 0.99
    assert tuple(image[image[..., 3] > 0][0][:3]) == radar.COLOURS[7][1]  # 50-55 dBZ


def test_collect_pairs_both_radars_and_skips_known_files(tmp_path):
    names = {'LONGRANGE_LCA_20261015085950_00.h5': volume(*LCA, cell=(0, 30, 35)),
             'LONGRANGE_PFO_20261015090228_00.h5': volume(34.81, 32.43, cell=(180, 30, 45))}
    html = ' '.join(f'<a href="/uploads/radars/{n}">{n}</a>' for n in names)
    opener = lambda url: names[url.rsplit('/', 1)[-1]]
    now = radar.file_time('LONGRANGE_PFO_20261015090228_00.h5') + 600
    assert radar.collect(str(tmp_path), html=html, opener=opener, now=now) == 2
    for buffer in names.values():
        buffer.seek(0)
    assert radar.collect(str(tmp_path), html=html, opener=opener, now=now) == 0
    frames = radar_store.frames(str(tmp_path), 0, 2 ** 40)['frames']
    assert [f['sites'] for f in frames] == [['LCA'], ['LCA', 'PFO']]
    assert radar_store.frame_path(str(tmp_path), frames[-1]['ts']).is_file()


def test_api_lists_frames_and_serves_images(tmp_path):
    db = str(tmp_path / 'w.db')
    directory = radar_store.default_dir(db)
    conn = radar_store.connect(directory)
    with conn:
        conn.execute('INSERT INTO radar_frames VALUES (?, ?)', (1792054232, 'LCA,PFO'))
    conn.close()
    radar_store.frame_path(directory, 1792054232).write_bytes(b'\x89PNG test')
    server = make_server('127.0.0.1', 0, db, str(tmp_path / 'ai'))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}/api'
    try:
        with urlopen(base + '/weather/radar?from=1792050000&to=1792060000') as response:
            data = json.load(response)
        assert data['frames'] == [{'ts': 1792054232, 'sites': ['LCA', 'PFO']}] and data['bounds'] == radar_store.BOUNDS
        with urlopen(base + '/radar/1792054232.png') as response:
            assert response.headers['Content-Type'] == 'image/png' and response.read() == b'\x89PNG test'
        for bad in ('/radar/../weather.db', '/radar/123.png', '/radar/1792054232.jpg'):
            with pytest.raises(HTTPError) as error:
                urlopen(base + bad)
            assert error.value.code == 404
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
