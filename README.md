# ad-astra

## (This project lowkey exists because I wanted to try Rust)

Offline plate-solving engine for mobile devices. Take a photo of the night
sky and get back celestial coordinates (RA, Dec), field-of-view, and image
rotation - completely offline, no network required.

Ad Astra converts [ESA's Tetra3](https://github.com/esa/tetra3) star-catalog
databases into a compact binary format (`.adb`) and ships its own Rust solver.
No NumPy or Python runtime is needed at solve time - the Rust solver runs
either natively (Android via JNI) or compiled to WebAssembly (fallback).

## Installation and Usage

### Python (catalog & database)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Build the `.adb` database (requires Tetra3 installed as an optional extra):

```bash
python scripts/build_adb.py
# → data/processed/default.adb  (~94 MB)
```

### Rust (solver)

```bash
cd native/ad_astra_solver
cargo test                     # unit tests
cargo test -- --ignored        # integration tests (requires .adb at data/processed/)
```

Build the WASM module (requires `wasm32-unknown-unknown` target +
`wasm-bindgen-cli`):

```bash
cd native/ad_astra_solver_wasm
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/ad_astra_solver_wasm.wasm \
  --out-dir ../../mobile/app/wasm --target web
```

Build the Android native library (requires Android NDK + `cargo-ndk`):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
scripts/build-android-native.sh
```

### Mobile app (Expo / React Native)

Requires Android SDK / NDK (API 34) and JDK 17.

```bash
cd mobile
npm install
npx expo run:android          # development build (requires device via USB)
```

For the WASM solver to work in Expo Go, serve the `.adb` database locally:

```bash
python -m http.server 8765     # from project root, serves data/processed/default.adb
```

For native Android development builds, the database should be copied to
the device's app storage (see `app/utils/databaseLoader.ts`).

## How the pipeline works

The project has three stages that run at different times:

```
                          build time (Python)                runtime (mobile)
  ┌─────────────┐     ┌─────────────────────┐     ┌──────────────────────────────┐
  │ Tetra3 .npz │ ──▶ │ scripts/build_adb.py │ ──▶ │      .adb binary database     │
  │ (catalog +  │     │ mobile_db.convert_  │     │   (loaded by path on Android) │
  │  patterns)  │     │ tetra3_to_adb()      │     └──────────┬───────────────────┘
  └─────────────┘     └─────────────────────┘                │
                                                                │
  ┌──────────────────────────────────────────────────────────▼─┐
  │                    Mobile app (Expo / React Native)         │
  │                                                            │
  │  camera capture ─▶ star detection ─▶ Rust solver ─────▶   │
  │                                        ├─ native (JNI)    │
  │                                        └─ WASM (fallback) │
  │                                          RA / Dec / FOV   │
  │                                          / rotation       │
  └────────────────────────────────────────────────────────────┘
```

### 1. Database conversion (Python, build time)

`scripts/build_adb.py` loads a Tetra3 `.npz` database - which contains
Hipparcos / Tycho-2 stars and geometric quad patterns - and serializes it
into the fixed-layout `.adb` binary format via `mobile_db.convert_tetra3_to_adb()`.

The `.adb` format (see [`docs/mobile-database-format.md`](docs/mobile-database-format.md))
is designed for zero-copy sequential reading:

| Section | Size | Contents |
|---------|------|---------|
| Header | 64 bytes | magic (`ADB\0`), version, star/pattern counts, FOV range, max magnitude, epoch |
| Star records | 28 bytes each | catalog ID (u32), RA/Dec (f32 rad), unit vector x/y/z (f32), magnitude (f32) |
| Pattern records | 8 bytes each | 4 star indices (u16 × 4) defining a geometric quad |

All little-endian, no padding, no compression. The default database
(~8 800 stars, ~12.4 M patterns) is ~94 MB; all-zero pattern slots are
dropped to roughly halve the size.

```bash
python scripts/build_adb.py
# → data/processed/default.adb
```

### 2. Plate solving (Rust, runtime)

At solve time the mobile app calls the Rust solver. On Android it runs
natively via JNI (`native/ad_astra_solver_ffi/`); on other platforms (web,
Expo Go) it uses the WebAssembly fallback (`native/ad_astra_solver_wasm/`).

The native JNI functions (`native/ad_astra_solver_ffi/src/lib.rs`):

```c
char* nativePing();
char* nativeLoadDatabase(const char* path);
char* nativeSolveSources(const char* sources_json, uint32_t width, uint32_t height);
void  nativeUnloadDatabase();
```

The WASM wrapper exposes a single function:

```typescript
solve(db_bytes: Uint8Array, sources_json: string,
      image_width_px: number, image_height_px: number): string
```

The solver pipeline (`native/ad_astra_solver/src/solve.rs`):

1. **Load database** - parse the `.adb` bytes into an `AdbDatabase`
   (stars + patterns) in memory.

2. **Build hash index** - iterate every catalog pattern, compute the 3D
   chord-distance matrix for the 4 stars, and hash the quad into a
   4-dimensional quantized key (`HashKey { i16 × 4 }`).
   The hash is **canonical** - invariant to translation, rotation, scale,
   and point ordering - by:
   - picking the longest baseline pair (A, B)
   - projecting the two inner stars onto the baseline using the cosine rule
   - taking `|y|` (unsigned) for rotation invariance
   - enforcing the first inner star's `x ≤ 0.5` for a canonical ordering

3. **Generate image quads** - from the top 25 detected sources
   (`MAX_SOURCES_FOR_QUADS`), enumerate all C(n, 4) combinations with a
   minimum baseline of 5 px (`MIN_BASELINE_PX`), and hash each using the
   same canonical scheme.

4. **Find candidates** - for each image-quad hash, look up the hash index
   with a neighbor radius of 1 bin (returns (2r+1)⁴ = 81 neighboring
   buckets), capped at 50 candidates per quad (`MAX_CANDIDATES_PER_QUAD`).

5. **Verify** - for each candidate, test **8 correspondence permutations**
   (`swap_baseline × swap_inner × reflect_y`) to resolve the sign/label
   ambiguity of the unsigned hash. For each permutation, run a three-phase
   geometric match:

   - **Phase 1 - initial fit**: 4-point affine transform
     (`Affine2D::fit`, least-squares via Cramer's rule) on the quad's
     tangent plane. Quick-reject if residual > 0.01 rad.
   - **Phase 2 - re-center**: estimate field center by applying the affine
     to the source centroid, build a field-centered `TangentPlane`, and
     re-project all catalog stars to minimise gnomonic distortion
     (dominant error source for wide fields > 10°).
   - **Phase 3 - multi-scale refit**: iteratively match sources to nearest
     catalog star within a shrinking radius (900 → 400 → 200 → 100 → 60
     arcseconds), refitting a `RadialQuad2D` (affine + radial-quadratic
     distortion term) via 4×4 Gaussian elimination with partial pivoting
     at each scale. Converges when the transform stops moving.

6. **Accept solution** - a candidate is accepted when ≥ 6 stars match
   (`MIN_MATCHED_STARS`) at the 60″ radius.

7. **Compute output** - the image center is unprojected through the fitted
   transform + tangent plane to get RA/Dec. Pixel scale comes from the
   affine column norm; FOV = scale × image dimensions; roll from
   `atan2(c, a)`. Confidence is tiered: 0.95 (≥ 8 stars & RMS < 15″),
   0.75 (≥ 5), 0.5 (≥ 3), else 0.25.

### 3. Mobile app (Expo / React Native, runtime)

The app has two tabs: **Solve** and **About**.

**Solve flow:**

1. **Capture** - user takes a photo or picks one from the library
   (`expo-image-picker`).
2. **Star detection** (`app/utils/starDetection.ts`) - pure-TypeScript
   pipeline: convert to grayscale → box-blur background estimation →
   MAD noise estimate → threshold at `thresholdSigma × noise` → flood-fill
   connected components → flux-weighted centroid. Returns the top 50 stars
   by flux. Images are pre-resized to ≤ 1024 px (`expo-image-manipulator`).
3. **Solve** (`app/utils/solver.ts`) - the solver wrapper detects the
    available backend at startup: native Android module first, WASM as
    fallback. Sources are JSON-serialized and sent to whichever backend
    is active. The result is parsed back from JSON.
4. **Display** (`app/screens/ResultScreen.tsx`) - shows the image with a
   star overlay (green dots = detected, orange rings = matched), a
   coordinate readout (RA, Dec, FOV, Rotation), and share/new-photo actions.

The solver and database are loaded once at app startup
(`App.tsx` → `initSolver()` + `loadDatabase()`). On Android the database
is loaded from a local file path via JNI (avoids copying 47 MB through
the JS bridge). In development the `.adb` is fetched from a local HTTP
server or bundled; in production it can be bundled or downloaded.

## Project structure

```
ad-astra/
  src/ad_astra/                 # Python: catalog, indexing, projection, CLI
    mobile_db.py                #   .adb format writer (production)
    tetra3_db_inspect.py        #   Tetra3 .npz loader
    tetra3_adapter.py           #   optional Tetra3 reference solver
    ingest.py / catalog.py      #   catalog parsing / dataclasses
    binary.py                   #   older ASTR format (prototype)
    features.py / solver.py     #   Python solver prototype (stub - real algo is Rust)
    projection.py / synthetic.py  # gnomonic projection / test-field generation
    coordinates.py / index.py / sources.py / solver_models.py / cli.py
  native/
    ad_astra_solver/            # Rust: offline plate solver (reads .adb)
      src/
        db.rs                   #   .adb reader (file + in-memory bytes)
        hash.rs                 #   canonical quad hashing + HashIndex
        solve.rs                #   the 6-stage solving algorithm
        geometry.rs             #   Vec3, TangentPlane, Affine2D, RadialQuad2D
        types.rs                 #   serde request/result DTOs
      tests/solve_real_db.rs    #   integration tests (needs .adb)
    ad_astra_solver_wasm/       # Rust → WASM wrapper (wasm-bindgen)
    ad_astra_solver_ffi/        # Rust → Android JNI wrapper (.so)
  mobile/                       # Expo / React Native app
    modules/
      ad-astra-solver-native/   #   local Expo native module (Kotlin/JNI)
  ...
    app/screens/                #   HomeScreen, SolvingScreen, ResultScreen, AboutScreen
    app/components/             #   CoordinateReadout, StarMarkerLayer
    app/store/solver.ts         #   solve orchestration hook
    app/utils/                  #   starDetection.ts, solver.ts (WASM), databaseLoader.ts
    app/wasm/                   #   compiled .wasm + wasm-bindgen glue
  scripts/
    build_adb.py                # production DB-build (Tetra3 .npz → .adb)
    build_catalog.py            # dev synthetic catalog → ASTR .bin
  tests/                        # Python unit tests (pytest)
  data/                         # raw & processed catalog data (gitignored)
  docs/                         # architecture & format documentation
```

## Database format

See [`docs/mobile-database-format.md`](docs/mobile-database-format.md) for
the full `.adb` binary format specification (64-byte header, star records,
pattern records - all little-endian, fixed-layout, no compression).

## Documentation

- [Architecture overview](docs/architecture.md)
- [`.adb` database format](docs/mobile-database-format.md)

## Credits

Star catalog databases derived from [ESA's Tetra3](https://github.com/esa/tetra3)
plate-solving library. The Rust solver, hash index, WASM bridge, and mobile
app are original Ad Astra code.
