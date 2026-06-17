"""Offline search index for rapid celestial look-ups.

Design notes
------------
A full kd-tree or HEALPix grid will replace this placeholder.
The placeholder uses brute-force angular proximity for correctness
testing during early development.
"""

import math
from dataclasses import dataclass

from .coordinates import Equatorial, Vec3, angular_separation, equatorial_to_unit
from .catalog import Catalog, Star


@dataclass
class Index:
    stars: list[Star]
    vecs: list[Vec3]

    @classmethod
    def from_catalog(cls, catalog: Catalog) -> "Index":
        stars = catalog.stars
        vecs = [equatorial_to_unit(s.equatorial()) for s in stars]
        return cls(stars=stars, vecs=vecs)

    @classmethod
    def from_binary(cls, path: str) -> "Index":
        """Load an index directly from a .bin catalog file."""
        from .binary import read_catalog
        return cls.from_catalog(read_catalog(path))

    def query_radius(self, center: Equatorial, radius_deg: float) -> list[Star]:
        center_vec = equatorial_to_unit(center)
        results: list[Star] = []
        for star, vec in zip(self.stars, self.vecs):
            if angular_separation(center_vec, vec) <= radius_deg:
                results.append(star)
        return results

    def count_in_radius(self, center: Equatorial, radius_deg: float) -> int:
        """Faster than building the full list when you only need a count."""
        center_vec = equatorial_to_unit(center)
        n = 0
        for vec in self.vecs:
            if angular_separation(center_vec, vec) <= radius_deg:
                n += 1
        return n

    def field_coverage(self, center: Equatorial, fov_deg: float) -> float:
        """Estimate how many stars per square degree are in this field.

        Returns stars / deg². Useful for checking if a region is solveable.
        """
        radius = fov_deg * math.sqrt(2) / 2  # circumradius
        n = self.count_in_radius(center, radius)
        area = math.pi * (fov_deg / 2) ** 2
        return n / area if area > 0 else 0.0

    def __len__(self) -> int:
        return len(self.stars)
