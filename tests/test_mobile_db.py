import os
import tempfile

import numpy as np

from ad_astra.mobile_db import (
    AdbHeader,
    FormatError,
    read_adb_all_patterns,
    read_adb_all_stars,
    read_adb_header,
    read_adb_pattern,
    read_adb_star,
    write_adb,
)


def _make_test_data():
    star_catalog_ids = np.array([1001, 1002, 1003, 1004, 1005], dtype=np.uint32)
    star_table = np.array([
        [0.1, 0.2, 0.9, 0.1, 0.2, 3.5],
        [0.3, 0.4, 0.8, 0.2, 0.3, 4.0],
        [0.5, 0.6, 0.7, 0.3, 0.4, 5.0],
        [0.7, 0.8, 0.6, 0.4, 0.5, 6.0],
        [0.9, 1.0, 0.5, 0.5, 0.6, 7.0],
    ], dtype=np.float32)
    pattern_catalog = np.array([
        [0, 1, 2, 3],
        [1, 2, 3, 4],
        [0, 2, 4, 1],
    ], dtype=np.uint16)
    properties = {
        "min_fov": 10.0,
        "max_fov": 30.0,
        "star_max_magnitude": 7.0,
        "epoch_equinox": 2000,
        "pattern_size": 4,
        "pattern_bins": 50,
    }
    return star_catalog_ids, star_table, pattern_catalog, properties


def test_write_read_header():
    ids, stars, patterns, props = _make_test_data()
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        hdr = read_adb_header(path)
        assert hdr.version == 1
        assert hdr.n_stars == 5
        assert hdr.n_patterns == 3
        assert abs(hdr.min_fov_deg - 10.0) < 1e-6
        assert abs(hdr.max_fov_deg - 30.0) < 1e-6
        assert abs(hdr.max_mag - 7.0) < 1e-6
        assert hdr.epoch == 2000
        assert hdr.pattern_size == 4
    finally:
        os.unlink(path)


def test_write_read_star():
    ids, stars, patterns, props = _make_test_data()
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        cid, ra, dec, x, y, z, mag = read_adb_star(path, 0)
        assert cid == 1001
        assert abs(ra - 0.1) < 1e-6
        assert abs(dec - 0.2) < 1e-6
        assert abs(mag - 3.5) < 1e-6

        cid4, ra4, dec4, x4, y4, z4, mag4 = read_adb_star(path, 4)
        assert cid4 == 1005
        assert abs(mag4 - 7.0) < 1e-6
    finally:
        os.unlink(path)


def test_write_read_pattern():
    ids, stars, patterns, props = _make_test_data()
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        p0 = read_adb_pattern(path, 0)
        assert p0 == (0, 1, 2, 3)

        p2 = read_adb_pattern(path, 2)
        assert p2 == (0, 2, 4, 1)
    finally:
        os.unlink(path)


def test_read_all_stars():
    ids, stars, patterns, props = _make_test_data()
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        cat_ids, star_table = read_adb_all_stars(path)
        assert len(cat_ids) == 5
        assert star_table.shape == (5, 6)
        assert cat_ids[0] == 1001
        assert abs(star_table[0, 0] - 0.1) < 1e-6
    finally:
        os.unlink(path)


def test_read_all_patterns():
    ids, stars, patterns, props = _make_test_data()
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        pats = read_adb_all_patterns(path)
        assert pats.shape == (3, 4)
        assert list(pats[0]) == [0, 1, 2, 3]
        assert list(pats[2]) == [0, 2, 4, 1]
    finally:
        os.unlink(path)


def test_bad_magic():
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        tmp.write(b"XXXX" * 16)
        path = tmp.name
    try:
        try:
            read_adb_header(path)
            assert False, "should have raised"
        except FormatError as e:
            assert "magic" in str(e)
    finally:
        os.unlink(path)


def test_truncated_header():
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        tmp.write(b"ADB\x00")
        path = tmp.name
    try:
        try:
            read_adb_header(path)
            assert False, "should have raised"
        except FormatError as e:
            assert "short" in str(e)
    finally:
        os.unlink(path)


def test_empty_database():
    ids = np.array([], dtype=np.uint32)
    stars = np.empty((0, 6), dtype=np.float32)
    patterns = np.empty((0, 4), dtype=np.uint16)
    props = {"min_fov": 0, "max_fov": 180, "star_max_magnitude": 7, "epoch_equinox": 2000}
    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        hdr = read_adb_header(path)
        assert hdr.n_stars == 0
        assert hdr.n_patterns == 0
    finally:
        os.unlink(path)


def test_roundtrip_large():
    n = 1000
    rng = np.random.RandomState(42)
    ids = np.arange(1, n + 1, dtype=np.uint32)
    stars = np.column_stack([
        rng.uniform(0, 6.28, n),
        rng.uniform(-1.57, 1.57, n),
        rng.randn(n), rng.randn(n), rng.randn(n),
        rng.uniform(1, 8, n),
    ]).astype(np.float32)
    patterns = rng.randint(0, n, size=(500, 4)).astype(np.uint16)
    props = {"min_fov": 5, "max_fov": 50, "star_max_magnitude": 8, "epoch_equinox": 2000}

    with tempfile.NamedTemporaryFile(suffix=".adb", delete=False) as tmp:
        path = tmp.name
    try:
        write_adb(path, ids, stars, patterns, props)
        cat_ids, star_table = read_adb_all_stars(path)
        pats = read_adb_all_patterns(path)
        assert len(cat_ids) == n
        assert star_table.shape == (n, 6)
        assert pats.shape == (500, 4)
        assert np.allclose(star_table[:, 0], stars[:, 0], atol=1e-5)
    finally:
        os.unlink(path)
