from ad_astra.solver import SkySolver, SolverConfig


def test_empty_sources_returns_failure():
    cfg = SolverConfig(fov_estimate_arcmin=30.0, max_magnitude=6.0)
    solver = SkySolver(cfg)
    result = solver.solve([])
    assert result.success is False
    assert "No source centroids" in result.log[0]


def test_non_empty_sources_returns_not_implemented():
    solver = SkySolver()
    result = solver.solve([(100.0, 200.0)])
    assert result.success is False
    assert "not yet implemented" in result.log[0]
