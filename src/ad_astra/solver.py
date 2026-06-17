"""Plate-solver interface and result types."""

from dataclasses import dataclass, field

from .coordinates import Equatorial


@dataclass
class SolveResult:
    success: bool
    ra_deg: float | None = None
    dec_deg: float | None = None
    fov_arcmin: float | None = None
    n_stars_matched: int = 0
    log: list[str] = field(default_factory=list)

    def center(self) -> Equatorial | None:
        if self.ra_deg is not None and self.dec_deg is not None:
            return Equatorial(ra_deg=self.ra_deg, dec_deg=self.dec_deg)
        return None


@dataclass
class SolverConfig:
    fov_estimate_arcmin: float = 60.0
    max_magnitude: float = 8.0
    timeout_sec: float = 5.0


class SkySolver:
    """Placeholder solver — will integrate a geometric-hashing or
    quad-based astrometry engine."""

    def __init__(self, config: SolverConfig | None = None):
        self.config = config or SolverConfig()

    def solve(self, sources: list[tuple[float, float]]) -> SolveResult:
        """Accept a list of (x_px, y_px) centroid positions and return a result.

        A real implementation will:
        1. Build quads from the input sources.
        2. Match against the offline Index.
        3. Verify with a geometric consensus.
        4. Return RA/Dec/FOV.
        """
        if not sources:
            return SolveResult(
                success=False,
                log=["No source centroids provided."],
            )
        return SolveResult(
            success=False,
            log=["SkySolver.solve not yet implemented."],
        )
