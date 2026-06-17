"""Quad generation, invariant feature extraction, and quantization."""

from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import combinations

from .sources import ImageSource


@dataclass(slots=True)
class ImageQuad:
    indices: tuple[int, int, int, int]
    sources: tuple[ImageSource, ImageSource, ImageSource, ImageSource]


@dataclass(slots=True)
class QuadFeature:
    ax: float
    ay: float
    bx: float
    by: float
    scale: float


@dataclass(slots=True)
class QuantizedFeature:
    ax: int
    ay: int
    bx: int
    by: int

    def to_key(self) -> tuple[int, int, int, int]:
        return (self.ax, self.ay, self.bx, self.by)


@dataclass(slots=True)
class CatalogQuad:
    star_ids: tuple[int, int, int, int]
    feature: QuadFeature
    center_ra_deg: float
    center_dec_deg: float
    scale_deg: float


def _pick_baseline(
    s0: ImageSource,
    s1: ImageSource,
    s2: ImageSource,
    s3: ImageSource,
) -> tuple[int, int]:
    dists = [
        (s0.distance_to(s1), 0, 1),
        (s0.distance_to(s2), 0, 2),
        (s0.distance_to(s3), 0, 3),
        (s1.distance_to(s2), 1, 2),
        (s1.distance_to(s3), 1, 3),
        (s2.distance_to(s3), 2, 3),
    ]
    dists.sort(key=lambda t: t[0], reverse=True)
    return dists[0][1], dists[0][2]


def compute_quad_feature(
    s0: ImageSource,
    s1: ImageSource,
    s2: ImageSource,
    s3: ImageSource,
) -> QuadFeature:
    bi, bj = _pick_baseline(s0, s1, s2, s3)
    sources = [s0, s1, s2, s3]
    a = sources[bi]
    b = sources[bj]
    others = [i for i in range(4) if i not in (bi, bj)]
    c = sources[others[0]]
    d = sources[others[1]]
    dx = b.x_px - a.x_px
    dy = b.y_px - a.y_px
    baseline = math.hypot(dx, dy)
    if baseline < 1e-9:
        return QuadFeature(ax=0, ay=0, bx=0, by=0, scale=0)
    ux = dx / baseline
    uy = dy / baseline
    px = -uy
    py = ux
    def project(p: ImageSource) -> tuple[float, float]:
        rx = p.x_px - a.x_px
        ry = p.y_px - a.y_px
        return (rx * ux + ry * uy) / baseline, (rx * px + ry * py) / baseline
    cx, cy = project(c)
    dxx, dyy = project(d)
    if (cx, cy) > (dxx, dyy):
        cx, cy, dxx, dyy = dxx, dyy, cx, cy
    return QuadFeature(ax=cx, ay=cy, bx=dxx, by=dyy, scale=baseline)


def generate_image_quads(
    sources: list[ImageSource],
    max_quads: int = 5000,
    min_baseline_px: float = 5.0,
) -> list[ImageQuad]:
    quads: list[ImageQuad] = []
    for combo in combinations(range(len(sources)), 4):
        if len(quads) >= max_quads:
            break
        i, j, k, l = combo
        s0, s1, s2, s3 = sources[i], sources[j], sources[k], sources[l]
        bi, bj = _pick_baseline(s0, s1, s2, s3)
        pair = [s0, s1, s2, s3]
        if pair[bi].distance_to(pair[bj]) < min_baseline_px:
            continue
        quads.append(ImageQuad(
            indices=(i, j, k, l),
            sources=(s0, s1, s2, s3),
        ))
    return quads


def extract_features(quads: list[ImageQuad]) -> list[tuple[ImageQuad, QuadFeature]]:
    result: list[tuple[ImageQuad, QuadFeature]] = []
    for quad in quads:
        feat = compute_quad_feature(*quad.sources)
        if feat.scale > 0:
            result.append((quad, feat))
    return result


def quantize_feature(
    feature: QuadFeature,
    bin_size: float = 0.01,
) -> QuantizedFeature:
    return QuantizedFeature(
        ax=int(round(feature.ax / bin_size)),
        ay=int(round(feature.ay / bin_size)),
        bx=int(round(feature.bx / bin_size)),
        by=int(round(feature.by / bin_size)),
    )


def feature_distance(a: QuadFeature, b: QuadFeature) -> float:
    return math.sqrt(
        (a.ax - b.ax) ** 2
        + (a.ay - b.ay) ** 2
        + (a.bx - b.bx) ** 2
        + (a.by - b.by) ** 2
    )


def quantized_neighbor_keys(
    key: tuple[int, int, int, int],
    radius: int = 1,
) -> list[tuple[int, int, int, int]]:
    ax, ay, bx, by = key
    keys: list[tuple[int, int, int, int]] = []
    for dax in range(-radius, radius + 1):
        for day in range(-radius, radius + 1):
            for dbx in range(-radius, radius + 1):
                for dby in range(-radius, radius + 1):
                    if dax == 0 and day == 0 and dbx == 0 and dby == 0:
                        continue
                    keys.append((ax + dax, ay + day, bx + dbx, by + dby))
    return keys
