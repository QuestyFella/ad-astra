#!/usr/bin/env python3
"""Convert a Tetra3 .npz database to the Ad Astra .adb binary format.

The .adb format is documented in docs/mobile-database-format.md — a
fixed-layout little-endian binary readable by the Rust solver without
NumPy or pickle.

Usage:
    # Convert Tetra3's bundled default database → data/processed/default.adb
    python scripts/build_adb.py

    # Convert an explicit source
    python scripts/build_adb.py --source path/to/db.npz --output data/processed/custom.adb

    # Without zero-pattern filtering (faithful 1:1 with the .npz)
    python scripts/build_adb.py --keep-zero-patterns

The default behaviour drops all-zero pattern records (unused slots in the
Tetra3 catalog) since they cannot match anything and roughly halve the
output size.  Pass --keep-zero-patterns for a faithful conversion.
"""

import argparse
import sys
from pathlib import Path

# Make the package importable without an editable install.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np

from ad_astra.mobile_db import read_adb_header, write_adb
from ad_astra.tetra3_adapter import default_database_path
from ad_astra.tetra3_db_inspect import load_tetra3_database


def human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024.0
    return f"{n:.1f} GB"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert a Tetra3 .npz database to the Ad Astra .adb format.",
    )
    parser.add_argument(
        "--source", "-s",
        help="path to the Tetra3 .npz database (default: tetra3's bundled default_database.npz)",
    )
    parser.add_argument(
        "--output", "-o",
        default="data/processed/default.adb",
        help="output .adb path (default: data/processed/default.adb)",
    )
    parser.add_argument(
        "--keep-zero-patterns",
        action="store_true",
        help="keep all-zero pattern records (default: drop them)",
    )
    args = parser.parse_args()

    source = args.source or default_database_path()
    if not source:
        print("error: no source database. Install tetra3 or pass --source.", file=sys.stderr)
        return 1
    if not Path(source).exists():
        print(f"error: source not found: {source}", file=sys.stderr)
        return 1

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Loading Tetra3 database: {source}")
    db = load_tetra3_database(source)
    n_stars_in = len(db.star_table)
    n_patterns_in = len(db.pattern_catalog)
    print(f"  stars:    {n_stars_in:>10,}")
    print(f"  patterns: {n_patterns_in:>10,}  ({db.properties.pattern_mode})")
    print(f"  FOV:      {db.properties.min_fov} – {db.properties.max_fov} deg")
    print(f"  max mag:  {db.properties.star_max_magnitude}")
    print(f"  catalog:  {db.properties.star_catalog}")

    pattern_catalog = db.pattern_catalog
    n_nonzero = int(np.any(pattern_catalog != 0, axis=1).sum())
    print(f"  nonzero patterns: {n_nonzero:>10,}")

    if not args.keep_zero_patterns and n_nonzero < n_patterns_in:
        keep = np.any(pattern_catalog != 0, axis=1)
        pattern_catalog = pattern_catalog[keep]
        dropped = n_patterns_in - n_nonzero
        print(f"  dropping {dropped:,} all-zero pattern records")
    else:
        print("  keeping all pattern records (zero-pattern filtering disabled)")

    properties = {
        "min_fov": db.properties.min_fov,
        "max_fov": db.properties.max_fov,
        "star_max_magnitude": db.properties.star_max_magnitude,
        "epoch_equinox": db.properties.epoch_equinox,
        "pattern_size": db.properties.pattern_size,
        "pattern_bins": db.properties.pattern_bins,
    }

    print(f"\nWriting .adb: {out_path}")
    n_written = write_adb(
        path=str(out_path),
        star_catalog_ids=db.star_catalog_ids,
        star_table=db.star_table,
        pattern_catalog=pattern_catalog,
        properties=properties,
    )
    file_size = out_path.stat().st_size
    print(f"  wrote {n_written:,} stars, {len(pattern_catalog):,} patterns")
    print(f"  file size: {human_bytes(file_size)}")

    print("\nVerifying header...")
    hdr = read_adb_header(str(out_path))
    assert hdr.n_stars == n_written, (hdr.n_stars, n_written)
    assert hdr.n_patterns == len(pattern_catalog), (hdr.n_patterns, len(pattern_catalog))
    print(f"  version={hdr.version}  stars={hdr.n_stars}  patterns={hdr.n_patterns}")
    print(f"  fov={hdr.min_fov_deg}–{hdr.max_fov_deg} deg  mag≤{hdr.max_mag}  bins={hdr.pattern_bins}")
    print("\nOK.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
