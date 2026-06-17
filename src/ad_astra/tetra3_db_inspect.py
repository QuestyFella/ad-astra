"""Inspect and document Tetra3 database structure.

Tetra3 .npz database contains:
  - star_table: (N, 6) float32 — [ra_rad, dec_rad, x_unit, y_unit, z_unit, mag]
  - star_catalog_IDs: (N,) uint32 — Hipparcos catalog IDs
  - pattern_catalog: (M, 4) uint16 — 4 star indices per pattern
  - props_packed: structured array with database properties
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass(slots=True)
class Tetra3StarRecord:
    index: int
    catalog_id: int
    ra_rad: float
    dec_rad: float
    x_unit: float
    y_unit: float
    z_unit: float
    mag: float


@dataclass(slots=True)
class Tetra3PatternRecord:
    index: int
    star_indices: tuple[int, int, int, int]


@dataclass(slots=True)
class Tetra3DatabaseProperties:
    pattern_mode: str
    pattern_size: int
    pattern_bins: int
    pattern_max_error: float
    max_fov: float
    min_fov: float
    star_catalog: str
    epoch_equinox: int
    epoch_proper_motion: float
    pattern_stars_per_fov: int
    verification_stars_per_fov: int
    star_max_magnitude: float
    simplify_pattern: bool


@dataclass(slots=True)
class Tetra3Database:
    star_table: np.ndarray
    star_catalog_ids: np.ndarray
    pattern_catalog: np.ndarray
    properties: Tetra3DatabaseProperties


def load_tetra3_database(path: str) -> Tetra3Database:
    data = np.load(path, allow_pickle=True)

    pp = data["props_packed"]
    props = Tetra3DatabaseProperties(
        pattern_mode=str(pp["pattern_mode"].item()),
        pattern_size=int(pp["pattern_size"].item()),
        pattern_bins=int(pp["pattern_bins"].item()),
        pattern_max_error=float(pp["pattern_max_error"].item()),
        max_fov=float(pp["max_fov"].item()),
        min_fov=float(pp["min_fov"].item()),
        star_catalog=str(pp["star_catalog"].item()),
        epoch_equinox=int(pp["epoch_equinox"].item()),
        epoch_proper_motion=float(pp["epoch_proper_motion"].item()),
        pattern_stars_per_fov=int(pp["pattern_stars_per_fov"].item()),
        verification_stars_per_fov=int(pp["verification_stars_per_fov"].item()),
        star_max_magnitude=float(pp["star_max_magnitude"].item()),
        simplify_pattern=bool(pp["simplify_pattern"].item()),
    )

    return Tetra3Database(
        star_table=data["star_table"],
        star_catalog_ids=data["star_catalog_IDs"],
        pattern_catalog=data["pattern_catalog"],
        properties=props,
    )


def get_star(db: Tetra3Database, index: int) -> Tetra3StarRecord:
    row = db.star_table[index]
    return Tetra3StarRecord(
        index=index,
        catalog_id=int(db.star_catalog_ids[index]),
        ra_rad=float(row[0]),
        dec_rad=float(row[1]),
        x_unit=float(row[2]),
        y_unit=float(row[3]),
        z_unit=float(row[4]),
        mag=float(row[5]),
    )


def get_pattern(db: Tetra3Database, index: int) -> Tetra3PatternRecord:
    row = db.pattern_catalog[index]
    return Tetra3PatternRecord(
        index=index,
        star_indices=(int(row[0]), int(row[1]), int(row[2]), int(row[3])),
    )


def count_nonzero_patterns(db: Tetra3Database) -> int:
    return int(np.any(db.pattern_catalog != 0, axis=1).sum())


def database_summary(db: Tetra3Database) -> dict:
    return {
        "n_stars": len(db.star_table),
        "n_patterns_total": len(db.pattern_catalog),
        "n_patterns_nonzero": count_nonzero_patterns(db),
        "star_table_shape": db.star_table.shape,
        "star_table_dtype": str(db.star_table.dtype),
        "pattern_catalog_shape": db.pattern_catalog.shape,
        "pattern_catalog_dtype": str(db.pattern_catalog.dtype),
        "min_fov": db.properties.min_fov,
        "max_fov": db.properties.max_fov,
        "star_max_magnitude": db.properties.star_max_magnitude,
        "star_catalog": db.properties.star_catalog,
        "pattern_mode": db.properties.pattern_mode,
    }
