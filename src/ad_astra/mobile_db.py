"""Ad Astra mobile binary database format (.adb).

Simple, fixed-layout binary format that Rust can read without
NumPy or pickle. Designed for mobile offline plate solving.

Format (little-endian):
  Header (64 bytes):
    magic        [4]   "ADB\0"
    version      u32   1
    n_stars      u32
    n_patterns   u32
    min_fov_deg  f32
    max_fov_deg  f32
    max_mag      f32
    epoch        u32   (e.g. 2000)
    pattern_size u32   (always 4 for tetra3)
    pattern_bins u32
    reserved     [20]  zeros

  Star records (n_stars * 28 bytes):
    catalog_id   u32
    ra_rad       f32
    dec_rad      f32
    x_unit       f32
    y_unit       f32
    z_unit       f32
    mag          f32

  Pattern records (n_patterns * 8 bytes):
    star_idx_0   u16
    star_idx_1   u16
    star_idx_2   u16
    star_idx_3   u16
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ADB_MAGIC = b"ADB\x00"
HEADER_FMT = "<4sIIIffffff16s"
HEADER_SIZE = struct.calcsize(HEADER_FMT)
STAR_FMT = "<Iffffff"
STAR_SIZE = struct.calcsize(STAR_FMT)
PATTERN_FMT = "<HHHH"
PATTERN_SIZE = struct.calcsize(PATTERN_FMT)


@dataclass(slots=True)
class AdbHeader:
    version: int
    n_stars: int
    n_patterns: int
    min_fov_deg: float
    max_fov_deg: float
    max_mag: float
    epoch: int
    pattern_size: int
    pattern_bins: int


class FormatError(Exception):
    pass


def write_adb(
    path: str,
    star_catalog_ids: np.ndarray,
    star_table: np.ndarray,
    pattern_catalog: np.ndarray,
    properties: dict,
) -> int:
    n_stars = len(star_table)
    n_patterns = len(pattern_catalog)

    with open(path, "wb") as fh:
        header = struct.pack(
            HEADER_FMT,
            ADB_MAGIC,
            1,
            n_stars,
            n_patterns,
            float(properties.get("min_fov", 0)),
            float(properties.get("max_fov", 180)),
            float(properties.get("star_max_magnitude", 7)),
            int(properties.get("epoch_equinox", 2000)),
            int(properties.get("pattern_size", 4)),
            int(properties.get("pattern_bins", 50)),
            b"\x00" * 16,
        )
        fh.write(header)

        for i in range(n_stars):
            row = star_table[i]
            cid = int(star_catalog_ids[i])
            fh.write(struct.pack(
                STAR_FMT,
                cid,
                float(row[0]),
                float(row[1]),
                float(row[2]),
                float(row[3]),
                float(row[4]),
                float(row[5]),
            ))

        for i in range(n_patterns):
            row = pattern_catalog[i]
            fh.write(struct.pack(
                PATTERN_FMT,
                int(row[0]),
                int(row[1]),
                int(row[2]),
                int(row[3]),
            ))

    return n_stars


def read_adb_header(path: str) -> AdbHeader:
    with open(path, "rb") as fh:
        data = fh.read(HEADER_SIZE)
        if len(data) < HEADER_SIZE:
            raise FormatError("File too short for header")
        (
            magic, version, n_stars, n_patterns,
            min_fov, max_fov, max_mag, epoch,
            pattern_size, pattern_bins, _reserved,
        ) = struct.unpack(HEADER_FMT, data)
        if magic != ADB_MAGIC:
            raise FormatError(f"Bad magic: {magic!r}")
        if version != 1:
            raise FormatError(f"Unsupported version: {version}")
        return AdbHeader(
            version=int(version),
            n_stars=int(n_stars),
            n_patterns=int(n_patterns),
            min_fov_deg=float(min_fov),
            max_fov_deg=float(max_fov),
            max_mag=float(max_mag),
            epoch=int(epoch),
            pattern_size=int(pattern_size),
            pattern_bins=int(pattern_bins),
        )


def read_adb_star(path: str, index: int) -> tuple[int, float, float, float, float, float, float]:
    offset = HEADER_SIZE + index * STAR_SIZE
    with open(path, "rb") as fh:
        fh.seek(offset)
        data = fh.read(STAR_SIZE)
        if len(data) < STAR_SIZE:
            raise FormatError(f"Truncated star record at index {index}")
        return struct.unpack(STAR_FMT, data)


def read_adb_pattern(path: str, index: int) -> tuple[int, int, int, int]:
    hdr = read_adb_header(path)
    offset = HEADER_SIZE + hdr.n_stars * STAR_SIZE + index * PATTERN_SIZE
    with open(path, "rb") as fh:
        fh.seek(offset)
        data = fh.read(PATTERN_SIZE)
        if len(data) < PATTERN_SIZE:
            raise FormatError(f"Truncated pattern record at index {index}")
        return struct.unpack(PATTERN_FMT, data)


def read_adb_all_stars(path: str) -> tuple[np.ndarray, np.ndarray]:
    hdr = read_adb_header(path)
    offset = HEADER_SIZE
    star_bytes = hdr.n_stars * STAR_SIZE
    with open(path, "rb") as fh:
        fh.seek(offset)
        raw = fh.read(star_bytes)
        if len(raw) < star_bytes:
            raise FormatError("Truncated star data")
        arr = np.frombuffer(raw, dtype=np.dtype([
            ("catalog_id", "<u4"),
            ("ra_rad", "<f4"),
            ("dec_rad", "<f4"),
            ("x_unit", "<f4"),
            ("y_unit", "<f4"),
            ("z_unit", "<f4"),
            ("mag", "<f4"),
        ]))
    catalog_ids = arr["catalog_id"]
    star_table = np.column_stack([
        arr["ra_rad"], arr["dec_rad"],
        arr["x_unit"], arr["y_unit"], arr["z_unit"],
        arr["mag"],
    ])
    return catalog_ids, star_table


def read_adb_all_patterns(path: str) -> np.ndarray:
    hdr = read_adb_header(path)
    offset = HEADER_SIZE + hdr.n_stars * STAR_SIZE
    pattern_bytes = hdr.n_patterns * PATTERN_SIZE
    with open(path, "rb") as fh:
        fh.seek(offset)
        raw = fh.read(pattern_bytes)
        if len(raw) < pattern_bytes:
            raise FormatError("Truncated pattern data")
        return np.frombuffer(raw, dtype="<u2").reshape(-1, 4)


def convert_tetra3_to_adb(tetra3_path: str, adb_path: str) -> AdbHeader:
    from .tetra3_db_inspect import load_tetra3_database

    db = load_tetra3_database(tetra3_db_inspect_path := tetra3_path)

    props = {
        "min_fov": db.properties.min_fov,
        "max_fov": db.properties.max_fov,
        "star_max_magnitude": db.properties.star_max_magnitude,
        "epoch_equinox": db.properties.epoch_equinox,
        "pattern_size": db.properties.pattern_size,
        "pattern_bins": db.properties.pattern_bins,
    }

    write_adb(
        path=adb_path,
        star_catalog_ids=db.star_catalog_ids,
        star_table=db.star_table,
        pattern_catalog=db.pattern_catalog,
        properties=props,
    )

    return read_adb_header(adb_path)
