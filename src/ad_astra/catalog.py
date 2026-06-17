"""Star catalog record types and basic I/O."""

import math
from dataclasses import dataclass

from .coordinates import Equatorial


@dataclass(slots=True)
class Star:
    id: int
    ra_deg: float
    dec_deg: float
    mag: float | None = None

    def equatorial(self) -> Equatorial:
        return Equatorial(ra_deg=self.ra_deg, dec_deg=self.dec_deg)


@dataclass(slots=True)
class Catalog:
    name: str
    epoch: float  # e.g. 2000.0
    stars: list[Star]

    @classmethod
    def from_binary(cls, path: str) -> "Catalog":
        from .binary import read_catalog
        return read_catalog(path)

    def write_binary(self, path: str) -> int:
        from .binary import write_catalog
        return write_catalog(path, self)

    def __len__(self) -> int:
        return len(self.stars)


def filter_by_magnitude(catalog: Catalog, max_mag: float) -> Catalog:
    keep = [s for s in catalog.stars if s.mag is not None and s.mag <= max_mag]
    return Catalog(name=catalog.name, epoch=catalog.epoch, stars=keep)


def stats(catalog: Catalog) -> dict:
    """Compute basic statistics for a catalog."""
    if not catalog.stars:
        return {"count": 0}

    mags = [s.mag for s in catalog.stars if s.mag is not None]
    ras = [s.ra_deg for s in catalog.stars]
    decs = [s.dec_deg for s in catalog.stars]

    return {
        "count": len(catalog.stars),
        "count_with_mag": len(mags),
        "mag_min": min(mags) if mags else None,
        "mag_max": max(mags) if mags else None,
        "mag_mean": sum(mags) / len(mags) if mags else None,
        "ra_range": (min(ras), max(ras)) if ras else None,
        "dec_range": (min(decs), max(decs)) if decs else None,
    }
