import pytest

from ad_astra.tetra3_db_inspect import (
    Tetra3Database,
    database_summary,
    get_pattern,
    get_star,
    load_tetra3_database,
)


def _has_tetra3() -> bool:
    try:
        import tetra3  # noqa: F401
        return True
    except ImportError:
        return False


pytestmark = pytest.mark.skipif(
    not _has_tetra3(),
    reason="tetra3 not installed",
)


def _default_db() -> Tetra3Database:
    from ad_astra.tetra3_adapter import default_database_path
    path = default_database_path()
    assert path is not None
    return load_tetra3_database(path)


def test_load_default_database():
    db = _default_db()
    assert len(db.star_table) > 0
    assert len(db.star_catalog_ids) > 0
    assert len(db.pattern_catalog) > 0


def test_star_table_shape():
    db = _default_db()
    assert db.star_table.shape[1] == 6
    assert db.star_table.dtype.name == "float32"


def test_catalog_ids_match_stars():
    db = _default_db()
    assert len(db.star_catalog_ids) == len(db.star_table)


def test_get_star():
    db = _default_db()
    star = get_star(db, 0)
    assert star.index == 0
    assert star.catalog_id > 0
    assert -3.15 <= star.ra_rad <= 6.3
    assert -1.58 <= star.dec_rad <= 1.58


def test_get_pattern():
    db = _default_db()
    pat = get_pattern(db, 0)
    assert len(pat.star_indices) == 4
    for idx in pat.star_indices:
        assert 0 <= idx < len(db.star_table)


def test_properties():
    db = _default_db()
    assert db.properties.min_fov > 0
    assert db.properties.max_fov > db.properties.min_fov
    assert db.properties.star_max_magnitude > 0
    assert db.properties.pattern_size == 4


def test_database_summary():
    db = _default_db()
    s = database_summary(db)
    assert s["n_stars"] > 0
    assert s["n_patterns_total"] > 0
    assert s["n_patterns_nonzero"] > 0
    assert s["min_fov"] > 0


def test_nonzero_patterns():
    db = _default_db()
    total = len(db.pattern_catalog)
    nonzero = 0
    import numpy as np
    nonzero = int(np.any(db.pattern_catalog != 0, axis=1).sum())
    assert nonzero > 0
    assert nonzero <= total
