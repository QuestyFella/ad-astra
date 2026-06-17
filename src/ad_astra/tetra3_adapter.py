"""Tetra3 adapter — wraps the Tetra3 Python library as a reference solver.

This adapter is used for development, testing, and as a correctness
reference. The mobile app will use a native Rust solver that reads
the same database format.
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from .solver_models import (
    DatabaseInfo,
    DetectedStar,
    ImageSource,
    MatchedStar,
    OverlayData,
    PointingError,
    SolveRequest,
    SolveResult,
)


def _has_tetra3() -> bool:
    try:
        import tetra3  # noqa: F401
        return True
    except ImportError:
        return False


class Tetra3Adapter:
    """Wraps Tetra3 as a reference solver backend."""

    def __init__(self, database_path: str | None = None):
        if not _has_tetra3():
            raise ImportError(
                "tetra3 is not installed. Install with: pip install ad-astra[tetra3]"
            )
        from tetra3 import Tetra3
        self._t3 = Tetra3()
        if database_path:
            self._t3.load_database(database_path)
        self._database_path = database_path

    @property
    def has_database(self) -> bool:
        return self._t3.has_database

    @property
    def database_path(self) -> str | None:
        return self._database_path

    def solve(self, request: SolveRequest) -> SolveResult:
        if not self.has_database:
            return SolveResult(
                success=False,
                log=["No database loaded."],
            )

        if request.image_path:
            return self._solve_image(request)
        elif request.sources:
            return self._solve_sources(request)
        else:
            return SolveResult(
                success=False,
                log=["No image_path or sources provided."],
            )

    def _solve_image(self, request: SolveRequest) -> SolveResult:
        from tetra3 import get_centroids_from_image
        from PIL import Image

        path = Path(request.image_path)  # type: ignore[arg-type]
        if not path.exists():
            return SolveResult(
                success=False,
                log=[f"Image not found: {path}"],
            )

        image = Image.open(path).convert("L")
        width, height = image.size

        centroids = get_centroids_from_image(
            np.array(image),
            return_images=False,
        )

        if len(centroids) == 0:
            return SolveResult(
                success=False,
                image_width_px=width,
                image_height_px=height,
                log=["No stars detected in image."],
            )

        return self._solve_centroids(
            centroids,
            size=(height, width),
            request=request,
        )

    def _solve_sources(self, request: SolveRequest) -> SolveResult:
        if not request.sources:
            return SolveResult(success=False, log=["No sources provided."])

        width = request.image_width_px or 1200
        height = request.image_height_px or 1600

        centroids = np.array([[s.y_px, s.x_px] for s in request.sources])
        fluxes = [s.flux for s in request.sources]

        return self._solve_centroids(
            centroids,
            size=(height, width),
            request=request,
            source_fluxes=fluxes,
        )

    def _solve_centroids(
        self,
        centroids: np.ndarray,
        size: tuple[int, int],
        request: SolveRequest,
        source_fluxes: list[float | None] | None = None,
    ) -> SolveResult:
        start = time.monotonic()

        try:
            raw = self._t3.solve_from_centroids(
                star_centroids=centroids,
                size=size,
                fov_estimate=request.fov_estimate_deg,
                fov_max_error=request.fov_max_error_deg,
                solve_timeout=request.solve_timeout_ms,
                target_pixel=None,
                return_matches=True,
                return_visual=False,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            return SolveResult(
                success=False,
                solve_time_ms=elapsed,
                log=[f"Tetra3 exception: {e}"],
            )

        elapsed = int((time.monotonic() - start) * 1000)

        if raw is None or "RA" not in raw:
            return SolveResult(
                success=False,
                solve_time_ms=elapsed,
                log=["Tetra3 returned no solution."],
            )

        ra = float(raw["RA"])
        dec = float(raw["Dec"])
        roll = float(raw["Roll"])
        fov = float(raw["FOV"])
        rmse = float(raw.get("RMSE", 0))
        matches = int(raw.get("Matches", 0))
        prob = float(raw.get("Prob", 1.0))

        confidence = max(0.0, 1.0 - prob)

        height, width = size
        pixel_scale = fov * 3600 / width

        overlay = None
        if request.return_overlay:
            overlay = self._build_overlay(
                centroids=centroids,
                raw=raw,
                size=size,
                source_fluxes=source_fluxes,
                target_ra=request.target_ra_deg,
                target_dec=request.target_dec_deg,
                solved_ra=ra,
                solved_dec=dec,
            )

        return SolveResult(
            success=True,
            ra_deg=ra,
            dec_deg=dec,
            roll_deg=roll,
            fov_x_deg=fov,
            fov_y_deg=fov * height / width,
            pixel_scale_arcsec=pixel_scale,
            confidence=confidence,
            matched_stars=matches,
            rms_error_arcsec=rmse,
            solve_time_ms=elapsed,
            database_id=self._database_path,
            overlay=overlay,
            log=[
                f"Solved: RA={ra:.4f} Dec={dec:.4f} Roll={roll:.2f}",
                f"FOV={fov:.2f} deg, Matches={matches}, RMSE={rmse:.1f} arcsec",
                f"Solve time: {elapsed} ms",
            ],
        )

    def _build_overlay(
        self,
        centroids: np.ndarray,
        raw: dict,
        size: tuple[int, int],
        source_fluxes: list[float | None] | None,
        target_ra: float | None,
        target_dec: float | None,
        solved_ra: float,
        solved_dec: float,
    ) -> OverlayData:
        detected: list[DetectedStar] = []
        for i, c in enumerate(centroids):
            flux = 1.0
            if source_fluxes and i < len(source_fluxes) and source_fluxes[i] is not None:
                flux = float(source_fluxes[i])  # type: ignore[arg-type]
            detected.append(DetectedStar(
                x_px=float(c[1]),
                y_px=float(c[0]),
                brightness=min(1.0, flux),
            ))

        matched: list[MatchedStar] = []
        matched_data = raw.get("matched_stars")
        if matched_data is not None:
            for m in matched_data:
                if hasattr(m, "__len__") and len(m) >= 2:
                    matched.append(MatchedStar(
                        image_x=float(m[1]),
                        image_y=float(m[0]),
                    ))

        pointing = None
        if target_ra is not None and target_dec is not None:
            from .coordinates import Equatorial, angular_separation, equatorial_to_unit
            a = equatorial_to_unit(Equatorial(target_ra, target_dec))
            b = equatorial_to_unit(Equatorial(solved_ra, solved_dec))
            error_deg = angular_separation(a, b)
            pointing = PointingError(
                target_ra_deg=target_ra,
                target_dec_deg=target_dec,
                actual_ra_deg=solved_ra,
                actual_dec_deg=solved_dec,
                error_arcmin=error_deg * 60,
            )

        return OverlayData(
            detected_stars=detected,
            matched_stars=matched,
            pointing_error=pointing,
        )


def list_databases(directory: str) -> list[DatabaseInfo]:
    dbs: list[DatabaseInfo] = []
    path = Path(directory)
    if not path.exists():
        return dbs
    for f in path.glob("*.npz"):
        dbs.append(DatabaseInfo(
            id=f.stem,
            path=str(f),
            fov_min_deg=0,
            fov_max_deg=180,
            mag_limit=7.0,
            size_mb=f.stat().st_size / (1024 * 1024),
        ))
    return dbs


def default_database_path() -> str | None:
    try:
        import tetra3
        pkg_dir = Path(tetra3.__file__).parent
        db = pkg_dir / "data" / "default_database.npz"
        if db.exists():
            return str(db)
    except Exception:
        pass
    return None
