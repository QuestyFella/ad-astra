# ad-astra

Offline plate-solving engine that runs on mobile devices using preprocessed
astronomical catalogs. Takes a sky image and returns the celestial coordinates
(RA, Dec) and field-of-view of the imaged region, completely offline.

## Project structure

```
ad-astra/
  src/ad_astra/       # Python package: catalog, indexing, solver
  tests/              # Unit tests
  data/               # Raw & processed catalog data (gitignored, large)
  scripts/            # Catalog preprocessing / index build scripts
  docs/               # Architecture & design notes
```

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```
