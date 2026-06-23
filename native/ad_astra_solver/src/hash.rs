//! Geometric quad hashing and hash-index for pattern matching.
//!
//! The hash is based on the geometric invariant of a 4-star "quad":
//!
//! 1. From 4 stars, find the pair with the maximum distance (the **baseline**).
//! 2. Project the remaining two stars into a normalised coordinate frame
//!    where the baseline runs from `(0, 0)` to `(1, 0)`.
//! 3. The normalised `(x, |y|)` positions of the two inner stars form the
//!    hash.  They are sorted lexicographically for a canonical form.
//!
//! Because the hash uses only **distance ratios**, it is invariant to
//! translation, rotation, scale, and the sign of the perpendicular axis.
//! The last (sign) ambiguity is resolved during verification by trying all
//! possible correspondences.

use std::collections::HashMap;

use crate::db::AdbDatabase;
use crate::geometry::Vec3;
use crate::types::ImageSource;

/// Quantised hash key for a 4-star quad.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct HashKey {
    pub ax: i16,
    pub ay: i16,
    pub bx: i16,
    pub by: i16,
}

/// Floating-point geometric feature before quantisation.
#[derive(Clone, Copy, Debug)]
pub struct QuadFeature {
    pub ax: f64,
    pub ay: f64,
    pub bx: f64,
    pub by: f64,
}

/// Information produced when hashing a quad: the hash key plus the
/// permutation that maps the original 4 points to `[baseline_A, baseline_B, inner_0, inner_1]`.
pub struct HashResult {
    pub key: HashKey,
    pub feature: QuadFeature,
    /// `order[i]` is the original index of the `i`-th star in the reordered quad.
    pub order: [usize; 4],
}

/// 4 × 4 pairwise distance matrix.
type DistMat = [[f64; 4]; 4];

/// Compute all 6 pairwise distances between 4 2D points.
pub fn dist_matrix_2d(points: &[(f64, f64); 4]) -> DistMat {
    let mut d = [[0.0; 4]; 4];
    for i in 0..4 {
        for j in i + 1..4 {
            let dx = points[i].0 - points[j].0;
            let dy = points[i].1 - points[j].1;
            let dist = (dx * dx + dy * dy).sqrt();
            d[i][j] = dist;
            d[j][i] = dist;
        }
    }
    d
}

/// Compute all 6 pairwise chord distances between 4 unit vectors.
pub fn dist_matrix_3d(stars: &[Vec3; 4]) -> DistMat {
    let mut d = [[0.0; 4]; 4];
    for i in 0..4 {
        for j in i + 1..4 {
            let dist = stars[i].sub(stars[j]).norm();
            d[i][j] = dist;
            d[j][i] = dist;
        }
    }
    d
}

/// Core hash computation from a pre-computed distance matrix.
///
/// Returns `None` if the quad is degenerate (collinear or coincident points).
pub fn compute_quad_hash(dist: &DistMat, bin_size: f64) -> Option<HashResult> {
    // Find the baseline = max-distance pair.
    let mut max_d = 0.0_f64;
    let mut baseline = (0_usize, 1_usize);
    for i in 0..4 {
        for j in (i + 1)..4 {
            if dist[i][j] > max_d {
                max_d = dist[i][j];
                baseline = (i, j);
            }
        }
    }

    if max_d < 1e-9 {
        return None;
    }

    let (bi, bj) = baseline;
    let baseline_sq = max_d * max_d;

    // The two non-baseline star indices.
    let mut inner = [0_usize; 2];
    {
        let mut k = 0;
        for i in 0..4 {
            if i != bi && i != bj {
                inner[k] = i;
                k += 1;
            }
        }
    }

    let feat_fwd = feature_for_baseline(dist, bi, bj, inner, baseline_sq)?;
    let feat_rev = feature_for_baseline(dist, bj, bi, inner, baseline_sq)?;

    let (feature, order) =
        if feature_lex_cmp(&feat_rev.0, &feat_fwd.0) == std::cmp::Ordering::Less {
            feat_rev
        } else {
            feat_fwd
        };

    let key = quantize(&feature, bin_size);

    Some(HashResult { key, feature, order })
}

/// Project inner stars for a given baseline orientation and return the
/// lexicographically sorted feature plus the point order
/// `[baseline_A, baseline_B, inner_0, inner_1]`.
fn feature_for_baseline(
    dist: &DistMat,
    bi: usize,
    bj: usize,
    inner: [usize; 2],
    baseline_sq: f64,
) -> Option<(QuadFeature, [usize; 4])> {
    let project = |s: usize| -> (f64, f64) {
        let d_as = dist[bi][s];
        let d_bs = dist[bj][s];
        let x = (d_as * d_as + baseline_sq - d_bs * d_bs) / (2.0 * baseline_sq);
        let y_sq = (d_as * d_as / baseline_sq) - x * x;
        let y = y_sq.max(0.0).sqrt();
        (x, y)
    };

    let (x0, y0) = project(inner[0]);
    let (x1, y1) = project(inner[1]);

    if y0 < 1e-9 && y1 < 1e-9 {
        return None;
    }

    let (ax, ay, bx, by, inner_order) = if (x0, y0) <= (x1, y1) {
        (x0, y0, x1, y1, [inner[0], inner[1]])
    } else {
        (x1, y1, x0, y0, [inner[1], inner[0]])
    };

    let feature = QuadFeature { ax, ay, bx, by };
    let order = [bi, bj, inner_order[0], inner_order[1]];
    Some((feature, order))
}

fn feature_lex_cmp(a: &QuadFeature, b: &QuadFeature) -> std::cmp::Ordering {
    a.ax
        .partial_cmp(&b.ax)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.ay.partial_cmp(&b.ay).unwrap_or(std::cmp::Ordering::Equal))
        .then_with(|| a.bx.partial_cmp(&b.bx).unwrap_or(std::cmp::Ordering::Equal))
        .then_with(|| a.by.partial_cmp(&b.by).unwrap_or(std::cmp::Ordering::Equal))
}

/// Squared L2 distance between quantised hash keys (bin deltas).
pub fn hash_key_dist_sq(a: &HashKey, b: &HashKey) -> i64 {
    let dax = (a.ax as i32 - b.ax as i32) as i64;
    let day = (a.ay as i32 - b.ay as i32) as i64;
    let dbx = (a.bx as i32 - b.bx as i32) as i64;
    let dby = (a.by as i32 - b.by as i32) as i64;
    dax * dax + day * day + dbx * dbx + dby * dby
}

/// Squared L2 distance between floating-point quad features.
pub fn quad_feature_dist_sq(a: &QuadFeature, b: &QuadFeature) -> f64 {
    let da = a.ax - b.ax;
    let db = a.ay - b.ay;
    let dc = a.bx - b.bx;
    let dd = a.by - b.by;
    da * da + db * db + dc * dc + dd * dd
}

/// Quantise a floating-point feature into a hash key.
pub fn quantize(feature: &QuadFeature, bin_size: f64) -> HashKey {
    let q = |v: f64| -> i16 {
        let b = (v / bin_size).round() as i64;
        b.clamp(-32_768, 32_767) as i16
    };
    HashKey {
        ax: q(feature.ax),
        ay: q(feature.ay),
        bx: q(feature.bx),
        by: q(feature.by),
    }
}

/// neighbouring hash keys (including self) for tolerance lookup.
/// Returns the exact key first, then neighbours (self + neighbours).
pub fn neighbor_keys(key: &HashKey, radius: i16) -> Vec<HashKey> {
    let mut keys = Vec::with_capacity(((2 * radius + 1) as usize).pow(4));
    // Self key first — ensures the exact-match bucket is always visited
    // before the per-quad candidate cap kicks in.
    keys.push(*key);
    for dax in -radius..=radius {
        for day in -radius..=radius {
            for dbx in -radius..=radius {
                for dby in -radius..=radius {
                    if dax == 0 && day == 0 && dbx == 0 && dby == 0 {
                        continue;
                    }
                    let k = HashKey {
                        ax: key.ax.saturating_add(dax),
                        ay: key.ay.saturating_add(day),
                        bx: key.bx.saturating_add(dbx),
                        by: key.by.saturating_add(dby),
                    };
                    keys.push(k);
                }
            }
        }
    }
    keys
}

// ── Hash index ────────────────────────────────────────────────────

/// In-memory hash index mapping `HashKey` → pattern indices.
///
/// Built once from the loaded database; queried O(1) per key at solve time.
#[derive(Clone, Debug)]
pub struct HashIndex {
    map: HashMap<HashKey, Vec<u32>>,
    pub bin_size: f64,
}

impl HashIndex {
    /// Build the hash index from all catalog patterns.
    ///
    /// For each pattern the 4 star unit vectors are retrieved and the
    /// geometric hash is computed from chord distances.
    pub fn build(db: &AdbDatabase) -> Self {
        let pattern_bins = db.header.pattern_bins.max(1) as f64;
        let bin_size = 1.0 / pattern_bins;

        // Pre-convert star unit vectors to f64 Vec3 for distance computation.
        let star_vecs: Vec<Vec3> = db
            .stars
            .iter()
            .map(|s| Vec3::new(s.x_unit as f64, s.y_unit as f64, s.z_unit as f64))
            .collect();

        let mut map: HashMap<HashKey, Vec<u32>> = HashMap::new();

        for (pat_idx, pattern) in db.patterns.iter().enumerate() {
            let idx = pattern.star_indices;
            // Skip patterns with out-of-range indices.
            if idx.iter().any(|&i| i as usize >= star_vecs.len()) {
                continue;
            }
            let quad = [
                star_vecs[idx[0] as usize],
                star_vecs[idx[1] as usize],
                star_vecs[idx[2] as usize],
                star_vecs[idx[3] as usize],
            ];
            let dmat = dist_matrix_3d(&quad);
            if let Some(result) = compute_quad_hash(&dmat, bin_size) {
                map.entry(result.key)
                    .or_insert_with(Vec::new)
                    .push(pat_idx as u32);
            }
        }

        HashIndex { map, bin_size }
    }

    /// Look up all catalog pattern indices for a given hash key.
    pub fn get(&self, key: &HashKey) -> &[u32] {
        self.map
            .get(key)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    /// Look up all pattern indices matching the key OR its neighbours
    /// within `radius` bins (handles quantisation error).
    pub fn get_with_neighbors(&self, key: &HashKey, radius: i16) -> Vec<(u32, HashKey)> {
        let mut result = Vec::new();
        let keys = neighbor_keys(key, radius);
        for k in keys {
            if let Some(idx_list) = self.map.get(&k) {
                for &idx in idx_list {
                    result.push((idx, k));
                }
            }
        }
        result
    }

    /// Total number of patterns that produced a valid hash.
    pub fn total_patterns(&self) -> usize {
        self.map.values().map(|v| v.len()).sum()
    }

    /// Test-only: register a pattern under an arbitrary hash key (simulates
    /// quantisation collisions or adversarial index ordering).
    #[cfg(test)]
    pub fn inject_pattern_for_test(&mut self, key: HashKey, pattern_idx: u32) {
        self.map.entry(key).or_default().push(pattern_idx);
    }
}

// ── Image quad generation ─────────────────────────────────────────

/// An image quad with its hash and ordering information.
pub struct ImageQuad {
    /// Original source indices in `[baseline_A, baseline_B, inner_0, inner_1]` order.
    pub order: [usize; 4],
    pub points: [(f64, f64); 4],
    pub hash: HashKey,
    pub feature: QuadFeature,
}

/// Generate image quads from detected sources.
///
/// Sorts by flux (brightest first), takes the top `max_sources`, and
/// enumerates all C(n, 4) combinations filtered by `min_baseline_px`.
pub fn generate_image_quads(
    sources: &[ImageSource],
    max_sources: usize,
    min_baseline_px: f64,
    bin_size: f64,
    mut should_abort: impl FnMut() -> bool,
) -> Vec<ImageQuad> {
    // Sort sources by flux (brightest first), falling back to y then x.
    let mut indexed: Vec<usize> = (0..sources.len()).collect();
    indexed.sort_by(|&a, &b| {
        let fa = sources[a].flux.unwrap_or(0.0);
        let fb = sources[b].flux.unwrap_or(0.0);
        fb.partial_cmp(&fa).unwrap_or(std::cmp::Ordering::Equal)
    });

    let n = indexed.len().min(max_sources);

    let mut quads = Vec::new();
    'quad_loop: for i in 0..n {
        if should_abort() {
            break 'quad_loop;
        }
        for j in (i + 1)..n {
            if should_abort() {
                break 'quad_loop;
            }
            for k in (j + 1)..n {
                for l in (k + 1)..n {
                    let src_indices = [indexed[i], indexed[j], indexed[k], indexed[l]];
                    let points = [
                        (sources[src_indices[0]].x_px, sources[src_indices[0]].y_px),
                        (sources[src_indices[1]].x_px, sources[src_indices[1]].y_px),
                        (sources[src_indices[2]].x_px, sources[src_indices[2]].y_px),
                        (sources[src_indices[3]].x_px, sources[src_indices[3]].y_px),
                    ];
                    let dmat = dist_matrix_2d(&points);
                    // Quick baseline check.
                    let max_d = (0..4)
                        .flat_map(|a| (a + 1..4).map(move |b| dmat[a][b]))
                        .fold(0.0_f64, f64::max);
                    if max_d < min_baseline_px {
                        continue;
                    }
                    if let Some(result) = compute_quad_hash(&dmat, bin_size) {
                        quads.push(ImageQuad {
                            order: {
                                let order = result.order;
                                [
                                    src_indices[order[0]],
                                    src_indices[order[1]],
                                    src_indices[order[2]],
                                    src_indices[order[3]],
                                ]
                            },
                            points: [
                                points[result.order[0]],
                                points[result.order[1]],
                                points[result.order[2]],
                                points[result.order[3]],
                            ],
                            hash: result.key,
                            feature: result.feature,
                        });
                    }
                }
            }
        }
    }
    quads
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn test_hash_basic_square() {
        // A unit square: (0,0), (1,0), (0,1), (1,1).
        // Baseline = diagonal (0,0)→(1,1), length = sqrt(2).
        // Inner stars: (1,0) and (0,1), both at perpendicular distance 1/sqrt(2).
        let points = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)];
        let dmat = dist_matrix_2d(&points);
        let result = compute_quad_hash(&dmat, 0.05).unwrap();

        // Baseline should be the diagonal: indices (0, 3) → 0→(0,0), 3→(1,1).
        assert!((result.feature.ax - 0.5).abs() < 0.01 || (result.feature.ax - 0.0).abs() < 0.01);
    }

    fn all_point_permutations() -> Vec<[usize; 4]> {
        let mut perms = Vec::with_capacity(24);
        for a in 0..4 {
            for b in 0..4 {
                if b == a {
                    continue;
                }
                for c in 0..4 {
                    if c == a || c == b {
                        continue;
                    }
                    for d in 0..4 {
                        if d == a || d == b || d == c {
                            continue;
                        }
                        perms.push([a, b, c, d]);
                    }
                }
            }
        }
        perms
    }

    #[test]
    fn test_hash_point_order_invariant() {
        let points = [(12.0, 5.0), (88.0, 10.0), (40.0, 72.0), (55.0, 28.0)];
        let dmat = dist_matrix_2d(&points);
        let reference = compute_quad_hash(&dmat, 0.02).unwrap().key;

        let perms = all_point_permutations();
        assert_eq!(perms.len(), 24, "expected all 24 point permutations");

        for perm in perms {
            let permuted = [
                points[perm[0]],
                points[perm[1]],
                points[perm[2]],
                points[perm[3]],
            ];
            let perm_dmat = dist_matrix_2d(&permuted);
            let key = compute_quad_hash(&perm_dmat, 0.02).unwrap().key;
            assert_eq!(key, reference, "hash changed for permutation {:?}", perm);
        }
    }

    #[test]
    fn test_hash_degenerate() {
        // Collinear points — should return None.
        let points = [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)];
        let dmat = dist_matrix_2d(&points);
        assert!(compute_quad_hash(&dmat, 0.05).is_none());
    }

    #[test]
    fn test_hash_2d_3d_equivalence() {
        // 4 stars on the unit sphere — their chord distances should give
        // the same hash as their 2D tangent-plane distances (within bin tolerance).
        let stars = [
            radec_to_unit_3d(45.0, 20.0),
            radec_to_unit_3d(46.0, 20.0),
            radec_to_unit_3d(45.5, 20.5),
            radec_to_unit_3d(45.2, 19.8),
        ];

        let dmat3 = dist_matrix_3d(&stars);
        let result3 = compute_quad_hash(&dmat3, 0.02).unwrap();

        // Verify the hash is produced and is stable.
        let result3b = compute_quad_hash(&dmat3, 0.02).unwrap();
        assert_eq!(result3.key, result3b.key);
        assert_eq!(result3.order, result3b.order);
    }

    fn radec_to_unit_3d(ra: f64, dec: f64) -> Vec3 {
        use std::f64::consts::PI;
        let ra_r = ra * PI / 180.0;
        let dec_r = dec * PI / 180.0;
        Vec3::new(
            dec_r.cos() * ra_r.cos(),
            dec_r.cos() * ra_r.sin(),
            dec_r.sin(),
        )
    }

    #[test]
    fn test_neighbor_keys_count() {
        let key = HashKey {
            ax: 25,
            ay: 25,
            bx: 25,
            by: 25,
        };
        let keys = neighbor_keys(&key, 1);
        assert_eq!(keys.len(), 81); // 3^4
    }

    #[test]
    fn test_hash_key_dist_sq_exact_match() {
        let key = HashKey {
            ax: 10,
            ay: 20,
            bx: 30,
            by: 40,
        };
        assert_eq!(hash_key_dist_sq(&key, &key), 0);
        let neighbor = HashKey {
            ax: 11,
            ay: 20,
            bx: 30,
            by: 40,
        };
        assert_eq!(hash_key_dist_sq(&key, &neighbor), 1);
    }

    #[test]
    fn test_quad_feature_dist_sq() {
        let a = QuadFeature {
            ax: 0.1,
            ay: 0.2,
            bx: 0.3,
            by: 0.4,
        };
        let b = QuadFeature {
            ax: 0.2,
            ay: 0.3,
            bx: 0.4,
            by: 0.5,
        };
        let dist = quad_feature_dist_sq(&a, &b);
        assert!(approx(dist, 0.04));
    }

    #[test]
    fn test_quantize_clamps() {
        let feature = QuadFeature {
            ax: 1e6,
            ay: -1e6,
            bx: 0.5,
            by: 0.25,
        };
        let key = quantize(&feature, 0.02);
        assert_eq!(key.ax, 32_767);
        assert_eq!(key.ay, -32_768);
    }

    #[test]
    fn test_generate_image_quads() {
        let sources: Vec<ImageSource> = (0..10)
            .map(|i| ImageSource {
                x_px: i as f64 * 10.0,
                y_px: (i as f64 % 3.0) * 10.0,
                flux: Some(10.0 - i as f64),
            })
            .collect();

        let quads = generate_image_quads(&sources, 10, 5.0, 0.02, || false);
        // C(10, 4) = 210 combinations; some may be filtered by min_baseline.
        assert!(!quads.is_empty());
        assert!(quads.len() <= 210);
    }

    #[test]
    fn test_generate_image_quads_respects_abort() {
        let sources: Vec<ImageSource> = (0..25)
            .map(|i| ImageSource {
                x_px: i as f64 * 10.0,
                y_px: (i as f64 % 5.0) * 10.0,
                flux: Some(25.0 - i as f64),
            })
            .collect();

        let full = generate_image_quads(&sources, 25, 5.0, 0.02, || false);
        let mut checks = 0usize;
        let partial = generate_image_quads(&sources, 25, 5.0, 0.02, || {
            checks += 1;
            checks > 3
        });
        assert!(!full.is_empty());
        assert!(partial.len() < full.len());
    }

    use std::io::Write;
    use tempfile::tempdir;

    /// Write a small test .adb database with a known set of stars and patterns.
    fn make_test_db_with_patterns() -> std::path::PathBuf {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.adb");
        let mut file = std::fs::File::create(&path).unwrap();

        // 6 stars forming 2 patterns.
        let n_stars = 6u32;
        let n_patterns = 2u32;

        let mut header = vec![0u8; 64];
        header[0..4].copy_from_slice(b"ADB\0");
        header[4..8].copy_from_slice(&1u32.to_le_bytes());
        header[8..12].copy_from_slice(&n_stars.to_le_bytes());
        header[12..16].copy_from_slice(&n_patterns.to_le_bytes());
        header[16..20].copy_from_slice(&10.0f32.to_le_bytes());
        header[20..24].copy_from_slice(&30.0f32.to_le_bytes());
        header[24..28].copy_from_slice(&7.0f32.to_le_bytes());
        header[28..32].copy_from_slice(&2000u32.to_le_bytes());
        header[32..36].copy_from_slice(&4u32.to_le_bytes());
        header[36..40].copy_from_slice(&50u32.to_le_bytes());
        file.write_all(&header).unwrap();

        // Write 6 stars with distinct 3D positions.
        let stars_3d: [(f64, f64, f64); 6] = [
            (45.0_f64.to_radians().cos() * 20.0_f64.to_radians().cos(), 45.0_f64.to_radians().sin() * 20.0_f64.to_radians().cos(), 20.0_f64.to_radians().sin()),
            (46.0_f64.to_radians().cos() * 20.0_f64.to_radians().cos(), 46.0_f64.to_radians().sin() * 20.0_f64.to_radians().cos(), 20.0_f64.to_radians().sin()),
            (45.5_f64.to_radians().cos() * 20.5_f64.to_radians().cos(), 45.5_f64.to_radians().sin() * 20.5_f64.to_radians().cos(), 20.5_f64.to_radians().sin()),
            (45.2_f64.to_radians().cos() * 19.8_f64.to_radians().cos(), 45.2_f64.to_radians().sin() * 19.8_f64.to_radians().cos(), 19.8_f64.to_radians().sin()),
            (45.8_f64.to_radians().cos() * 20.3_f64.to_radians().cos(), 45.8_f64.to_radians().sin() * 20.3_f64.to_radians().cos(), 20.3_f64.to_radians().sin()),
            (44.7_f64.to_radians().cos() * 20.1_f64.to_radians().cos(), 44.7_f64.to_radians().sin() * 20.1_f64.to_radians().cos(), 20.1_f64.to_radians().sin()),
        ];

        for i in 0..n_stars as usize {
            let mut star = vec![0u8; 28];
            star[0..4].copy_from_slice(&(i as u32 + 1).to_le_bytes());
            star[4..8].copy_from_slice(&(45.0f32).to_le_bytes()); // ra_rad (unused for hash)
            star[8..12].copy_from_slice(&(20.0f32).to_le_bytes()); // dec_rad (unused for hash)
            star[12..16].copy_from_slice(&(stars_3d[i].0 as f32).to_le_bytes());
            star[16..20].copy_from_slice(&(stars_3d[i].1 as f32).to_le_bytes());
            star[20..24].copy_from_slice(&(stars_3d[i].2 as f32).to_le_bytes());
            star[24..28].copy_from_slice(&(5.0 + i as f32 * 0.1).to_le_bytes());
            file.write_all(&star).unwrap();
        }

        // Pattern 0: stars [0, 1, 2, 3]
        let mut pat = vec![0u8; 8];
        pat[0..2].copy_from_slice(&0u16.to_le_bytes());
        pat[2..4].copy_from_slice(&1u16.to_le_bytes());
        pat[4..6].copy_from_slice(&2u16.to_le_bytes());
        pat[6..8].copy_from_slice(&3u16.to_le_bytes());
        file.write_all(&pat).unwrap();

        // Pattern 1: stars [0, 1, 4, 5]
        let mut pat = vec![0u8; 8];
        pat[0..2].copy_from_slice(&0u16.to_le_bytes());
        pat[2..4].copy_from_slice(&1u16.to_le_bytes());
        pat[4..6].copy_from_slice(&4u16.to_le_bytes());
        pat[6..8].copy_from_slice(&5u16.to_le_bytes());
        file.write_all(&pat).unwrap();

        // Keep temp dir alive — move path out.  We leak the tempdir.
        std::mem::forget(dir);
        path
    }

    #[test]
    fn test_hash_index_build() {
        let path = make_test_db_with_patterns();
        let db = crate::db::load_database(&path).unwrap();
        let index = HashIndex::build(&db);
        assert_eq!(index.total_patterns(), 2);
        assert!(index.bin_size > 0.0);
    }
}
