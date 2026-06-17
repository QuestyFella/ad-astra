import math
import os
import tempfile

from ad_astra.binary import (
    FormatError,
    read_catalog,
    read_header,
    write_catalog,
)
from ad_astra.catalog import Catalog, Star


def _make_catalog() -> Catalog:
    stars = [
        Star(id=1, ra_deg=0.0, dec_deg=0.0, mag=1.0),
        Star(id=2, ra_deg=180.0, dec_deg=45.0, mag=3.5),
        Star(id=3, ra_deg=90.0, dec_deg=-30.0, mag=None),
    ]
    return Catalog(name="test", epoch=2000.0, stars=stars)


def test_write_read_roundtrip():
    cat = _make_catalog()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        loaded = read_catalog(path)

        assert loaded.epoch == 2000.0
        assert len(loaded.stars) == 3

        for orig, reloaded in zip(cat.stars, loaded.stars):
            assert reloaded.id == orig.id
            assert abs(reloaded.ra_deg - orig.ra_deg) < 1e-6
            assert abs(reloaded.dec_deg - orig.dec_deg) < 1e-6
            if orig.mag is None:
                assert reloaded.mag is None
            else:
                assert abs(reloaded.mag - orig.mag) < 1e-6
    finally:
        os.unlink(path)


def test_read_header():
    cat = _make_catalog()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        hdr = read_header(path)
        assert hdr.version == 1
        assert hdr.count == 3
        assert hdr.epoch == 2000.0
    finally:
        os.unlink(path)


def test_iter_stars():
    from ad_astra.binary import iter_stars

    cat = _make_catalog()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        ids = [s.id for s in iter_stars(path)]
        assert ids == [1, 2, 3]
    finally:
        os.unlink(path)


def test_empty_catalog():
    cat = Catalog(name="empty", epoch=2000.0, stars=[])
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        loaded = read_catalog(path)
        assert len(loaded.stars) == 0
    finally:
        os.unlink(path)


def test_bad_magic():
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        tmp.write(b"XXXX" * 5)  # 20 bytes — passes length check, fails magic
        path = tmp.name
    try:
        try:
            read_catalog(path)
            assert False, "should have raised"
        except FormatError as e:
            assert "magic" in str(e)
    finally:
        os.unlink(path)


def test_truncated_header():
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        tmp.write(b"AA")
        path = tmp.name
    try:
        try:
            read_catalog(path)
            assert False, "should have raised"
        except FormatError as e:
            assert "short" in str(e)
    finally:
        os.unlink(path)


def test_nan_magnitude_roundtrip():
    """Stars with mag=NaN should survive roundtrip as None."""
    star = Star(id=99, ra_deg=12.0, dec_deg=34.0, mag=float("nan"))
    cat = Catalog(name="nan_test", epoch=2000.0, stars=[star])
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        loaded = read_catalog(path)
        assert loaded.stars[0].mag is None
    finally:
        os.unlink(path)


def test_catalog_from_binary():
    cat = _make_catalog()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        loaded = Catalog.from_binary(path)
        assert len(loaded.stars) == 3
    finally:
        os.unlink(path)
