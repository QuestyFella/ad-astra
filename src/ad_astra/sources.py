"""Image source (detected star) model, sorting, and filtering."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(slots=True)
class ImageSource:
    x_px: float
    y_px: float
    flux: float | None = None

    def distance_to(self, other: ImageSource) -> float:
        dx = self.x_px - other.x_px
        dy = self.y_px - other.y_px
        return (dx * dx + dy * dy) ** 0.5


def select_brightest(
    sources: Sequence[ImageSource],
    max_count: int,
) -> list[ImageSource]:
    if len(sources) <= max_count:
        return list(sources)
    with_flux = [s for s in sources if s.flux is not None]
    without_flux = [s for s in sources if s.flux is None]
    with_flux.sort(key=lambda s: s.flux, reverse=True)  # type: ignore[arg-type]
    return (with_flux + without_flux)[:max_count]


def filter_by_separation(
    sources: Sequence[ImageSource],
    min_separation_px: float,
) -> list[ImageSource]:
    if not sources:
        return []
    keep: list[ImageSource] = [sources[0]]
    for s in sources[1:]:
        too_close = False
        for k in keep:
            if s.distance_to(k) < min_separation_px:
                too_close = True
                break
        if not too_close:
            keep.append(s)
    return keep


def bounding_box(
    sources: Sequence[ImageSource],
) -> tuple[float, float, float, float]:
    xs = [s.x_px for s in sources]
    ys = [s.y_px for s in sources]
    return min(xs), min(ys), max(xs), max(ys)


def centroid(
    sources: Sequence[ImageSource],
) -> tuple[float, float]:
    n = len(sources)
    if n == 0:
        return 0.0, 0.0
    cx = sum(s.x_px for s in sources) / n
    cy = sum(s.y_px for s in sources) / n
    return cx, cy


def centroid_offsets(
    sources: Sequence[ImageSource],
) -> tuple[float, float]:
    cx, cy = centroid(sources)
    return cx, cy
