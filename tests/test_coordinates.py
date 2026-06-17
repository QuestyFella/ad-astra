import math

from ad_astra.coordinates import (
    Equatorial,
    Vec3,
    angular_separation,
    equatorial_to_unit,
)


def test_equatorial_to_unit_north_pole():
    v = equatorial_to_unit(Equatorial(0.0, 90.0))
    assert abs(v.x) < 1e-12
    assert abs(v.y) < 1e-12
    assert abs(v.z - 1.0) < 1e-12


def test_equatorial_to_unit_origin():
    v = equatorial_to_unit(Equatorial(0.0, 0.0))
    assert abs(v.x - 1.0) < 1e-12
    assert abs(v.y) < 1e-12
    assert abs(v.z) < 1e-12


def test_angular_separation_identical():
    a = equatorial_to_unit(Equatorial(45.0, 30.0))
    assert angular_separation(a, a) == 0.0


def test_angular_separation_90deg():
    a = equatorial_to_unit(Equatorial(0.0, 0.0))
    b = equatorial_to_unit(Equatorial(90.0, 0.0))
    assert math.isclose(angular_separation(a, b), 90.0, rel_tol=1e-9)
