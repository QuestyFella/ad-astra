import math

from ad_astra.coordinates import Equatorial
from ad_astra.catalog import Catalog, Star
from ad_astra.projection import CameraModel
from ad_astra.synthetic import (
    generate_random_catalog,
    generate_synthetic_field,
    visible_stars,
)


def _test_catalog() -> Catalog:
    stars = [
        Star(id=1, ra_deg=0.0, dec_deg=0.0, mag=2.0),
        Star(id=2, ra_deg=1.0, dec_deg=0.0, mag=4.0),
        Star(id=3, ra_deg=0.0, dec_deg=1.0, mag=5.0),
        Star(id=4, ra_deg=1.0, dec_deg=1.0, mag=6.0),
        Star(id=5, ra_deg=10.0, dec_deg=10.0, mag=8.0),
        Star(id=6, ra_deg=90.0, dec_deg=45.0, mag=3.0),
        Star(id=7, ra_deg=0.5, dec_deg=0.5, mag=7.0),
        Star(id=8, ra_deg=0.3, dec_deg=-0.3, mag=9.0),
    ]
    return Catalog(name="test", epoch=2000.0, stars=stars)


def test_visible_stars_basic():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    visible = visible_stars(cat, center, 5.0, 5.0)
    ids = {s.id for s in visible}
    assert 1 in ids
    assert 6 not in ids


def test_visible_stars_magnitude_filter():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    visible_all = visible_stars(cat, center, 5.0, 5.0, max_mag=None)
    visible_bright = visible_stars(cat, center, 5.0, 5.0, max_mag=5.0)
    assert len(visible_bright) <= len(visible_all)
    for s in visible_bright:
        assert s.mag is not None and s.mag <= 5.0


def test_generate_synthetic_field():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources, cam, projected = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0,
        width_px=1000, height_px=1000, seed=42,
    )
    assert len(sources) > 0
    for s in sources:
        assert 0 <= s.x_px <= 1000
        assert 0 <= s.y_px <= 1000
    assert cam.center_ra_deg == 0.5
    assert cam.center_dec_deg == 0.5
    assert len(projected) == len(sources)


def test_generate_synthetic_field_noise():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources_clean, _, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0, seed=42,
    )
    sources_noisy, _, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0, noise_px=2.0, seed=42,
    )
    assert len(sources_clean) == len(sources_noisy)
    for a, b in zip(sources_clean, sources_noisy):
        if a.x_px != b.x_px or a.y_px != b.y_px:
            break
    else:
        assert False, "Noise had no effect"


def test_generate_synthetic_field_dropout():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources_full, _, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0, dropout_rate=0.0, seed=42,
    )
    sources_dropped, _, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0, dropout_rate=0.5, seed=42,
    )
    assert len(sources_dropped) < len(sources_full)


def test_generate_synthetic_field_false_sources():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources, _, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0,
        false_sources=10, dropout_rate=0.0, seed=42,
    )
    sources_clean, _, projected = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0,
        false_sources=0, dropout_rate=0.0, seed=42,
    )
    assert len(sources) == len(sources_clean) + 10


def test_generate_synthetic_field_sorted_by_flux():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources, _, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0, seed=42,
    )
    fluxes = [s.flux for s in sources]
    for i in range(len(fluxes) - 1):
        a = fluxes[i] if fluxes[i] is not None else 0
        b = fluxes[i + 1] if fluxes[i + 1] is not None else 0
        assert a >= b


def test_generate_random_catalog():
    cat = generate_random_catalog(n_stars=500, seed=42)
    assert len(cat.stars) > 0
    assert cat.epoch == 2000.0
    for s in cat.stars:
        assert 0 <= s.ra_deg < 360
        assert -90 <= s.dec_deg <= 90
        assert s.mag is not None
        assert s.mag >= 0


def test_generate_random_catalog_deterministic():
    a = generate_random_catalog(n_stars=100, seed=7)
    b = generate_random_catalog(n_stars=100, seed=7)
    assert len(a.stars) == len(b.stars)
    for sa, sb in zip(a.stars, b.stars):
        assert sa.ra_deg == sb.ra_deg
        assert sa.dec_deg == sb.dec_deg
        assert sa.mag == sb.mag


def test_field_known_center():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources, cam, _ = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0,
        width_px=1000, height_px=1000, seed=42,
    )
    known_star = Equatorial(0.5, 0.5)
    pos = cam.sky_to_pixel(known_star)
    if pos is not None:
        px, py = pos
        assert 0 <= px <= 1000
        assert 0 <= py <= 1000


def test_field_projection_consistency():
    cat = _test_catalog()
    center = Equatorial(0.5, 0.5)
    sources, cam, projected = generate_synthetic_field(
        cat, center, fov_x_deg=5.0, fov_y_deg=5.0,
        width_px=1000, height_px=1000, noise_px=0.0,
        dropout_rate=0.0, seed=42,
    )
    for source, star in zip(sources, projected):
        pos = cam.sky_to_pixel(star.equatorial())
        assert pos is not None
        assert abs(source.x_px - pos[0]) < 1e-6
        assert abs(source.y_px - pos[1]) < 1e-6
