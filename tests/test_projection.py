import math

from ad_astra.coordinates import Equatorial
from ad_astra.projection import (
    CameraModel,
    estimate_fov_from_exif,
    estimate_pixel_scale_arcsec,
    gnomonic_tangent_plane,
    project_gnomonic,
    unproject_gnomonic,
)


def test_project_gnomonic_center():
    center = Equatorial(0.0, 0.0)
    proj = project_gnomonic(center, Equatorial(0.0, 0.0))
    assert abs(proj.x) < 1e-12
    assert abs(proj.y) < 1e-12


def test_project_gnomonic_offset():
    center = Equatorial(0.0, 0.0)
    proj = project_gnomonic(center, Equatorial(1.0, 0.0))
    assert proj.x > 0
    assert abs(proj.y) < 0.01


def test_unproject_gnomonic_roundtrip():
    center = Equatorial(60.0, 30.0)
    original = Equatorial(61.5, 31.2)
    proj = project_gnomonic(center, original)
    recovered = unproject_gnomonic(center, proj.x, proj.y)
    assert abs(recovered.ra_deg - original.ra_deg) < 1e-8
    assert abs(recovered.dec_deg - original.dec_deg) < 1e-8


def test_unproject_gnomonic_zero():
    center = Equatorial(180.0, -45.0)
    recovered = unproject_gnomonic(center, 0.0, 0.0)
    assert abs(recovered.ra_deg - 180.0) < 1e-8
    assert abs(recovered.dec_deg - (-45.0)) < 1e-8


def test_camera_model_roundtrip():
    cam = CameraModel(
        center_ra_deg=100.0,
        center_dec_deg=20.0,
        fov_x_deg=10.0,
        fov_y_deg=8.0,
        rotation_deg=0.0,
        width_px=1200,
        height_px=960,
    )
    star = Equatorial(100.5, 20.3)
    pos = cam.sky_to_pixel(star)
    assert pos is not None
    px, py = pos
    recovered = cam.pixel_to_sky(px, py)
    assert abs(recovered.ra_deg - star.ra_deg) < 1e-6
    assert abs(recovered.dec_deg - star.dec_deg) < 1e-6


def test_camera_model_outside_fov():
    cam = CameraModel(
        center_ra_deg=0.0,
        center_dec_deg=0.0,
        fov_x_deg=5.0,
        fov_y_deg=5.0,
        rotation_deg=0.0,
        width_px=1000,
        height_px=1000,
    )
    far_star = Equatorial(80.0, 80.0)
    assert cam.sky_to_pixel(far_star) is None


def test_camera_model_rotation():
    cam0 = CameraModel(
        center_ra_deg=0.0,
        center_dec_deg=0.0,
        fov_x_deg=10.0,
        fov_y_deg=10.0,
        rotation_deg=0.0,
        width_px=1000,
        height_px=1000,
    )
    cam45 = CameraModel(
        center_ra_deg=0.0,
        center_dec_deg=0.0,
        fov_x_deg=10.0,
        fov_y_deg=10.0,
        rotation_deg=45.0,
        width_px=1000,
        height_px=1000,
    )
    star = Equatorial(2.0, 2.0)
    pos0 = cam0.sky_to_pixel(star)
    pos45 = cam45.sky_to_pixel(star)
    assert pos0 is not None and pos45 is not None
    assert abs(pos0[0] - pos45[0]) > 1
    assert abs(pos0[1] - pos45[1]) > 1


def test_camera_pixel_scale():
    cam = CameraModel(
        center_ra_deg=0.0,
        center_dec_deg=0.0,
        fov_x_deg=12.0,
        fov_y_deg=8.0,
        rotation_deg=0.0,
        width_px=1200,
        height_px=800,
    )
    assert abs(cam.pixel_scale_x - 0.01) < 1e-9
    assert abs(cam.pixel_scale_y - 0.01) < 1e-9


def test_estimate_fov_from_exif():
    fov_x, fov_y = estimate_fov_from_exif(
        focal_length_mm=50.0,
        sensor_width_mm=36.0,
        sensor_height_mm=24.0,
    )
    assert abs(fov_x - 39.597) < 0.01
    assert abs(fov_y - 26.990) < 0.01


def test_estimate_pixel_scale_arcsec():
    scale = estimate_pixel_scale_arcsec(fov_deg=1.0, image_size_px=1000)
    assert abs(scale - 3.6) < 1e-6


def test_gnomonic_tangent_plane():
    center = Equatorial(0.0, 0.0)
    x, y = gnomonic_tangent_plane(center, 0.0, 0.0)
    assert abs(x) < 1e-12
    assert abs(y) < 1e-12


def test_near_pole_projection():
    center = Equatorial(0.0, 89.999)
    star = Equatorial(90.0, 89.999)
    proj = project_gnomonic(center, star)
    recovered = unproject_gnomonic(center, proj.x, proj.y)
    assert abs(recovered.dec_deg - star.dec_deg) < 0.01


def test_ra_wraparound():
    center = Equatorial(359.5, 0.0)
    star = Equatorial(0.5, 0.0)
    proj = project_gnomonic(center, star)
    recovered = unproject_gnomonic(center, proj.x, proj.y)
    assert abs(recovered.ra_deg - star.ra_deg) < 1e-6
