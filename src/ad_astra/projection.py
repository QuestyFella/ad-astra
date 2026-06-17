"""Gnomonic projection, camera projection, and coordinate transforms."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .coordinates import Equatorial, Vec3, equatorial_to_unit


@dataclass(slots=True)
class ProjectionResult:
    x: float
    y: float
    cos_theta: float


def project_gnomonic(
    center: Equatorial,
    star: Equatorial,
) -> ProjectionResult:
    ra_c = math.radians(center.ra_deg)
    dec_c = math.radians(center.dec_deg)
    ra = math.radians(star.ra_deg)
    dec = math.radians(star.dec_deg)

    sin_dc = math.sin(dec_c)
    cos_dc = math.cos(dec_c)
    sin_d = math.sin(dec)
    cos_d = math.cos(dec)
    cos_dra = math.cos(ra - ra_c)

    cos_theta = sin_dc * sin_d + cos_dc * cos_d * cos_dra
    if cos_theta <= 0:
        raise ValueError("Star is behind the projection plane")

    x = cos_d * math.sin(ra - ra_c) / cos_theta
    y = (cos_dc * sin_d - sin_dc * cos_d * cos_dra) / cos_theta
    return ProjectionResult(x=x, y=y, cos_theta=cos_theta)


def unproject_gnomonic(
    center: Equatorial,
    x: float,
    y: float,
) -> Equatorial:
    ra_c = math.radians(center.ra_deg)
    dec_c = math.radians(center.dec_deg)

    rho = math.sqrt(x * x + y * y)
    c = math.atan(rho)

    sin_dc = math.sin(dec_c)
    cos_dc = math.cos(dec_c)
    sin_c = math.sin(c)
    cos_c = math.cos(c)

    if rho < 1e-15:
        return Equatorial(ra_deg=center.ra_deg, dec_deg=center.dec_deg)

    dec = math.asin(cos_c * sin_dc + y * sin_c * cos_dc / rho)
    ra = ra_c + math.atan2(
        x * sin_c,
        rho * cos_dc * cos_c - y * sin_dc * sin_c,
    )

    ra_deg = math.degrees(ra) % 360
    dec_deg = math.degrees(dec)
    return Equatorial(ra_deg=ra_deg, dec_deg=dec_deg)


@dataclass(slots=True)
class CameraModel:
    center_ra_deg: float
    center_dec_deg: float
    fov_x_deg: float
    fov_y_deg: float
    rotation_deg: float
    width_px: int
    height_px: int

    @property
    def center(self) -> Equatorial:
        return Equatorial(ra_deg=self.center_ra_deg, dec_deg=self.center_dec_deg)

    @property
    def pixel_scale_x(self) -> float:
        return self.fov_x_deg / self.width_px

    @property
    def pixel_scale_y(self) -> float:
        return self.fov_y_deg / self.height_px

    def sky_to_pixel(self, star: Equatorial) -> tuple[float, float] | None:
        try:
            proj = project_gnomonic(self.center, star)
        except ValueError:
            return None
        sx = proj.x / math.radians(self.pixel_scale_x)
        sy = proj.y / math.radians(self.pixel_scale_y)
        theta = math.radians(self.rotation_deg)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)
        rx = sx * cos_t - sy * sin_t
        ry = sx * sin_t + sy * cos_t
        px = self.width_px / 2 + rx
        py = self.height_px / 2 - ry
        if px < 0 or px > self.width_px or py < 0 or py > self.height_px:
            return None
        return px, py

    def pixel_to_sky(self, px: float, py: float) -> Equatorial:
        dx = px - self.width_px / 2
        dy = self.height_px / 2 - py
        theta = math.radians(self.rotation_deg)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)
        sx = dx * cos_t + dy * sin_t
        sy = -dx * sin_t + dy * cos_t
        x = sx * math.radians(self.pixel_scale_x)
        y = sy * math.radians(self.pixel_scale_y)
        return unproject_gnomonic(self.center, x, y)


def estimate_fov_from_exif(
    focal_length_mm: float,
    sensor_width_mm: float,
    sensor_height_mm: float,
) -> tuple[float, float]:
    fov_x = 2 * math.degrees(math.atan(sensor_width_mm / (2 * focal_length_mm)))
    fov_y = 2 * math.degrees(math.atan(sensor_height_mm / (2 * focal_length_mm)))
    return fov_x, fov_y


def estimate_pixel_scale_arcsec(fov_deg: float, image_size_px: int) -> float:
    return fov_deg * 3600 / image_size_px


def gnomonic_tangent_plane(
    center: Equatorial,
    ra_deg: float,
    dec_deg: float,
) -> tuple[float, float]:
    star = Equatorial(ra_deg=ra_deg, dec_deg=dec_deg)
    proj = project_gnomonic(center, star)
    return proj.x, proj.y
