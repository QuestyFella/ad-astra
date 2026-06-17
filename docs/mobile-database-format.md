# Ad Astra Mobile Database Format (`.adb`)

Simple, fixed-layout binary format for offline plate solving on mobile.
Designed to be readable by Rust/C without NumPy or pickle.

All values are **little-endian**.

## Header (64 bytes)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | bytes | Magic: `ADB\0` |
| 4 | 4 | u32 | Version: `1` |
| 8 | 4 | u32 | Number of stars |
| 12 | 4 | u32 | Number of patterns |
| 16 | 4 | f32 | Min FOV (degrees) |
| 20 | 4 | f32 | Max FOV (degrees) |
| 24 | 4 | f32 | Max star magnitude |
| 28 | 4 | u32 | Epoch (e.g. 2000) |
| 32 | 4 | u32 | Pattern size (4) |
| 36 | 4 | u32 | Pattern bins |
| 40 | 24 | bytes | Reserved (zeros) |

## Star Records (28 bytes each)

Immediately after header. `n_stars` records.

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | u32 | Catalog ID (Hipparcos) |
| 4 | 4 | f32 | RA (radians) |
| 8 | 4 | f32 | Dec (radians) |
| 12 | 4 | f32 | Unit vector X |
| 16 | 4 | f32 | Unit vector Y |
| 20 | 4 | f32 | Unit vector Z |
| 24 | 4 | f32 | Magnitude |

## Pattern Records (8 bytes each)

Immediately after star records. `n_patterns` records.

Each pattern is 4 star indices into the star table.

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | u16 | Star index 0 |
| 2 | 2 | u16 | Star index 1 |
| 4 | 2 | u16 | Star index 2 |
| 6 | 2 | u16 | Star index 3 |

## File Layout

```
[Header: 64 bytes]
[Star 0: 28 bytes]
[Star 1: 28 bytes]
...
[Star N-1: 28 bytes]
[Pattern 0: 8 bytes]
[Pattern 1: 8 bytes]
...
[Pattern M-1: 8 bytes]
```

## Size Estimates

| Database | Stars | Patterns | Total Size |
|----------|-------|----------|------------|
| Default (10-30 deg) | 8,818 | 12,369,092 | ~94 MB |
| Bright only (mag 6) | ~5,000 | ~2,000,000 | ~16 MB |
| Narrow FOV (5-15 deg) | ~3,000 | ~1,000,000 | ~8 MB |

## Conversion

From Tetra3 `.npz`:

```python
from ad_astra.mobile_db import convert_tetra3_to_adb
convert_tetra3_to_adb("default_database.npz", "default.adb")
```

## Rust Reading

The format is designed for zero-copy reading with `mmap` or sequential
`read_exact` calls. No variable-length fields, no alignment padding,
no compression.
