from ad_astra.solver_models import (
    DatabaseInfo,
    SolveRequest,
    SolveResult,
    select_database_for_fov,
)


def test_solve_result_success():
    r = SolveResult(
        success=True,
        ra_deg=83.82,
        dec_deg=-5.39,
        roll_deg=-12.6,
        fov_x_deg=39.6,
        fov_y_deg=27.0,
        confidence=0.95,
        matched_stars=28,
        rms_error_arcsec=1.8,
        solve_time_ms=142,
    )
    assert r.success
    assert r.center == (83.82, -5.39)


def test_solve_result_failure():
    r = SolveResult(success=False, log=["No stars detected."])
    assert not r.success
    assert r.center is None


def test_solve_request_defaults():
    req = SolveRequest(image_path="/tmp/test.jpg")
    assert req.image_path == "/tmp/test.jpg"
    assert req.sources is None
    assert req.fov_estimate_deg is None
    assert req.return_overlay is True


def test_select_database_for_fov_exact():
    dbs = [
        DatabaseInfo("wide", "/tmp/w.npz", 20, 60, 7.0, 40.0),
        DatabaseInfo("narrow", "/tmp/n.npz", 5, 20, 8.0, 15.0),
    ]
    result = select_database_for_fov(dbs, 30.0, 20.0)
    assert result is not None
    assert result.id == "wide"


def test_select_database_for_fov_narrow():
    dbs = [
        DatabaseInfo("wide", "/tmp/w.npz", 20, 60, 7.0, 40.0),
        DatabaseInfo("narrow", "/tmp/n.npz", 5, 20, 8.0, 15.0),
    ]
    result = select_database_for_fov(dbs, 10.0, 8.0)
    assert result is not None
    assert result.id == "narrow"


def test_select_database_for_fov_closest():
    dbs = [
        DatabaseInfo("a", "/tmp/a.npz", 10, 30, 7.0, 20.0),
        DatabaseInfo("b", "/tmp/b.npz", 30, 70, 7.0, 50.0),
    ]
    result = select_database_for_fov(dbs, 28.0, 20.0)
    assert result is not None
    assert result.id == "b"


def test_select_database_skips_not_ready():
    dbs = [
        DatabaseInfo("ready", "/tmp/r.npz", 10, 60, 7.0, 40.0, ready=True),
        DatabaseInfo("not", "/tmp/n.npz", 10, 60, 7.0, 40.0, ready=False),
    ]
    result = select_database_for_fov(dbs, 30.0, 20.0)
    assert result is not None
    assert result.id == "ready"


def test_select_database_empty():
    assert select_database_for_fov([], 30.0, 20.0) is None
