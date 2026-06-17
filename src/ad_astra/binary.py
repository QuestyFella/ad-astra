"""Compact fixed-width binary serialization for star catalogs.

Format (little-endian)
----------------------
Header (20 bytes):
    magic    [4]   "ASTR"
    version  u32   1
    count    u32   number of stars
    epoch    f64   catalog epoch (e.g. 2000.0)

Star record (28 bytes each):
    id       u32   star identifier
    ra       f32   right ascension (degrees, 0-360)
    dec      f32   declination (degrees, -90 to 90)
    mag      f32   apparent magnitude (NaN = unknown)
    vx       f32   unit-sphere x
    vy       f32   unit-sphere y
    vz       f32   unit-sphere z
"""

import struct
from dataclasses import dataclass
from typing import Iterator

from .coordinates import Vec3, equatorial_to_unit
from .catalog import Catalog, Star

MAGIC = b"ASTR"
HEADER_FMT = "<4sIIff"
HEADER_SIZE = struct.calcsize(HEADER_FMT)

STAR_FMT = "<Iffffff"
STAR_SIZE = struct.calcsize(STAR_FMT)


class FormatError(Exception):
    """Raised when binary data does not match the expected format."""


@dataclass
class BinaryHeader:
    version: int
    count: int
    epoch: float
    pad: float


def write_catalog(path: str, catalog: Catalog) -> int:
    """Write a Catalog to a .bin file. Returns number of stars written."""
    stars = catalog.stars
    count = len(stars)

    with open(path, "wb") as fh:
        header = struct.pack(
            HEADER_FMT,
            MAGIC,
            1,  # version
            count,
            catalog.epoch,
            0.0,  # padding
        )
        fh.write(header)

        for s in stars:
            v = equatorial_to_unit(s.equatorial())
            row = struct.pack(
                STAR_FMT,
                s.id,
                s.ra_deg,
                s.dec_deg,
                s.mag if s.mag is not None else float("nan"),
                v.x,
                v.y,
                v.z,
            )
            fh.write(row)

    return count


def read_catalog(path: str) -> Catalog:
    """Read a Catalog from a .bin file."""
    with open(path, "rb") as fh:
        hdr_bytes = fh.read(HEADER_SIZE)
        if len(hdr_bytes) < HEADER_SIZE:
            raise FormatError("File too short for header")

        magic, version, count, epoch, _ = struct.unpack(HEADER_FMT, hdr_bytes)
        if magic != MAGIC:
            raise FormatError(f"Bad magic: {magic!r}")
        if version != 1:
            raise FormatError(f"Unsupported version: {version}")

        stars: list[Star] = []
        for _ in range(count):
            row_bytes = fh.read(STAR_SIZE)
            if len(row_bytes) < STAR_SIZE:
                raise FormatError(f"Truncated at star {len(stars)} of {count}")
            sid, ra, dec, mag, vx, vy, vz = struct.unpack(STAR_FMT, row_bytes)
            mag_val = None if (mag != mag) else mag  # NaN check
            stars.append(Star(id=sid, ra_deg=ra, dec_deg=dec, mag=mag_val))

    # Derive catalog name from filename stem
    import os
    name = os.path.splitext(os.path.basename(path))[0]
    return Catalog(name=name, epoch=epoch, stars=stars)


def iter_stars(path: str) -> Iterator[Star]:
    """Stream stars from a .bin file without loading all into memory."""
    with open(path, "rb") as fh:
        hdr_bytes = fh.read(HEADER_SIZE)
        if len(hdr_bytes) < HEADER_SIZE:
            raise FormatError("File too short for header")

        magic, version, count, epoch, _ = struct.unpack(HEADER_FMT, hdr_bytes)
        if magic != MAGIC:
            raise FormatError(f"Bad magic: {magic!r}")
        if version != 1:
            raise FormatError(f"Unsupported version: {version}")

        for _ in range(count):
            row_bytes = fh.read(STAR_SIZE)
            if len(row_bytes) < STAR_SIZE:
                raise FormatError("Truncated record")
            sid, ra, dec, mag, _vx, _vy, _vz = struct.unpack(STAR_FMT, row_bytes)
            mag_val = None if (mag != mag) else mag
            yield Star(id=sid, ra_deg=ra, dec_deg=dec, mag=mag_val)


def read_header(path: str) -> BinaryHeader:
    """Peek at only the binary header (fast)."""
    with open(path, "rb") as fh:
        hdr_bytes = fh.read(HEADER_SIZE)
        if len(hdr_bytes) < HEADER_SIZE:
            raise FormatError("File too short for header")
        magic, version, count, epoch, pad = struct.unpack(HEADER_FMT, hdr_bytes)
        if magic != MAGIC:
            raise FormatError(f"Bad magic: {magic!r}")
        if version != 1:
            raise FormatError(f"Unsupported version: {version}")
        return BinaryHeader(version=version, count=count, epoch=epoch, pad=pad)
