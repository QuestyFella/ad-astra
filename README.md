# ad-astra

Offline plate-solving engine for mobile devices. Takes a sky image and
returns celestial coordinates (RA, Dec), field-of-view, and rotation —
completely offline, no network required.

Built on star catalog databases from [ESA's Tetra3](https://github.com/esa/tetra3)
plate-solving library. Ad Astra converts these into a compact binary
format (`.adb`) and ships its own Rust solver — no NumPy or Python runtime
needed at solve time. The mobile app (Expo / React Native) provides camera
capture, solving UI, and results display.

## How it works

1. **Database conversion** (Python) — converts Tetra3 `.npz` databases
   (Hipparcos/Tycho-2 stars, geometric quad patterns) into the fixed-layout
   `.adb` binary format designed for zero-copy `mmap` access from Rust.
2. **Plate solving** (Rust) — reads the `.adb` database, hashes quads
   from image sources, looks up candidates by hash, then verifies via
   multi-scale geometric matching with radial-distortion correction.
3. **Mobile app** (Expo / React Native) — camera capture, source extraction,
   solver invocation, and results display with star overlays.

## Project structure

```
ad-astra/
  src/ad_astra/            # Python: catalog, indexing, projection, CLI
  native/ad_astra_solver/  # Rust: offline plate solver (reads .adb)
  mobile/                  # Expo / React Native app (camera, solving, results)
  scripts/                 # Catalog prep & database build scripts
  tests/                   # Python unit tests
  data/                     # Raw & processed catalog data (gitignored)
  docs/                    # Architecture & format documentation
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

### Mobile app (Expo / React Native)

```bash
cd mobile
npm install
npm start                   # Expo dev server (press i for iOS, a for Android)
```

## Database format

See [`docs/mobile-database-format.md`](docs/mobile-database-format.md) for
the `.adb` binary format specification (64-byte header, star records,
pattern records — all little-endian, fixed-layout, no compression).

## Documentation

- [Architecture overview](docs/architecture.md)
- [`.adb` database format](docs/mobile-database-format.md)
