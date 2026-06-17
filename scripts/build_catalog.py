#!/usr/bin/env python3
"""One-shot script: generate a synthetic catalog and build a binary index.

Usage:
    python scripts/build_catalog.py                      # generates data/processed/synthetic.bin
    python scripts/build_catalog.py --n-stars 10000      # larger test catalog
    python scripts/build_catalog.py --help
"""

import argparse
import sys
from pathlib import Path

# Ensure the package is importable (works with editable install)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ad_astra.ingest import generate_synthetic
from ad_astra.catalog import filter_by_magnitude, stats


def main():
    parser = argparse.ArgumentParser(
        description="Generate a synthetic star catalog for development."
    )
    parser.add_argument(
        "--n-stars", "-n", type=int, default=5000,
        help="number of synthetic stars (default: 5000)",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="random seed (default: 42)",
    )
    parser.add_argument(
        "--max-mag", type=float, default=8.5,
        help="magnitude cutoff (default: 8.5)",
    )
    parser.add_argument(
        "--output", "-o",
        default="data/processed/synthetic.bin",
        help="output path (default: data/processed/synthetic.bin)",
    )
    args = parser.parse_args()

    cat = generate_synthetic(n_stars=args.n_stars, seed=args.seed)
    print(f"Generated {len(cat)} synthetic stars")

    cat = filter_by_magnitude(cat, args.max_mag)
    print(f"After mag filter (≤{args.max_mag}): {len(cat)} stars")

    st = stats(cat)
    print(f"  mag range: {st['mag_min']:.2f} – {st['mag_max']:.2f}")
    print(f"  ra  range: {st['ra_range']}")
    print(f"  dec range: {st['dec_range']}")

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    cat.write_binary(args.output)
    print(f"Wrote {len(cat)} stars → {args.output}")


if __name__ == "__main__":
    main()
