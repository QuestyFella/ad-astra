# ad-astra

Offline plate-solving engine for mobile devices. Takes a sky image and
returns celestial coordinates (RA, Dec), field-of-view, and rotation —
completely offline, no network required.

## How it works

1. **Catalog preprocessing** (Python) — filters Gaia/Hipparcos/Tycho-2
   stars by magnitude and generates geometric quads (4-star patterns)
   hashed by invariant ratios.
2. **Database build** (Python) — packs stars + patterns into a compact
   binary `.adb` file designed for zero-copy `mmap` access from Rust.
3. **Plate solving** (Rust) — reads the `.adb` database, hashes quads
   from image sources, looks up candidates by hash, then verifies via
   multi-scale geometric matching with radial-distortion correction.

## Project structure

```
ad-astra/
  src/ad_astra/            # Python: catalog, indexing, projection, CLI
  native/ad_astra_solver/  # Rust: offline plate solver (reads .adb)
  scripts/                 # Catalog prep & database build scripts
  tests/                   # Python unit tests
  data/                     # Raw & processed catalog data (gitignored)
  docs/                    # Architecture & format documentation
  mobile/                  # React Native app (future)
```

## Quick start

### Python (catalog & database)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

### Rust (solver)

```bash
cd native/ad_astra_solver
cargo test                  # unit tests
cargo test -- --ignored     # integration tests (requires .adb database)
```

## Database format

See [`docs/mobile-database-format.md`](docs/mobile-database-format.md) for
the `.adb` binary format specification (64-byte header, star records,
pattern records — all little-endian, fixed-layout, no compression).

## Documentation

- [Architecture overview](docs/architecture.md)
- [`.adb` database format](docs/mobile-database-format.md)
