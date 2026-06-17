"""Entrypoint for the ad-astra CLI."""

import argparse
import sys


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ad-astra")
    sub = parser.add_subparsers(dest="command")

    p_ingest = sub.add_parser(
        "ingest-catalog",
        help="parse a raw catalog CSV and write a normalized .bin file",
    )
    p_ingest.add_argument(
        "--input", "-i", required=True, help="path to raw catalog CSV"
    )
    p_ingest.add_argument(
        "--output", "-o", required=True, help="path for output .bin file"
    )
    p_ingest.add_argument(
        "--format",
        choices=["hipparcos", "synthetic"],
        default="hipparcos",
        help="input catalog format (default: hipparcos)",
    )
    p_ingest.add_argument(
        "--max-mag",
        type=float,
        default=None,
        help="filter stars fainter than this magnitude",
    )
    p_ingest.add_argument(
        "--stats", action="store_true", help="print catalog statistics after ingest"
    )

    p_gen = sub.add_parser(
        "generate-synthetic",
        help="generate a random synthetic star catalog for testing",
    )
    p_gen.add_argument(
        "--output", "-o", required=True, help="path for output .bin (or .csv) file"
    )
    p_gen.add_argument(
        "--n-stars", "-n", type=int, default=500, help="number of stars (default: 500)"
    )
    p_gen.add_argument(
        "--seed", type=int, default=42, help="random seed (default: 42)"
    )
    p_gen.add_argument(
        "--csv", action="store_true",
        help="output CSV instead of binary (for inspection)",
    )

    p_solve = sub.add_parser("solve", help="plate-solve a FITS/PNG image")
    p_solve.add_argument("image", nargs="?", help="path to image")

    p_build = sub.add_parser(
        "build-index", help="build offline search index from a .bin catalog"
    )
    p_build.add_argument("catalog", nargs="?", help="path to .bin catalog file")

    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
    elif args.command == "ingest-catalog":
        _cmd_ingest(args)
    elif args.command == "generate-synthetic":
        _cmd_generate(args)
    elif args.command == "solve":
        _cmd_solve(args)
    elif args.command == "build-index":
        _cmd_build_index(args)
    else:
        print(f"Command '{args.command}' not yet implemented.")


def _cmd_ingest(args) -> None:
    from .ingest import parse_hipparcos, parse_synthetic
    from .catalog import filter_by_magnitude, stats

    if args.format == "hipparcos":
        cat = parse_hipparcos(args.input)
    else:
        cat = parse_synthetic(args.input)

    print(f"Parsed {len(cat)} stars from {args.input}")

    if args.max_mag is not None:
        before = len(cat)
        cat = filter_by_magnitude(cat, args.max_mag)
        print(f"Magnitude filter (≤{args.max_mag}): kept {len(cat)} of {before}")

    if args.stats:
        st = stats(cat)
        for k, v in st.items():
            print(f"  {k}: {v}")

    n = cat.write_binary(args.output)
    print(f"Wrote {n} stars to {args.output}")


def _cmd_generate(args) -> None:
    from .ingest import generate_synthetic, export_synthetic

    cat = generate_synthetic(n_stars=args.n_stars, seed=args.seed)

    if args.csv:
        export_synthetic(args.output, cat)
        print(f"Wrote {len(cat)} synthetic stars to {args.output} (CSV)")
    else:
        n = cat.write_binary(args.output)
        print(f"Wrote {n} synthetic stars to {args.output} (binary)")


def _cmd_solve(args) -> None:
    if args.image is None:
        print("solve: image path required")
        return
    print(f"Solve command not yet implemented (image: {args.image})")


def _cmd_build_index(args) -> None:
    if args.catalog is None:
        print("build-index: catalog path required")
        return
    print(f"Index build from '{args.catalog}' not yet implemented")
