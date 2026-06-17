import math

from ad_astra.features import (
    QuadFeature,
    compute_quad_feature,
    extract_features,
    feature_distance,
    generate_image_quads,
    quantize_feature,
    quantized_neighbor_keys,
)
from ad_astra.sources import ImageSource


def _square() -> tuple[ImageSource, ImageSource, ImageSource, ImageSource]:
    return (
        ImageSource(0, 0, 1.0),
        ImageSource(100, 0, 0.8),
        ImageSource(100, 100, 0.6),
        ImageSource(0, 100, 0.4),
    )


def test_compute_quad_feature_basic():
    s0, s1, s2, s3 = _square()
    feat = compute_quad_feature(s0, s1, s2, s3)
    assert feat.scale > 0
    assert -1.5 <= feat.ax <= 1.5
    assert -1.5 <= feat.ay <= 1.5
    assert -1.5 <= feat.bx <= 1.5
    assert -1.5 <= feat.by <= 1.5


def test_feature_translation_invariance():
    s0, s1, s2, s3 = _square()
    feat1 = compute_quad_feature(s0, s1, s2, s3)
    offset = 500
    t = lambda s: ImageSource(s.x_px + offset, s.y_px + offset, s.flux)
    feat2 = compute_quad_feature(t(s0), t(s1), t(s2), t(s3))
    assert abs(feat1.ax - feat2.ax) < 1e-9
    assert abs(feat1.ay - feat2.ay) < 1e-9
    assert abs(feat1.bx - feat2.bx) < 1e-9
    assert abs(feat1.by - feat2.by) < 1e-9


def test_feature_scale_invariance():
    s0, s1, s2, s3 = _square()
    feat1 = compute_quad_feature(s0, s1, s2, s3)
    scale = 3.0
    scaled = lambda s: ImageSource(s.x_px * scale, s.y_px * scale, s.flux)
    feat2 = compute_quad_feature(scaled(s0), scaled(s1), scaled(s2), scaled(s3))
    assert abs(feat1.ax - feat2.ax) < 1e-9
    assert abs(feat1.ay - feat2.ay) < 1e-9
    assert abs(feat1.bx - feat2.bx) < 1e-9
    assert abs(feat1.by - feat2.by) < 1e-9


def _asymmetric() -> tuple[ImageSource, ImageSource, ImageSource, ImageSource]:
    return (
        ImageSource(0, 0, 1.0),
        ImageSource(200, 0, 0.8),
        ImageSource(180, 120, 0.6),
        ImageSource(30, 100, 0.4),
    )


def test_feature_rotation_invariance():
    s0, s1, s2, s3 = _asymmetric()
    feat1 = compute_quad_feature(s0, s1, s2, s3)
    cx, cy = 100, 60
    angle = math.radians(37)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    def rotate(s: ImageSource) -> ImageSource:
        dx, dy = s.x_px - cx, s.y_px - cy
        return ImageSource(cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a, s.flux)
    feat2 = compute_quad_feature(rotate(s0), rotate(s1), rotate(s2), rotate(s3))
    assert abs(feat1.scale - feat2.scale) < 1e-6
    assert abs(feat1.ax - feat2.ax) < 1e-6
    assert abs(feat1.ay - feat2.ay) < 1e-6
    assert abs(feat1.bx - feat2.bx) < 1e-6
    assert abs(feat1.by - feat2.by) < 1e-6


def test_quantize_feature_stability():
    feat = QuadFeature(ax=0.318, ay=0.278, bx=0.623, by=0.548, scale=100)
    q1 = quantize_feature(feat, bin_size=0.01)
    feat_noisy = QuadFeature(
        ax=feat.ax + 0.002,
        ay=feat.ay + 0.002,
        bx=feat.bx + 0.002,
        by=feat.by + 0.002,
        scale=100,
    )
    q2 = quantize_feature(feat_noisy, bin_size=0.01)
    assert q1.to_key() == q2.to_key()


def test_quantize_feature_different():
    feat1 = QuadFeature(ax=0.10, ay=0.10, bx=0.50, by=0.50, scale=100)
    feat2 = QuadFeature(ax=0.30, ay=0.30, bx=0.70, by=0.70, scale=100)
    q1 = quantize_feature(feat1, bin_size=0.01)
    q2 = quantize_feature(feat2, bin_size=0.01)
    assert q1.to_key() != q2.to_key()


def test_quantized_neighbor_keys():
    key = (10, 20, 30, 40)
    neighbors = quantized_neighbor_keys(key, radius=1)
    assert len(neighbors) == 80
    assert key not in neighbors
    assert (11, 20, 30, 40) in neighbors
    assert (9, 20, 30, 40) in neighbors


def test_feature_distance_zero():
    feat = QuadFeature(ax=0.5, ay=0.5, bx=0.5, by=0.5, scale=100)
    assert feature_distance(feat, feat) == 0.0


def test_feature_distance_positive():
    a = QuadFeature(ax=0, ay=0, bx=0, by=0, scale=1)
    b = QuadFeature(ax=1, ay=0, bx=0, by=0, scale=1)
    assert feature_distance(a, b) == 1.0


def test_generate_image_quads():
    sources = [
        ImageSource(100, 100, 1.0),
        ImageSource(200, 100, 0.9),
        ImageSource(200, 200, 0.8),
        ImageSource(100, 200, 0.7),
        ImageSource(150, 50, 0.6),
    ]
    quads = generate_image_quads(sources, max_quads=100)
    assert len(quads) > 0
    for q in quads:
        assert len(q.indices) == 4


def test_extract_features():
    sources = [
        ImageSource(100, 100, 1.0),
        ImageSource(200, 100, 0.9),
        ImageSource(200, 200, 0.8),
        ImageSource(100, 200, 0.7),
        ImageSource(150, 50, 0.6),
    ]
    quads = generate_image_quads(sources, max_quads=50)
    feats = extract_features(quads)
    assert len(feats) > 0
    for quad, feat in feats:
        assert feat.scale > 0
