"""Equatorial / horizontal coordinate transforms and unit-vector utilities."""

import math
from dataclasses import dataclass


@dataclass(slots=True)
class Equatorial:
    ra_deg: float   # Right Ascension  [0, 360)
    dec_deg: float  # Declination      [-90, 90]


@dataclass(slots=True)
class Vec3:
    x: float
    y: float
    z: float


def equatorial_to_unit(coord: Equatorial) -> Vec3:
    """Convert equatorial coordinates to a unit vector on the celestial sphere."""
    ra = math.radians(coord.ra_deg)
    dec = math.radians(coord.dec_deg)
    cos_dec = math.cos(dec)
    return Vec3(
        x=cos_dec * math.cos(ra),
        y=cos_dec * math.sin(ra),
        z=math.sin(dec),
    )


def angular_separation(a: Vec3, b: Vec3) -> float:
    """Angular distance in degrees between two unit vectors."""
    dot = a.x * b.x + a.y * b.y + a.z * b.z
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))
