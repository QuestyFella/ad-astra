//! Plate-solving algorithm.
//!
//! Pipeline:
//! 1. Load the `.adb` database (stars + patterns).
//! 2. Build an in-memory hash index from catalog pattern hashes.
//! 3. Generate quads from the detected image sources and compute their hashes.
//! 4. For each image quad, look up candidate catalog patterns (with neighbor bins).
//! 5. Verify each candidate by fitting an affine transform and counting
//!    matched stars.
//! 6. Return the best solution (RA/Dec/FOV/roll + overlay data).

use std::collections::HashMap;
use std::path::Path;

use crate::db;
use crate::geometry::{Affine2D, RadialQuad2D, TangentPlane, Vec3};
use crate::hash::{generate_image_quads, compute_quad_hash, dist_matrix_3d, HashIndex, ImageQuad};
use crate::types::{DetectedStar, ImageSource, MatchedStarInfo, SolveResult, SolveSourcesRequest};

// ═══ Platform-adaptive timer ═══
// std::time::Instant is not available on wasm32-unknown-unknown.

#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(not(target_arch = "wasm32"))]
type Timer = Instant;

#[cfg(not(target_arch = "wasm32"))]
fn timer_now() -> Timer { Instant::now() }

#[cfg(not(target_arch = "wasm32"))]
fn timer_elapsed(t: &Timer) -> u64 { t.elapsed().as_millis() as u64 }

#[cfg(target_arch = "wasm32")]
type Timer = u64;

#[cfg(target_arch = "wasm32")]
fn timer_now() -> Timer { 0u64 }

#[cfg(target_arch = "wasm32")]
fn timer_elapsed(_t: &Timer) -> u64 { 0 }

/// Maximum number of brightest sources used for quad generation.
const MAX_SOURCES_FOR_QUADS: usize = 25;

/// Minimum baseline length (pixels) for an image quad.
const MIN_BASELINE_PX: f64 = 5.0;

/// Neighbor search radius for hash lookup (bins).
const HASH_NEIGHBOR_RADIUS: i16 = 1;

/// Maximum catalog patterns to test per image quad.
/// Prevents combinatorial explosion on dense hash bins.
const MAX_CANDIDATES_PER_QUAD: usize = 50;

/// RMS matching threshold (arcseconds) for a star to count as "verified".
///
/// With ~8.8k catalog stars over the full sky, the expected number of
/// chance matches at this radius is well below 1 per solve.  The
/// `MIN_MATCHED_STARS` gate is what rejects false-positive solutions.
const VERIFY_MATCH_RADIUS_ARCSEC: f64 = 60.0;

/// Minimum matched stars for a candidate to be accepted as a solution.
/// Rejects chance coincidences that pass the radius threshold above.
const MIN_MATCHED_STARS: u32 = 6;

/// Uniform-grid spatial index for fast nearest-neighbor lookup among
/// catalog stars projected onto a tangent plane.
///
/// Replaces an O(n_catalog) brute-force scan per image source with an
/// O(1) average grid-cell lookup.  Built once per `verify_single` call
/// from the projected coordinate array.
struct CatalogGrid {
    cell_size: f64,
    cells: HashMap<(i32, i32), Vec<usize>>,
}

impl CatalogGrid {
    fn build(points: &[(f64, f64)], cell_size: f64) -> Self {
        let mut cells: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
        for (i, &(xi, _)) in points.iter().enumerate() {
            if xi == f64::MAX {
                continue;
            }
            let gx = (xi / cell_size).floor() as i32;
            let gy = (points[i].1 / cell_size).floor() as i32;
            cells.entry((gx, gy)).or_default().push(i);
        }
        CatalogGrid { cell_size, cells }
    }

    /// Find the nearest point to `(xi, eta)` within `max_dist`.
    /// Returns `(index, dist_sq)` or `None`.
    fn nearest_within(
        &self,
        points: &[(f64, f64)],
        xi: f64,
        eta: f64,
        max_dist: f64,
    ) -> Option<(usize, f64)> {
        let max_dist_sq = max_dist * max_dist;
        let gx = (xi / self.cell_size).floor() as i32;
        let gy = (eta / self.cell_size).floor() as i32;
        let r = ((max_dist / self.cell_size).ceil() as i32).max(1);

        let mut best_dist_sq = max_dist_sq;
        let mut best_idx: Option<usize> = None;

        for dx in -r..=r {
            for dy in -r..=r {
                if let Some(cell) = self.cells.get(&(gx + dx, gy + dy)) {
                    for &idx in cell {
                        let (cat_xi, cat_eta) = points[idx];
                        let ddx = xi - cat_xi;
                        let ddy = eta - cat_eta;
                        let dist_sq = ddx * ddx + ddy * ddy;
                        if dist_sq < best_dist_sq {
                            best_dist_sq = dist_sq;
                            best_idx = Some(idx);
                        }
                    }
                }
            }
        }

        best_idx.map(|idx| (idx, best_dist_sq))
    }
}

/// An image–catalog pattern correspondence awaiting verification.
struct Candidate {
    image_quad: ImageQuad,
    /// Catalog star unit vectors for each of the 4 pattern stars (in
    /// canonical hash order [baseline_A, baseline_B, inner_0, inner_1]).
    cat_vecs: [Vec3; 4],
    /// Tangent plane used for the catalog stars.
    tangent_plane: TangentPlane,
}

/// A verified solution candidate.
struct VerifiedSolution {
    matched_stars: u32,
    rms_arcsec: f64,
    transform: RadialQuad2D,
    tangent_plane: TangentPlane,
    matched: Vec<MatchedStarInfo>,
}

/// Entry point: solve from a list of detected image centroids.
/// Loads the database from the file path specified in the request.
pub fn solve_sources(request: &SolveSourcesRequest) -> SolveResult {
    let path = Path::new(&request.database_path);
    let db_id = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let db = match db::load_database(path) {
        Ok(db) => db,
        Err(e) => {
            return SolveResult::failure(vec![format!("Failed to read database: {}", e)]);
        }
    };

    solve_sources_with_db(request, db, &db_id)
}

/// Solve using an already-loaded database (useful for WASM / mobile).
pub fn solve_sources_with_db(
    request: &SolveSourcesRequest,
    db: db::AdbDatabase,
    db_id: &str,
) -> SolveResult {
    let start = timer_now();
    let mut log: Vec<String> = Vec::new();

    log.push(format!(
        "Database: {} stars, {} patterns, FOV {:.1}-{:.1} deg, mag ≤ {:.1}",
        db.header.n_stars, db.header.n_patterns,
        db.header.min_fov_deg, db.header.max_fov_deg, db.header.max_mag
    ));

    // ── 2. Build hash index ────────────────────────────────────────
    let hash_index = HashIndex::build(&db);
    log.push(format!(
        "Hash index built: {} patterns in {} bins (bin_size={:.4})",
        hash_index.total_patterns(),
        // Count unique bins
        0, // (not essential to compute)
        hash_index.bin_size
    ));

    log.push(format!("Input: {} sources", request.sources.len()));

    // Build detected-stars overlay list up-front so all return paths can
    // include it.
    let detected_stars: Vec<DetectedStar> = request
        .sources
        .iter()
        .map(|s| DetectedStar {
            x_px: s.x_px,
            y_px: s.y_px,
            brightness: s.flux.unwrap_or(0.0),
        })
        .collect();

    if request.sources.is_empty() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    // ── 3. Generate image quads ────────────────────────────────────
    let image_quads = generate_image_quads(
        &request.sources,
        MAX_SOURCES_FOR_QUADS,
        MIN_BASELINE_PX,
        hash_index.bin_size,
    );
    log.push(format!("Generated {} image quads", image_quads.len()));

    if image_quads.is_empty() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    // ── 4. Find candidates ────────────────────────────────────────
    let mut candidates = find_candidates(&image_quads, &hash_index, &db);

    log.push(format!("Found {} candidates", candidates.len()));

    if candidates.is_empty() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    // Limit total candidates to prevent pathological blowup.
    if candidates.len() > 2000 {
        candidates.truncate(2000);
    }

    // ── 5. Verify candidates ───────────────────────────────────────
    let best = verify_candidates(&candidates, &request.sources, &db);

    match &best {
        Some(sol) => log.push(format!(
            "Best verified solution: {} matched stars, rms={:.1} arcsec",
            sol.matched_stars, sol.rms_arcsec
        )),
        None => log.push("No candidates verified successfully.".to_string()),
    }

    if best.is_none() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    let solution = best.unwrap();

    // ── 6. Compute final plate solution ────────────────────────────
    let (ra_deg, dec_deg) = image_center_to_radec(
        &solution.transform,
        &solution.tangent_plane,
        request.image_width_px,
        request.image_height_px,
    );

    // The transform maps image pixels to tangent-plane coordinates
    // (in radians).  scale() returns the norm of the column vector (a, e),
    // which is the average pixel scale in radians/pixel.
    let affine_part = solution.transform.affine_part();
    let pixel_scale_arcsec = affine_part.scale().to_degrees() * 3600.0;

    let fov_x_deg = pixel_scale_arcsec * request.image_width_px as f64 / 3600.0;
    let fov_y_deg = pixel_scale_arcsec * request.image_height_px as f64 / 3600.0;

    let roll_deg = affine_part.rotation_deg();

    // Confidence: based on matched star count and RMS error.
    let confidence: f32 = if solution.matched_stars >= 8
        && solution.rms_arcsec < VERIFY_MATCH_RADIUS_ARCSEC * 0.25
    {
        0.95
    } else if solution.matched_stars >= 5 {
        0.75
    } else if solution.matched_stars >= 3 {
        0.5
    } else {
        0.25
    };

    let result = SolveResult {
        success: true,
        ra_deg: Some(ra_deg),
        dec_deg: Some(dec_deg),
        roll_deg: Some(roll_deg as f32),
        fov_x_deg: Some(fov_x_deg as f32),
        fov_y_deg: Some(fov_y_deg as f32),
        pixel_scale_arcsec: Some(pixel_scale_arcsec as f32),
        confidence,
        matched_stars: solution.matched_stars,
        rms_error_arcsec: Some(solution.rms_arcsec as f32),
        solve_time_ms: timer_elapsed(&start),
        database_id: Some(db_id.to_string()),
        log,
        detected_stars,
        matched_star_positions: solution.matched,
    };

    result
}

/// find candidate image↔catalog matches by hash lookup.
fn find_candidates(
    image_quads: &[ImageQuad],
    hash_index: &HashIndex,
    db: &db::AdbDatabase,
) -> Vec<Candidate> {
    let mut candidates = Vec::new();

    // Pre-fetch catalog star unit vectors once.
    let cat_star_vecs: Vec<Vec3> = db
        .stars
        .iter()
        .map(|s| Vec3::new(s.x_unit as f64, s.y_unit as f64, s.z_unit as f64))
        .collect();

    for img_quad in image_quads {
        let hits = hash_index.get_with_neighbors(&img_quad.hash, HASH_NEIGHBOR_RADIUS);
        let mut count = 0;
        for (pattern_idx, _matched_key) in hits {
            if count >= MAX_CANDIDATES_PER_QUAD {
                break;
            }
            count += 1;

            let pattern = &db.patterns[pattern_idx as usize];
            let star_idx = pattern.star_indices;
            if star_idx.iter().any(|&i| i as usize >= cat_star_vecs.len()) {
                continue;
            }

            let cat_vecs = [
                cat_star_vecs[star_idx[0] as usize],
                cat_star_vecs[star_idx[1] as usize],
                cat_star_vecs[star_idx[2] as usize],
                cat_star_vecs[star_idx[3] as usize],
            ];

            // Re-compute the catalog quad hash to get the canonical ordering.
            let dmat = dist_matrix_3d(&cat_vecs);
            let cat_hash = match compute_quad_hash(&dmat, hash_index.bin_size) {
                Some(h) => h,
                None => continue,
            };

            // Set up tangent plane at the centroid of the 4 catalog stars.
            let center = centroid(&cat_vecs);
            let tangent_plane = TangentPlane::at(center);

            // Reorder catalog vectors to match the hash order.
            let cat_reordered_vecs = [
                cat_vecs[cat_hash.order[0]],
                cat_vecs[cat_hash.order[1]],
                cat_vecs[cat_hash.order[2]],
                cat_vecs[cat_hash.order[3]],
            ];

            candidates.push(Candidate {
                image_quad: ImageQuad {
                    order: img_quad.order,
                    points: img_quad.points,
                    hash: img_quad.hash,
                    feature: img_quad.feature,
                },
                cat_vecs: cat_reordered_vecs,
                tangent_plane,
            });
        }
    }

    candidates
}

/// Try all 4 correspondence permutations and verify each one.
///
/// Returns the best verified solution.
fn verify_candidates(
    candidates: &[Candidate],
    sources: &[ImageSource],
    db: &db::AdbDatabase,
) -> Option<VerifiedSolution> {
    let mut best: Option<VerifiedSolution> = None;

    // For each candidate, we use its own tangent plane (centered at the
    // field centroid), so projection is correct for that region.

    for candidate in candidates {
        for &swap_baseline in &[false, true] {
            for &swap_inner in &[false, true] {
                for &reflect_y in &[false, true] {
                    if let Some(sol) = verify_single(candidate, sources, db, swap_baseline, swap_inner, reflect_y) {
                        let is_better = match &best {
                            None => true,
                            Some(existing) => {
                                sol.matched_stars > existing.matched_stars
                                    || (sol.matched_stars == existing.matched_stars
                                        && sol.rms_arcsec < existing.rms_arcsec)
                            }
                        };
                        if is_better {
                            best = Some(sol);
                        }
                    }
                }
            }
        }
    }

    best
}

/// Verify a single correspondence configuration.
///
/// `swap_baseline`: if true, swap A ↔ B in the catalog.
/// `swap_inner`: if true, swap inner[0] ↔ inner[1] in the catalog.
/// `reflect_y`: if true, flip the eta coordinate of catalog points (handles
///   the mirror-image ambiguity from the unsigned |y| in the hash).
fn verify_single(
    candidate: &Candidate,
    sources: &[ImageSource],
    db: &db::AdbDatabase,
    swap_baseline: bool,
    swap_inner: bool,
    reflect_y: bool,
) -> Option<VerifiedSolution> {
    // Image points: [baseline_A, baseline_B, inner_0, inner_1]
    let img_pts = candidate.image_quad.points;

    // Catalog vectors (already reordered [A, B, C, D] by find_candidates).
    // Apply the same swaps here to test all correspondence permutations.
    let mut cat_vecs = candidate.cat_vecs;
    if swap_baseline { cat_vecs.swap(0, 1); }
    if swap_inner { cat_vecs.swap(2, 3); }

    // ── Phase 1: initial 4-point fit on the candidate's tangent plane ──
    // (centered at the quad centroid).  This gives an approximate affine
    // that we use to estimate the field center.
    let mut cat_pts_init = [(0.0, 0.0); 4];
    for i in 0..4 {
        cat_pts_init[i] = candidate.tangent_plane.project(cat_vecs[i])?;
    }
    if reflect_y {
        for p in &mut cat_pts_init { p.1 = -p.1; }
    }
    let src = [img_pts[0], img_pts[1], img_pts[2], img_pts[3]];
    let dst_init = [cat_pts_init[0], cat_pts_init[1], cat_pts_init[2], cat_pts_init[3]];
    let affine_init = Affine2D::fit(&src, &dst_init)?;

    // Quick reject: if the 4-point fit is terrible, skip.
    let loose_threshold_rad = 0.01;
    for i in 0..4 {
        let (xi, eta) = affine_init.apply(src[i].0, src[i].1);
        let dx = xi - dst_init[i].0;
        let dy = eta - dst_init[i].1;
        if (dx * dx + dy * dy).sqrt() > loose_threshold_rad {
            return None;
        }
    }

    // ── Phase 2: re-project to a field-centered tangent plane ──
    // Estimate the field center by applying the initial affine to the
    // centroid of the image sources.  Re-projecting catalog stars to a
    // tangent plane at this point minimises projection distortion, which
    // is the dominant source of error for wide fields (>10°).
    let (cx, cy) = sources.iter().fold((0.0_f64, 0.0_f64), |(ax, ay), s| {
        (ax + s.x_px, ay + s.y_px)
    });
    let n = sources.len() as f64;
    let (cx, cy) = (cx / n, cy / n);

    let (fc_xi, fc_eta) = affine_init.apply(cx, cy);
    let field_center = candidate.tangent_plane.unproject(fc_xi, fc_eta);
    let field_tp = TangentPlane::at(field_center);

    // Re-project the 4 catalog stars to the field-centered tangent plane.
    let mut cat_pts = [(0.0, 0.0); 4];
    for i in 0..4 {
        cat_pts[i] = field_tp.project(cat_vecs[i])?;
    }
    if reflect_y {
        for p in &mut cat_pts { p.1 = -p.1; }
    }
    let dst = [cat_pts[0], cat_pts[1], cat_pts[2], cat_pts[3]];
    let affine = Affine2D::fit(&src, &dst)?;

    // Project ALL catalog stars to the field-centered tangent plane.
    // If reflect_y is set, flip eta for ALL stars (not just the 4 pattern
    // stars) — the entire coordinate system is mirrored.
    let cat_tangent_all: Vec<(f64, f64)> = db
        .stars
        .iter()
        .map(|s| {
            let v = Vec3::new(s.x_unit as f64, s.y_unit as f64, s.z_unit as f64);
            match field_tp.project(v) {
                Some((xi, eta)) => {
                    if reflect_y { (xi, -eta) } else { (xi, eta) }
                }
                None => (f64::MAX, 0.0),
            }
        })
        .collect();

    // Build spatial grid for O(1) nearest-neighbor lookups.
    // Cell size = widest search radius so a 3×3 cell query always suffices.
    let iter_radii_arcsec: [f64; 5] = [900.0, 400.0, 200.0, 100.0, 60.0];
    let grid_cell_size = iter_radii_arcsec[0] / 3600.0 * std::f64::consts::PI / 180.0;
    let grid = CatalogGrid::build(&cat_tangent_all, grid_cell_size);

    // ── Phase 3: multi-scale matching + iterative refit ──
    // Start with the 4-point affine, match at a wide radius to catch
    // enough stars, then refit with a radial-quadratic model that
    // absorbs gnomonic distortion.  Narrow the radius each pass.
    let final_threshold_rad =
        VERIFY_MATCH_RADIUS_ARCSEC / 3600.0 * std::f64::consts::PI / 180.0;

    let mut matched: Vec<MatchedStarInfo> = Vec::new();
    #[allow(unused_assignments)]
    let mut rms_sum_sq = 0.0;
    let mut refine_source_pts: Vec<(f64, f64)> = Vec::new();
    let mut refine_catalog_pts: Vec<(f64, f64)> = Vec::new();

    // The transform starts as affine (from the 4-point fit) and is
    // upgraded to radial-quadratic once we have ≥ 4 matched points.
    let mut quad: Option<RadialQuad2D> = None;

    for _iter in 0..iter_radii_arcsec.len() {
        let iter_threshold_rad =
            iter_radii_arcsec[_iter] / 3600.0 * std::f64::consts::PI / 180.0;

        matched.clear();
        refine_source_pts.clear();
        refine_catalog_pts.clear();

        for s in sources.iter() {
            let (xi, eta) = match quad {
                Some(q) => q.apply(s.x_px, s.y_px),
                None => affine.apply(s.x_px, s.y_px),
            };

            if let Some((best_j, _)) = grid.nearest_within(&cat_tangent_all, xi, eta, iter_threshold_rad) {
                let star = &db.stars[best_j];
                let (ra, dec) = (
                    (star.ra_rad as f64).to_degrees().rem_euclid(360.0),
                    (star.dec_rad as f64).to_degrees(),
                );
                refine_source_pts.push((s.x_px, s.y_px));
                refine_catalog_pts.push(cat_tangent_all[best_j]);
                matched.push(MatchedStarInfo {
                    image_x: s.x_px,
                    image_y: s.y_px,
                    catalog_id: star.catalog_id,
                    ra_deg: ra,
                    dec_deg: dec,
                });
            }
        }

        // Refit with radial-quadratic (handles distortion) when we
        // have ≥ 4 matched points.
        if refine_source_pts.len() < 4 { break; }
        if let Some(new_quad) = RadialQuad2D::fit(&refine_source_pts, &refine_catalog_pts, cx, cy) {
            let prev_a = quad.map(|q| q.a).unwrap_or(affine.a);
            let prev_d = quad.map(|q| q.f).unwrap_or(affine.d);
            let da = new_quad.a - prev_a;
            let dd = new_quad.f - prev_d;
            if (da * da + dd * dd).sqrt() < 1e-12 { break; }
            quad = Some(new_quad);
        } else {
            break;
        }
    }

    // Final re-match at the tightest radius.
    matched.clear();
    rms_sum_sq = 0.0;
    for s in sources.iter() {
        let (xi, eta) = match quad {
            Some(q) => q.apply(s.x_px, s.y_px),
            None => affine.apply(s.x_px, s.y_px),
        };
        if let Some((best_j, best_dist_sq)) = grid.nearest_within(&cat_tangent_all, xi, eta, final_threshold_rad) {
            let star = &db.stars[best_j];
            rms_sum_sq += best_dist_sq;
            let (ra, dec) = (
                (star.ra_rad as f64).to_degrees().rem_euclid(360.0),
                (star.dec_rad as f64).to_degrees(),
            );
            matched.push(MatchedStarInfo {
                image_x: s.x_px,
                image_y: s.y_px,
                catalog_id: star.catalog_id,
                ra_deg: ra,
                dec_deg: dec,
            });
        }
    }

    if (matched.len() as u32) < MIN_MATCHED_STARS {
        return None;
    }

    let n = matched.len() as f64;
    let rms_rad = (rms_sum_sq / n).sqrt();
    let rms_arcsec = rms_rad.to_degrees() * 3600.0;

    // Use the quad transform if available, otherwise wrap the affine.
    let transform = quad.unwrap_or_else(|| {
        RadialQuad2D {
            cx, cy,
            a: affine.a, b: affine.b, c: affine.tx, d: 0.0,
            e: affine.c, f: affine.d, g: affine.ty, h: 0.0,
        }
    });

    Some(VerifiedSolution {
        matched_stars: matched.len() as u32,
        rms_arcsec,
        transform,
        tangent_plane: field_tp,
        matched,
    })
}

/// Compute the RA/Dec of the image center.
fn image_center_to_radec(
    transform: &RadialQuad2D,
    tp: &TangentPlane,
    width_px: u32,
    height_px: u32,
) -> (f64, f64) {
    let center_x = width_px as f64 / 2.0;
    let center_y = height_px as f64 / 2.0;
    let (xi, eta) = transform.apply(center_x, center_y);
    let vec = tp.unproject(xi, eta);
    crate::geometry::unit_to_radec(vec)
}

/// Centroid of 4 unit vectors, normalized.
fn centroid(vecs: &[Vec3; 4]) -> Vec3 {
    let sum = vecs[0].add(vecs[1]).add(vecs[2]).add(vecs[3]);
    sum.normalize()
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ImageSource;
    use std::io::Write;
    use tempfile::tempdir;

    /// Build a test .adb database in the given directory.
    fn make_test_db(dir: &std::path::Path) -> std::path::PathBuf {
        let path = dir.join("test.adb");
        let mut file = std::fs::File::create(&path).unwrap();

        // Pick a set of stars at known positions on the celestial sphere.
        let star_radecs: [(f64, f64); 8] = [
            (45.0, 20.0),
            (46.0, 20.0),
            (45.5, 20.5),
            (45.2, 19.8),
            (45.8, 20.3),
            (44.7, 20.1),
            (45.3, 19.5),
            (44.5, 19.9),
        ];

        let n_stars = star_radecs.len() as u32;
        let n_patterns = 3u32;

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

        // Write stars.
        for (i, &(ra, dec)) in star_radecs.iter().enumerate() {
            let vec = crate::geometry::radec_to_unit(ra, dec);
            let mut star = vec![0u8; 28];
            star[0..4].copy_from_slice(&(i as u32 + 1).to_le_bytes());
            star[4..8].copy_from_slice(&(ra.to_radians() as f32).to_le_bytes());
            star[8..12].copy_from_slice(&(dec.to_radians() as f32).to_le_bytes());
            star[12..16].copy_from_slice(&(vec.x as f32).to_le_bytes());
            star[16..20].copy_from_slice(&(vec.y as f32).to_le_bytes());
            star[20..24].copy_from_slice(&(vec.z as f32).to_le_bytes());
            star[24..28].copy_from_slice(&(5.0 + i as f32 * 0.1).to_le_bytes());
            file.write_all(&star).unwrap();
        }

        // Write patterns.
        // Pattern 0: [0, 1, 2, 3]
        let patterns: [[u16; 4]; 3] = [[0, 1, 2, 3], [0, 1, 4, 5], [2, 3, 6, 7]];
        for pat in &patterns {
            let mut buf = vec![0u8; 8];
            for (i, &s) in pat.iter().enumerate() {
                buf[i * 2..i * 2 + 2].copy_from_slice(&s.to_le_bytes());
            }
            file.write_all(&buf).unwrap();
        }

        path
    }

    #[test]
    fn test_solve_empty_sources() {
        let dir = tempdir().unwrap();
        let db_path = make_test_db(dir.path());

        let req = SolveSourcesRequest {
            sources: vec![],
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: Some(15.0),
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: None,
        };

        let result = solve_sources(&req);
        assert!(!result.success);
        assert!(result.log.iter().any(|l| l.contains("Input: 0 sources")));
    }

    #[test]
    fn test_solve_missing_database() {
        let req = SolveSourcesRequest {
            sources: vec![ImageSource {
                x_px: 100.0,
                y_px: 200.0,
                flux: None,
            }],
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            database_path: "/nonexistent/path.adb".into(),
            solve_timeout_ms: None,
        };

        let result = solve_sources(&req);
        assert!(!result.success);
        assert!(result.log[0].contains("Failed to read database"));
    }

    #[test]
    fn test_solve_synthetic_field() {
        // Generate an image with star positions that correspond to
        // a tangent-plane projection of the catalog field.
        let dir = tempdir().unwrap();
        let db_path = make_test_db(dir.path());

        // Project the 8 catalog stars onto a tangent plane centered at (45.5, 20.0)
        // and then transform to pixel coordinates.
        let db = crate::db::load_database(&db_path).unwrap();
        let center = crate::geometry::radec_to_unit(45.5, 20.0);
        let tp = TangentPlane::at(center);

        // Pixel scale: 0.02 degrees per pixel → ~1.1 deg field for 1200px width.
        let pixel_scale = 0.02_f64.to_radians(); // radians per pixel
        let roll = 10.0_f64.to_radians(); // 10-degree rotation
        let offset_x = 600.0; // image center
        let offset_y = 800.0;

        let cr = roll.cos();
        let sr = roll.sin();

        let mut sources = Vec::new();
        for (i, star) in db.stars.iter().enumerate() {
            let vec = Vec3::new(star.x_unit as f64, star.y_unit as f64, star.z_unit as f64);
            if let Some((xi, eta)) = tp.project(vec) {
                // Apply rotation and scale to get pixel coordinates.
                let px = offset_x + (xi * cr - eta * sr) / pixel_scale;
                let py = offset_y + (xi * sr + eta * cr) / pixel_scale;
                if px > 0.0 && px < 1200.0 && py > 0.0 && py < 1600.0 {
                    sources.push(ImageSource {
                        x_px: px,
                        y_px: py,
                        flux: Some(10.0 - i as f64),
                    });
                }
            }
        }

        assert!(sources.len() >= 4, "Need at least 4 sources, got {}", sources.len());

        let req = SolveSourcesRequest {
            sources,
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: Some(1.0),
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: Some(5000.0),
        };

        let result = solve_sources(&req);

        // Log for debugging.
        for line in &result.log {
            eprintln!("  [solve] {}", line);
        }

        assert!(result.success, "Solve should succeed. Log: {:?}", result.log);
        assert!(result.ra_deg.is_some());
        assert!(result.dec_deg.is_some());
        // Center should be near (45.5, 20.0).
        let ra = result.ra_deg.unwrap();
        let dec = result.dec_deg.unwrap();
        let ra_err = (ra - 45.5).min((ra + 360.0 - 45.5).abs());
        let dec_err = (dec - 20.0).abs();
        assert!(
            ra_err < 2.0,
            "RA should be near 45.5°, got {:.3}° (err {:.3})",
            ra, ra_err
        );
        assert!(
            dec_err < 2.0,
            "Dec should be near 20.0°, got {:.3}° (err {:.3})",
            dec, dec_err
        );
        assert!(result.matched_stars >= 3, "At least 3 matched stars");
        assert!(result.solve_time_ms < 10000);
    }

    #[test]
    fn test_solve_returns_detected_stars() {
        let dir = tempdir().unwrap();
        let db_path = make_test_db(dir.path());

        let sources = vec![
            ImageSource { x_px: 100.0, y_px: 200.0, flux: Some(1.0) },
            ImageSource { x_px: 300.0, y_px: 400.0, flux: Some(0.8) },
        ];

        let req = SolveSourcesRequest {
            sources,
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: None,
        };

        let result = solve_sources(&req);
        // Even on failure, detected stars should be populated.
        assert_eq!(result.detected_stars.len(), 2);
    }
}
