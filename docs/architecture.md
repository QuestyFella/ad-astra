# Architecture

> Early notes — will evolve as design solidifies.

## High-level pipeline

```
Catalog (Gaia/Hipparcos/Tycho-2)
        │
        ▼
  Catalog preprocessing ──► filtered by magnitude, deduplicated
        │
        ▼
  Index builder           ──► compact kd-tree / HEALPix grid + quads
        │
        ▼
  Offline index blob ───────► bundled into mobile app
```

## Mobile runtime flow

1. **Star detection** — locate source centroids in the input image.
2. **Quad generation** — pick the brightest sources and form geometric
   quads with invariants.
3. **Index lookup** — match quad hashes against the offline index to
   get candidate sky regions.
4. **Verification** — geometric consensus (Bayesian or RANSAC-style)
   over the remaining sources.
5. **Output** — RA/Dec center, pixel scale, rotation angle.

## Performance targets (phone)

- Solve time < 2 s
- Image → centroids < 500 ms
- Index size < 10 MB (compressed)

## Language / platform split

Phase | Tooling
---|---
Catalog prep | Python (this repo)
Solver prototype | Python (this repo)
Mobile app | TBD (React Native / Flutter — future repo)
