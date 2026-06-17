import os
import tempfile

from ad_astra.catalog import Catalog, Star, filter_by_magnitude, stats
from ad_astra.ingest import generate_synthetic, export_synthetic, parse_synthetic


def test_generate_synthetic():
    cat = generate_synthetic(n_stars=500, seed=42)
    assert len(cat.stars) == 500
    assert cat.epoch == 2000.0
    for s in cat.stars:
        assert 0 <= s.ra_deg < 360
        assert -90 <= s.dec_deg <= 90
        assert s.mag is not None and s.mag >= 0


def test_generate_synthetic_reproducible():
    a = generate_synthetic(n_stars=100, seed=42)
    b = generate_synthetic(n_stars=100, seed=42)
    for sa, sb in zip(a.stars, b.stars):
        assert sa.id == sb.id
        assert abs(sa.ra_deg - sb.ra_deg) < 1e-12
        assert abs(sa.dec_deg - sb.dec_deg) < 1e-12
        assert abs(sa.mag - sb.mag) < 1e-12


def test_synthetic_csv_roundtrip():
    cat = generate_synthetic(n_stars=50, seed=1)
    with tempfile.NamedTemporaryFile(
        suffix=".csv", mode="w", delete=False
    ) as tmp:
        path = tmp.name
    try:
        export_synthetic(path, cat)
        reloaded = parse_synthetic(path)
        assert len(reloaded.stars) == 50
        for orig, back in zip(cat.stars, reloaded.stars):
            assert abs(orig.ra_deg - back.ra_deg) < 1e-5
            assert abs(orig.dec_deg - back.dec_deg) < 1e-5
    finally:
        os.unlink(path)


def test_filter_by_magnitude():
    stars = [
        Star(id=1, ra_deg=0, dec_deg=0, mag=5.0),
        Star(id=2, ra_deg=0, dec_deg=0, mag=9.0),
        Star(id=3, ra_deg=0, dec_deg=0, mag=None),
        Star(id=4, ra_deg=0, dec_deg=0, mag=7.5),
    ]
    cat = Catalog(name="test", epoch=2000.0, stars=stars)
    filtered = filter_by_magnitude(cat, max_mag=8.0)
    ids = {s.id for s in filtered.stars}
    assert ids == {1, 4}


def test_stats():
    stars = [
        Star(id=1, ra_deg=10, dec_deg=20, mag=3.0),
        Star(id=2, ra_deg=50, dec_deg=60, mag=5.0),
        Star(id=3, ra_deg=100, dec_deg=-80, mag=None),
    ]
    cat = Catalog(name="test", epoch=2000.0, stars=stars)
    st = stats(cat)
    assert st["count"] == 3
    assert st["count_with_mag"] == 2
    assert st["mag_min"] == 3.0
    assert st["mag_max"] == 5.0
    assert st["mag_mean"] == 4.0
    assert st["ra_range"] == (10, 100)
    assert st["dec_range"] == (-80, 60)


def test_stats_empty():
    cat = Catalog(name="empty", epoch=2000.0, stars=[])
    assert stats(cat) == {"count": 0}


def test_catalog_len():
    cat = generate_synthetic(n_stars=200)
    assert len(cat) == 200
