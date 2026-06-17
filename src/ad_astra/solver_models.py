"""Normalized solver result and request models.

These models are backend-agnostic. The Tetra3 adapter and future native
solver both produce SolveResult. The UI consumes SolveResult.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ImageSource:
    x_px: float
    y_px: float
    flux: float | None = None


@dataclass(slots=True)
class DetectedStar:
    x_px: float
    y_px: float
    brightness: float


@dataclass(slots=True)
class MatchedStar:
    image_x: float
    image_y: float
    catalog_id: int | None = None
    ra_deg: float | None = None
    dec_deg: float | None = None


@dataclass(slots=True)
class PointingError:
    target_ra_deg: float
    target_dec_deg: float
    actual_ra_deg: float
    actual_dec_deg: float
    error_arcmin: float
    from_px: tuple[float, float] | None = None
    to_px: tuple[float, float] | None = None


@dataclass(slots=True)
class OverlayData:
    detected_stars: list[DetectedStar] = field(default_factory=list)
    matched_stars: list[MatchedStar] = field(default_factory=list)
    pointing_error: PointingError | None = None


@dataclass(slots=True)
class SolveRequest:
    image_path: str | None = None
    sources: list[ImageSource] | None = None
    image_width_px: int | None = None
    image_height_px: int | None = None
    fov_estimate_deg: float | None = None
    fov_max_error_deg: float | None = None
    target_ra_deg: float | None = None
    target_dec_deg: float | None = None
    database_id: str | None = None
    solve_timeout_ms: float | None = None
    return_overlay: bool = True


@dataclass(slots=True)
class SolveResult:
    success: bool
    ra_deg: float | None = None
    dec_deg: float | None = None
    roll_deg: float | None = None
    fov_x_deg: float | None = None
    fov_y_deg: float | None = None
    pixel_scale_arcsec: float | None = None
    confidence: float = 0.0
    matched_stars: int = 0
    rms_error_arcsec: float | None = None
    solve_time_ms: int = 0
    database_id: str | None = None
    overlay: OverlayData | None = None
    log: list[str] = field(default_factory=list)

    @property
    def center(self) -> tuple[float, float] | None:
        if self.ra_deg is not None and self.dec_deg is not None:
            return (self.ra_deg, self.dec_deg)
        return None


@dataclass(slots=True)
class DatabaseInfo:
    id: str
    path: str
    fov_min_deg: float
    fov_max_deg: float
    mag_limit: float
    size_mb: float
    ready: bool = True


@dataclass(slots=True)
class DatabaseManifest:
    version: int
    databases: list[DatabaseInfo]


def select_database_for_fov(
    databases: list[DatabaseInfo],
    fov_x_deg: float,
    fov_y_deg: float,
) -> DatabaseInfo | None:
    diag = (fov_x_deg ** 2 + fov_y_deg ** 2) ** 0.5
    ready = [d for d in databases if d.ready]
    for db in sorted(ready, key=lambda d: d.fov_min_deg):
        if db.fov_min_deg <= diag <= db.fov_max_deg:
            return db
    if ready:
        return min(ready, key=lambda d: abs((d.fov_min_deg + d.fov_max_deg) / 2 - diag))
    return None
