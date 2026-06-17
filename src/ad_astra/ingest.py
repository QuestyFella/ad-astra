"""Catalog ingest: parse, filter, and normalize star catalogs.

Supported input formats
-----------------------
- hipparcos : the Hipparcos main catalog (hip_main.dat style CSV)
- synthetic : minimal CSV with columns: id,ra_deg,dec_deg,mag

Hipparcos CSV format (subset of fields we use):
    HIP, Proxy, Vmag, RA_ICRS_deg, DE_ICRS_deg, ...
"""

import csv
import math

from .catalog import Catalog, Star


def parse_hipparcos(path: str) -> Catalog:
    """Parse a Hipparcos catalog CSV file.

    Expected columns (named or positional):
        HIP, Vmag, RA_ICRS_deg, DE_ICRS_deg
    """
    stars: list[Star] = []
    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)

        # Build column index from header if present, otherwise assume positional
        col_idx: dict[str, int] = {}
        if header:
            row0 = next(reader)
            # Detect if first row is header or data by checking if first field is a number
            try:
                int(row0[0])
                header_is_data = True
            except (ValueError, IndexError):
                header_is_data = False

            if header_is_data:
                # header was actually first data row — use positional fallback
                col_idx = {"HIP": 0, "Vmag": 1, "RA_ICRS_deg": 2, "DE_ICRS_deg": 3}
                # rewind by processing row0 below
                _process_row(row0, col_idx, stars)
            else:
                for i, col in enumerate(header):
                    col_idx[col.strip()] = i
        else:
            col_idx = {"HIP": 0, "Vmag": 1, "RA_ICRS_deg": 2, "DE_ICRS_deg": 3}

        for row in reader:
            _process_row(row, col_idx, stars)

    name = _stem(path)
    return Catalog(name=name, epoch=2000.0, stars=stars)


def parse_synthetic(path: str, epoch: float = 2000.0) -> Catalog:
    """Parse a simple CSV: id,ra_deg,dec_deg,mag"""
    stars: list[Star] = []
    name = _stem(path)
    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        _ = next(reader, None)  # skip header
        for row in reader:
            if not row or row[0].startswith("#"):
                continue
            sid = int(row[0])
            ra = float(row[1])
            dec = float(row[2])
            mag = float(row[3]) if len(row) > 3 and row[3].strip() else None
            stars.append(Star(id=sid, ra_deg=ra, dec_deg=dec, mag=mag))
    return Catalog(name=name, epoch=epoch, stars=stars)


def generate_synthetic(n_stars: int = 200, seed: int | None = 42) -> Catalog:
    """Generate a random synthetic star catalog for testing.

    Stars are uniformly distributed on the sky (using equal-area sphere
    sampling), with magnitudes drawn from a Gaussian centered at 7.0.
    """
    import random

    rng = random.Random(seed)
    stars: list[Star] = []
    for i in range(n_stars):
        ra = rng.uniform(0.0, 360.0)
        dec = math.degrees(math.asin(rng.uniform(-1.0, 1.0)))
        mag = max(0.0, rng.gauss(7.0, 2.0))
        stars.append(Star(id=i + 1, ra_deg=ra, dec_deg=dec, mag=mag))
    return Catalog(name="synthetic", epoch=2000.0, stars=stars)


def export_synthetic(path: str, catalog: Catalog) -> None:
    """Write a synthetic-style CSV that can be re-ingested."""
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "ra_deg", "dec_deg", "mag"])
        for s in catalog.stars:
            w.writerow([
                s.id,
                f"{s.ra_deg:.8f}",
                f"{s.dec_deg:.8f}",
                f"{s.mag:.4f}" if s.mag is not None else "",
            ])


def _stem(path: str) -> str:
    import os
    return os.path.splitext(os.path.basename(path))[0]


def _process_row(row: list[str], col_idx: dict[str, int], stars: list[Star]) -> None:
    try:
        hip = int(row[col_idx["HIP"]])
    except (ValueError, KeyError, IndexError):
        return
    try:
        mag_str = row[col_idx["Vmag"]].strip()
        mag = float(mag_str) if mag_str else None
    except (ValueError, KeyError, IndexError):
        mag = None
    try:
        ra = float(row[col_idx["RA_ICRS_deg"]])
        dec = float(row[col_idx["DE_ICRS_deg"]])
    except (ValueError, KeyError, IndexError):
        return

    if not (-90.0 <= dec <= 90.0):
        return
    if math.isnan(ra) or math.isnan(dec):
        return

    stars.append(Star(id=hip, ra_deg=ra, dec_deg=dec, mag=mag))
