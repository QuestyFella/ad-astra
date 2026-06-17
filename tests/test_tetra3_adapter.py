import pytest

from ad_astra.solver_models import SolveRequest, SolveResult


def _has_tetra3() -> bool:
    try:
        import tetra3  # noqa: F401
        return True
    except ImportError:
        return False


pytestmark = pytest.mark.skipif(
    not _has_tetra3(),
    reason="tetra3 not installed",
)


def test_adapter_loads_default_database():
    from ad_astra.tetra3_adapter import Tetra3Adapter, default_database_path
    db = default_database_path()
    assert db is not None
    adapter = Tetra3Adapter(db)
    assert adapter.has_database


def test_adapter_no_database():
    from ad_astra.tetra3_adapter import Tetra3Adapter
    adapter = Tetra3Adapter()
    req = SolveRequest(sources=[], image_width_px=100, image_height_px=100)
    result = adapter.solve(req)
    assert not result.success
    assert len(result.log) > 0


def test_adapter_solve_empty_sources():
    from ad_astra.tetra3_adapter import Tetra3Adapter, default_database_path
    db = default_database_path()
    adapter = Tetra3Adapter(db)
    req = SolveRequest(sources=[], image_width_px=1200, image_height_px=1600)
    result = adapter.solve(req)
    assert not result.success


def test_adapter_solve_missing_image():
    from ad_astra.tetra3_adapter import Tetra3Adapter, default_database_path
    db = default_database_path()
    adapter = Tetra3Adapter(db)
    req = SolveRequest(image_path="/nonexistent/image.jpg")
    result = adapter.solve(req)
    assert not result.success
    assert "not found" in result.log[0].lower()


def test_adapter_solve_no_input():
    from ad_astra.tetra3_adapter import Tetra3Adapter, default_database_path
    db = default_database_path()
    adapter = Tetra3Adapter(db)
    req = SolveRequest()
    result = adapter.solve(req)
    assert not result.success


def test_adapter_solve_synthetic_sources():
    """Generate synthetic centroids from known sky position and solve."""
    from ad_astra.tetra3_adapter import Tetra3Adapter, default_database_path
    from ad_astra.coordinates import Equatorial
    from ad_astra.catalog import Catalog, Star
    from ad_astra.synthetic import generate_synthetic_field
    from ad_astra.solver_models import ImageSource
    import random

    db = default_database_path()
    adapter = Tetra3Adapter(db)

    rng = random.Random(99)
    stars = []
    for i in range(500):
        ra = rng.uniform(60, 140)
        dec = rng.uniform(-10, 50)
        mag = rng.uniform(1.0, 6.5)
        stars.append(Star(id=i + 1, ra_deg=ra, dec_deg=dec, mag=mag))

    cat = Catalog(name="bright_test", epoch=2000.0, stars=stars)
    center = Equatorial(ra_deg=100.0, dec_deg=20.0)

    sources, cam, projected = generate_synthetic_field(
        cat, center,
        fov_x_deg=15.0, fov_y_deg=12.0,
        width_px=1200, height_px=960,
        max_mag=7.0, seed=42,
    )

    if len(sources) < 5:
        pytest.skip("Not enough synthetic stars for solve test")

    req = SolveRequest(
        sources=[ImageSource(s.x_px, s.y_px, s.flux) for s in sources],
        image_width_px=1200,
        image_height_px=960,
        fov_estimate_deg=15.0,
        fov_max_error_deg=5.0,
        solve_timeout_ms=5000,
    )

    result = adapter.solve(req)

    if result.success:
        assert result.ra_deg is not None
        assert result.dec_deg is not None
        assert result.fov_x_deg is not None
        assert result.matched_stars >= 3
        assert result.solve_time_ms > 0
        assert len(result.log) > 0
    else:
        assert len(result.log) > 0


def test_list_databases():
    from ad_astra.tetra3_adapter import list_databases
    dbs = list_databases("/nonexistent")
    assert dbs == []
