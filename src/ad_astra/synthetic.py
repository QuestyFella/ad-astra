"""Synthetic test field generation from catalog stars."""

from __future__ import annotations

import math
import random

from .catalog import Catalog, Star
from .coordinates import Equatorial, Vec3, angular_separation, equatorial_to_unit
from .projection import CameraModel
from .sources import ImageSource


def visible_stars(
    catalog: Catalog,
    center: Equatorial,
    fov_x_deg: float,
    fov_y_deg: float,
    max_mag: float | None = None,
) -> list[Star]:
    diag = math.hypot(fov_x_deg, fov_y_deg) / 2 * 1.2
    center_vec = equatorial_to_unit(center)
    result: list[Star] = []
    for star in catalog.stars:
        if max_mag is not None and star.mag is not None and star.mag > max_mag:
            continue
        star_vec = equatorial_to_unit(star.equatorial())
        if angular_separation(center_vec, star_vec) <= diag:
            result.append(star)
    return result


def generate_synthetic_field(
    catalog: Catalog,
    center: Equatorial,
    fov_x_deg: float,
    fov_y_deg: float,
    width_px: int = 1200,
    height_px: int = 1600,
    rotation_deg: float = 0.0,
    max_mag: float | None = None,
    noise_px: float = 0.0,
    dropout_rate: float = 0.0,
    false_sources: int = 0,
    seed: int | None = None,
) -> tuple[list[ImageSource], CameraModel, list[Star]]:
    cam = CameraModel(
        center_ra_deg=center.ra_deg,
        center_dec_deg=center.dec_deg,
        fov_x_deg=fov_x_deg,
        fov_y_deg=fov_y_deg,
        rotation_deg=rotation_deg,
        width_px=width_px,
        height_px=height_px,
    )
    visible = visible_stars(catalog, center, fov_x_deg, fov_y_deg, max_mag)
    rng = random.Random(seed)
    sources: list[ImageSource] = []
    projected_stars: list[Star] = []
    for star in visible:
        if dropout_rate > 0 and rng.random() < dropout_rate:
            continue
        pos = cam.sky_to_pixel(star.equatorial())
        if pos is None:
            continue
        px, py = pos
        if noise_px > 0:
            px += rng.gauss(0, noise_px)
            py += rng.gauss(0, noise_px)
        flux = 10 ** ((star.mag or 5.0) / -2.5) if star.mag is not None else 1.0
        sources.append(ImageSource(x_px=px, y_px=py, flux=flux))
        projected_stars.append(star)
    for _ in range(false_sources):
        px = rng.uniform(0, width_px)
        py = rng.uniform(0, height_px)
        sources.append(ImageSource(x_px=px, y_px=py, flux=rng.uniform(0.1, 0.5)))
    sources.sort(key=lambda s: s.flux or 0, reverse=True)
    return sources, cam, projected_stars


def generate_random_catalog(
    n_stars: int = 2000,
    seed: int | None = 42,
    max_mag: float = 9.0,
) -> Catalog:
    rng = random.Random(seed)
    stars: list[Star] = []
    for i in range(n_stars):
        ra = rng.uniform(0, 360)
        dec = math.degrees(math.asin(rng.uniform(-1, 1)))
        mag = max(0.0, rng.gauss(6.0, 2.0))
        if mag > max_mag:
            continue
        stars.append(Star(id=i + 1, ra_deg=ra, dec_deg=dec, mag=mag))
    return Catalog(name="synthetic_random", epoch=2000.0, stars=stars)
