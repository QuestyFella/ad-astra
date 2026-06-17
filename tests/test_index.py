import os
import tempfile

import math

from ad_astra.binary import write_catalog
from ad_astra.catalog import Catalog, Star
from ad_astra.coordinates import Equatorial
from ad_astra.index import Index


def _make_catalog() -> Catalog:
    stars = [
        Star(id=201, ra_deg=0.0, dec_deg=90.0, mag=2.0),
        Star(id=202, ra_deg=0.0, dec_deg=0.0, mag=3.0),
        Star(id=203, ra_deg=90.0, dec_deg=0.0, mag=4.0),
        Star(id=204, ra_deg=180.0, dec_deg=0.0, mag=5.0),
        Star(id=205, ra_deg=270.0, dec_deg=0.0, mag=6.0),
        Star(id=206, ra_deg=45.0, dec_deg=45.0, mag=7.0),
    ]
    return Catalog(name="index_test", epoch=2000.0, stars=stars)


def test_from_catalog():
    idx = Index.from_catalog(_make_catalog())
    assert len(idx) == 6


def test_query_radius_empty():
    idx = Index.from_catalog(_make_catalog())
    found = idx.query_radius(Equatorial(0, 0), 0.0)
    assert len(found) == 1  # only the star exactly at (0, 0)


def test_query_radius_full_sky():
    idx = Index.from_catalog(_make_catalog())
    found = idx.query_radius(Equatorial(0, 0), 180.0)
    assert len(found) == 6


def test_query_radius_1deg():
    """A 1-degree cone around true north should only catch the pole star."""
    idx = Index.from_catalog(_make_catalog())
    found = idx.query_radius(Equatorial(0, 90), 1.0)
    assert len(found) == 1
    assert found[0].id == 201


def test_count_in_radius():
    idx = Index.from_catalog(_make_catalog())
    assert idx.count_in_radius(Equatorial(0, 90), 1.0) == 1
    assert idx.count_in_radius(Equatorial(0, 0), 180.0) == 6


def test_field_coverage():
    idx = Index.from_catalog(_make_catalog())
    cov = idx.field_coverage(Equatorial(0, 90), fov_deg=10.0)
    assert cov > 0


def test_from_binary():
    cat = _make_catalog()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        path = tmp.name
    try:
        write_catalog(path, cat)
        idx = Index.from_binary(path)
        assert len(idx) == 6
        found = idx.query_radius(Equatorial(0, 0), 180.0)
        assert len(found) == 6
    finally:
        os.unlink(path)


def test_large_synthetic_index():
    """Index should handle a few thousand stars without issue."""
    from ad_astra.ingest import generate_synthetic

    cat = generate_synthetic(n_stars=2000, seed=99)
    idx = Index.from_catalog(cat)

    # Query a 10-degree patch near the equator
    results = idx.query_radius(Equatorial(100.0, 0.0), 10.0)
    # With uniform sky distribution and 2000 stars:
    # area of 10° radius ≈ 314 deg² out of 41253 deg²
    # expected ≈ 2000 * 314 / 41253 ≈ 15
    assert 5 <= len(results) <= 50
