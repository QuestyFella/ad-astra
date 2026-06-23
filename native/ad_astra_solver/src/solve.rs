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

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::db::{self, PreparedDatabase};
use crate::geometry::{Affine2D, RadialQuad2D, TangentPlane, Vec3};
use crate::hash::{
    generate_image_quads, compute_quad_hash, dist_matrix_3d, hash_key_dist_sq,
    quad_feature_dist_sq, HashIndex, ImageQuad,
};
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
type Timer = f64;

#[cfg(target_arch = "wasm32")]
fn timer_now() -> Timer {
    js_sys::Date::now()
}

#[cfg(target_arch = "wasm32")]
fn timer_elapsed(t: &Timer) -> u64 {
    (js_sys::Date::now() - *t).max(0.0) as u64
}

static SOLVE_CANCELLED: AtomicBool = AtomicBool::new(false);

/// Request cooperative cancellation of the in-flight solve (JNI/mobile cancel).
pub fn request_solve_cancel() {
    SOLVE_CANCELLED.store(true, Ordering::Relaxed);
}

/// Clear the cancellation flag (call at the start of each solve).
pub fn clear_solve_cancel() {
    SOLVE_CANCELLED.store(false, Ordering::Relaxed);
}

/// True when a client has requested cancellation of the current solve.
pub fn is_solve_cancelled() -> bool {
    SOLVE_CANCELLED.load(Ordering::Relaxed)
}

fn is_timed_out(start: &Timer, timeout_ms: Option<f64>) -> bool {
    match timeout_ms {
        Some(limit) if limit > 0.0 => timer_elapsed(start) as f64 >= limit,
        _ => false,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AbortKind {
    Cancelled,
    TimedOut,
}

fn check_abort(start: &Timer, timeout_ms: Option<f64>) -> Option<AbortKind> {
    if is_solve_cancelled() {
        Some(AbortKind::Cancelled)
    } else if is_timed_out(start, timeout_ms) {
        Some(AbortKind::TimedOut)
    } else {
        None
    }
}

fn abort_log_message(kind: AbortKind, stage: &str) -> String {
    match kind {
        AbortKind::Cancelled => format!("Solve cancelled by client {stage}"),
        AbortKind::TimedOut => format!("Solve timed out {stage}"),
    }
}

fn fov_within_estimate(
    fov_x_deg: f32,
    fov_y_deg: f32,
    estimate_deg: f32,
    max_error_deg: Option<f32>,
) -> bool {
    let computed = fov_x_deg.max(fov_y_deg);
    let tolerance = max_error_deg.unwrap_or(estimate_deg);
    (computed - estimate_deg).abs() <= tolerance
}

/// Maximum number of brightest sources used for quad generation.
const MAX_SOURCES_FOR_QUADS: usize = 25;

/// Minimum baseline length (pixels) for an image quad.
const MIN_BASELINE_PX: f64 = 5.0;

/// Neighbor search radius for hash lookup (bins).
const HASH_NEIGHBOR_RADIUS: i16 = 1;

/// Maximum catalog patterns to test per image quad.
/// Prevents combinatorial explosion on dense hash bins.
const MAX_CANDIDATES_PER_QUAD: usize = 50;

/// Maximum candidates passed to verification across all image quads.
const MAX_GLOBAL_CANDIDATES: usize = 2000;

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

/// Ranking metadata used before verification caps are applied.
#[derive(Clone, Copy, Debug, PartialEq)]
struct CandidateScore {
    feature_dist_sq: f64,
    key_dist_sq: i64,
    /// Sum of source flux for the image quad (higher is better).
    quad_quality: f64,
}

impl CandidateScore {
    fn cmp_key(self, other: Self) -> std::cmp::Ordering {
        self.feature_dist_sq
            .partial_cmp(&other.feature_dist_sq)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| self.key_dist_sq.cmp(&other.key_dist_sq))
            .then_with(|| {
                other
                    .quad_quality
                    .partial_cmp(&self.quad_quality)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }

    fn is_better_than(self, other: Self) -> bool {
        self.cmp_key(other) == std::cmp::Ordering::Less
    }
}

/// A verified solution candidate.
struct VerifiedSolution {
    matched_stars: u32,
    rms_arcsec: f64,
    transform: RadialQuad2D,
    tangent_plane: TangentPlane,
    /// True when verification used a mirrored η tangent plane.
    reflect_y: bool,
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

    let prepared = PreparedDatabase::from_database(db);
    solve_prepared(request, &prepared, &db_id)
}

/// Solve using a database with a pre-built hash index.
pub fn solve_prepared(
    request: &SolveSourcesRequest,
    prepared: &PreparedDatabase,
    db_id: &str,
) -> SolveResult {
    let db = &prepared.db;
    let hash_index = &prepared.hash_index;
    let start = timer_now();
    let mut log: Vec<String> = Vec::new();

    log.push(format!(
        "Database: {} stars, {} patterns, FOV {:.1}-{:.1} deg, mag ≤ {:.1}",
        db.header.n_stars, db.header.n_patterns,
        db.header.min_fov_deg, db.header.max_fov_deg, db.header.max_mag
    ));

    log.push(format!(
        "Hash index ready: {} patterns (bin_size={:.4})",
        hash_index.total_patterns(),
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

    if let Some(kind) = check_abort(&start, request.solve_timeout_ms) {
        log.push(abort_log_message(kind, "before quad generation."));
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
        || check_abort(&start, request.solve_timeout_ms).is_some(),
    );
    log.push(format!("Generated {} image quads", image_quads.len()));

    if let Some(kind) = check_abort(&start, request.solve_timeout_ms) {
        log.push(abort_log_message(kind, "after quad generation."));
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    if image_quads.is_empty() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    // ── 4. Find candidates ────────────────────────────────────────
    let candidates = find_candidates(
        &image_quads,
        hash_index,
        db,
        &request.sources,
        &start,
        request.solve_timeout_ms,
    );

    log.push(format!("Found {} candidates", candidates.len()));

    if let Some(kind) = check_abort(&start, request.solve_timeout_ms) {
        log.push(abort_log_message(kind, "during candidate lookup."));
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    if candidates.is_empty() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    // ── 5. Verify candidates ───────────────────────────────────────
    let best = verify_candidates(
        &candidates,
        &request.sources,
        &db,
        &start,
        request.solve_timeout_ms,
    );

    match &best {
        Some(sol) => log.push(format!(
            "Best verified solution: {} matched stars, rms={:.1} arcsec",
            sol.matched_stars, sol.rms_arcsec
        )),
        None => {
            if let Some(kind) = check_abort(&start, request.solve_timeout_ms) {
                log.push(abort_log_message(kind, "during candidate verification."));
            } else {
                log.push("No candidates verified successfully.".to_string());
            }
        }
    }

    if best.is_none() {
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    if let Some(kind) = check_abort(&start, request.solve_timeout_ms) {
        log.push(abort_log_message(kind, "after candidate verification."));
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    let solution = best.unwrap();

    // ── 6. Compute final plate solution ────────────────────────────
    let (fov_x_deg, fov_y_deg) = match crate::geometry::image_angular_fov_deg(
        &solution.transform,
        &solution.tangent_plane,
        request.image_width_px,
        request.image_height_px,
        solution.reflect_y,
    ) {
        Some(fov) => fov,
        None => {
            log.push("Could not compute angular FOV from image edges.".to_string());
            let elapsed = timer_elapsed(&start);
            let mut result = SolveResult::failure(log);
            result.database_id = Some(db_id.to_string());
            result.solve_time_ms = elapsed;
            result.detected_stars = detected_stars;
            return result;
        }
    };
    let pixel_scale_arcsec = (
        (fov_x_deg / request.image_width_px as f64)
            + (fov_y_deg / request.image_height_px as f64)
    ) / 2.0 * 3600.0;

    let (ra_deg, dec_deg) = image_center_to_radec(
        &solution.transform,
        &solution.tangent_plane,
        request.image_width_px,
        request.image_height_px,
        solution.reflect_y,
    );

    if let Some(fov_est) = request.fov_estimate_deg {
        if !fov_within_estimate(
            fov_x_deg as f32,
            fov_y_deg as f32,
            fov_est,
            request.fov_max_error_deg,
        ) {
            let tolerance = request.fov_max_error_deg.unwrap_or(fov_est);
            log.push(format!(
                "Computed FOV {:.1}°×{:.1}° outside estimate {:.1}° ± {:.1}°",
                fov_x_deg, fov_y_deg, fov_est, tolerance
            ));
            let elapsed = timer_elapsed(&start);
            let mut result = SolveResult::failure(log);
            result.database_id = Some(db_id.to_string());
            result.solve_time_ms = elapsed;
            result.detected_stars = detected_stars;
            return result;
        }
    }

    let computed_fov = fov_x_deg.max(fov_y_deg);
    if computed_fov < db.header.min_fov_deg as f64
        || computed_fov > db.header.max_fov_deg as f64
    {
        log.push(format!(
            "Computed FOV {:.1}°×{:.1}° outside database range {:.1}-{:.1}°",
            fov_x_deg, fov_y_deg, db.header.min_fov_deg, db.header.max_fov_deg
        ));
        let elapsed = timer_elapsed(&start);
        let mut result = SolveResult::failure(log);
        result.database_id = Some(db_id.to_string());
        result.solve_time_ms = elapsed;
        result.detected_stars = detected_stars;
        return result;
    }

    let roll_deg = solution.transform.affine_part().rotation_deg();

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

/// Solve using an already-loaded database (builds hash index each call).
pub fn solve_sources_with_db(
    request: &SolveSourcesRequest,
    db: db::AdbDatabase,
    db_id: &str,
) -> SolveResult {
    let prepared = PreparedDatabase::from_database(db);
    solve_prepared(request, &prepared, db_id)
}

/// Sum of source flux for the stars in an image quad (brightest-first tie-break).
fn image_quad_quality(sources: &[ImageSource], order: &[usize; 4]) -> f64 {
    order
        .iter()
        .map(|&idx| sources[idx].flux.unwrap_or(0.0))
        .sum()
}

/// Rank and cap a scored candidate list (lower `CandidateScore` is better).
fn sort_and_cap_candidates(
    mut ranked: Vec<(Candidate, CandidateScore)>,
    cap: usize,
) -> Vec<(Candidate, CandidateScore)> {
    ranked.sort_by(|(_, a), (_, b)| a.cmp_key(*b));
    ranked.truncate(cap);
    ranked
}

/// find candidate image↔catalog matches by hash lookup.
fn find_candidates(
    image_quads: &[ImageQuad],
    hash_index: &HashIndex,
    db: &db::AdbDatabase,
    sources: &[ImageSource],
    start: &Timer,
    timeout_ms: Option<f64>,
) -> Vec<Candidate> {
    let mut ranked: Vec<(Candidate, CandidateScore)> = Vec::new();

    // Pre-fetch catalog star unit vectors once.
    let cat_star_vecs: Vec<Vec3> = db
        .stars
        .iter()
        .map(|s| Vec3::new(s.x_unit as f64, s.y_unit as f64, s.z_unit as f64))
        .collect();

    for img_quad in image_quads {
        if check_abort(start, timeout_ms).is_some() {
            break;
        }

        let quad_quality = image_quad_quality(sources, &img_quad.order);
        let hits = hash_index.get_with_neighbors(&img_quad.hash, HASH_NEIGHBOR_RADIUS);

        // Deduplicate by catalog pattern, keeping the best hash match.
        let mut best_by_pattern: HashMap<u32, CandidateScore> = HashMap::new();

        for (pattern_idx, matched_key) in hits {
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

            let dmat = dist_matrix_3d(&cat_vecs);
            let cat_hash = match compute_quad_hash(&dmat, hash_index.bin_size) {
                Some(h) => h,
                None => continue,
            };

            let score = CandidateScore {
                feature_dist_sq: quad_feature_dist_sq(&img_quad.feature, &cat_hash.feature),
                key_dist_sq: hash_key_dist_sq(&img_quad.hash, &matched_key),
                quad_quality,
            };

            best_by_pattern
                .entry(pattern_idx)
                .and_modify(|existing| {
                    if score.is_better_than(*existing) {
                        *existing = score;
                    }
                })
                .or_insert(score);
        }

        let mut quad_ranked: Vec<(Candidate, CandidateScore)> = Vec::new();

        for (pattern_idx, score) in best_by_pattern {
            let pattern = &db.patterns[pattern_idx as usize];
            let star_idx = pattern.star_indices;
            let cat_vecs = [
                cat_star_vecs[star_idx[0] as usize],
                cat_star_vecs[star_idx[1] as usize],
                cat_star_vecs[star_idx[2] as usize],
                cat_star_vecs[star_idx[3] as usize],
            ];

            let dmat = dist_matrix_3d(&cat_vecs);
            let cat_hash = match compute_quad_hash(&dmat, hash_index.bin_size) {
                Some(h) => h,
                None => continue,
            };

            let center = centroid(&cat_vecs);
            let tangent_plane = TangentPlane::at(center);
            let cat_reordered_vecs = [
                cat_vecs[cat_hash.order[0]],
                cat_vecs[cat_hash.order[1]],
                cat_vecs[cat_hash.order[2]],
                cat_vecs[cat_hash.order[3]],
            ];

            quad_ranked.push((
                Candidate {
                    image_quad: ImageQuad {
                        order: img_quad.order,
                        points: img_quad.points,
                        hash: img_quad.hash,
                        feature: img_quad.feature,
                    },
                    cat_vecs: cat_reordered_vecs,
                    tangent_plane,
                },
                score,
            ));
        }

        ranked.extend(sort_and_cap_candidates(quad_ranked, MAX_CANDIDATES_PER_QUAD));
    }

    sort_and_cap_candidates(ranked, MAX_GLOBAL_CANDIDATES)
        .into_iter()
        .map(|(candidate, _)| candidate)
        .collect()
}

/// Try all 4 correspondence permutations and verify each one.
///
/// Returns the best verified solution.
fn verify_candidates(
    candidates: &[Candidate],
    sources: &[ImageSource],
    db: &db::AdbDatabase,
    start: &Timer,
    timeout_ms: Option<f64>,
) -> Option<VerifiedSolution> {
    let mut best: Option<VerifiedSolution> = None;
    let mut should_abort = || check_abort(start, timeout_ms).is_some();

    // For each candidate, we use its own tangent plane (centered at the
    // field centroid), so projection is correct for that region.

    for candidate in candidates {
        if should_abort() {
            break;
        }

        for &swap_baseline in &[false, true] {
            if should_abort() {
                break;
            }
            for &swap_inner in &[false, true] {
                if should_abort() {
                    break;
                }
                for &reflect_y in &[false, true] {
                    if should_abort() {
                        break;
                    }
                    if let Some(sol) = verify_single(
                        candidate,
                        sources,
                        db,
                        swap_baseline,
                        swap_inner,
                        reflect_y,
                        &mut should_abort,
                    ) {
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

    if check_abort(start, timeout_ms).is_some() {
        return None;
    }

    best
}

/// Match image sources to catalog stars one-to-one within `threshold_rad`.
fn match_sources_one_to_one(
    sources: &[ImageSource],
    apply: impl Fn(f64, f64) -> (f64, f64),
    grid: &CatalogGrid,
    cat_tangent_all: &[(f64, f64)],
    db: &db::AdbDatabase,
    threshold_rad: f64,
) -> (Vec<(MatchedStarInfo, usize)>, f64) {
    let threshold_sq = threshold_rad * threshold_rad;
    let mut pair_candidates: Vec<(usize, usize, f64)> = Vec::new();

    for (si, s) in sources.iter().enumerate() {
        let (xi, eta) = apply(s.x_px, s.y_px);
        if let Some((best_j, dist_sq)) =
            grid.nearest_within(cat_tangent_all, xi, eta, threshold_rad)
        {
            if dist_sq <= threshold_sq {
                pair_candidates.push((si, best_j, dist_sq));
            }
        }
    }

    pair_candidates.sort_by(|a, b| {
        a.2.partial_cmp(&b.2)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut used_sources = HashSet::new();
    let mut used_catalog = HashSet::new();
    let mut matched = Vec::new();
    let mut rms_sum_sq = 0.0;

    for (si, cat_j, dist_sq) in pair_candidates {
        if used_sources.contains(&si) || used_catalog.contains(&cat_j) {
            continue;
        }
        used_sources.insert(si);
        used_catalog.insert(cat_j);

        let s = &sources[si];
        let star = &db.stars[cat_j];
        rms_sum_sq += dist_sq;
        let (ra, dec) = (
            (star.ra_rad as f64).to_degrees().rem_euclid(360.0),
            (star.dec_rad as f64).to_degrees(),
        );
        matched.push((
            MatchedStarInfo {
                image_x: s.x_px,
                image_y: s.y_px,
                catalog_id: star.catalog_id,
                ra_deg: ra,
                dec_deg: dec,
            },
            cat_j,
        ));
    }

    (matched, rms_sum_sq)
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
    should_abort: &mut impl FnMut() -> bool,
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
        cat_pts_init[i] = candidate.tangent_plane.project_matching(cat_vecs[i], reflect_y)?;
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
    let field_center = candidate
        .tangent_plane
        .unproject_matching(fc_xi, fc_eta, reflect_y);
    let field_tp = TangentPlane::at(field_center);

    // Re-project the 4 catalog stars to the field-centered tangent plane.
    let mut cat_pts = [(0.0, 0.0); 4];
    for i in 0..4 {
        cat_pts[i] = field_tp.project_matching(cat_vecs[i], reflect_y)?;
    }
    let dst = [cat_pts[0], cat_pts[1], cat_pts[2], cat_pts[3]];
    let affine = Affine2D::fit(&src, &dst)?;

    // Project ALL catalog stars to the field-centered tangent plane.
    // If reflect_y is set, flip eta for ALL stars (not just the 4 pattern
    // stars) — the entire coordinate system is mirrored.
    if should_abort() {
        return None;
    }
    let mut cat_tangent_all = Vec::with_capacity(db.stars.len());
    for (idx, s) in db.stars.iter().enumerate() {
        if idx > 0 && idx % 512 == 0 && should_abort() {
            return None;
        }
        let v = Vec3::new(s.x_unit as f64, s.y_unit as f64, s.z_unit as f64);
        cat_tangent_all.push(
            field_tp
                .project_matching(v, reflect_y)
                .unwrap_or((f64::MAX, 0.0)),
        );
    }

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
        if should_abort() {
            return None;
        }
        let iter_threshold_rad =
            iter_radii_arcsec[_iter] / 3600.0 * std::f64::consts::PI / 180.0;

        let apply = |x: f64, y: f64| match quad {
            Some(q) => q.apply(x, y),
            None => affine.apply(x, y),
        };

        matched.clear();
        refine_source_pts.clear();
        refine_catalog_pts.clear();

        let (iter_matched, _) = match_sources_one_to_one(
            sources,
            apply,
            &grid,
            &cat_tangent_all,
            db,
            iter_threshold_rad,
        );

        for (m, cat_j) in &iter_matched {
            refine_source_pts.push((m.image_x, m.image_y));
            refine_catalog_pts.push(cat_tangent_all[*cat_j]);
            matched.push(m.clone());
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
    if should_abort() {
        return None;
    }
    let apply_final = |x: f64, y: f64| match quad {
        Some(q) => q.apply(x, y),
        None => affine.apply(x, y),
    };
    let (final_matched, final_rms_sum_sq) = match_sources_one_to_one(
        sources,
        apply_final,
        &grid,
        &cat_tangent_all,
        db,
        final_threshold_rad,
    );
    matched = final_matched.into_iter().map(|(m, _)| m).collect();
    rms_sum_sq = final_rms_sum_sq;

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
        reflect_y,
        matched,
    })
}

/// Compute the RA/Dec of the image center.
fn image_center_to_radec(
    transform: &RadialQuad2D,
    tp: &TangentPlane,
    width_px: u32,
    height_px: u32,
    reflect_y: bool,
) -> (f64, f64) {
    let center_x = width_px as f64 / 2.0;
    let center_y = height_px as f64 / 2.0;
    let (xi, eta) = transform.apply(center_x, center_y);
    let vec = tp.unproject_matching(xi, eta, reflect_y);
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
        header[20..24].copy_from_slice(&60.0f32.to_le_bytes());
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
    fn test_solve_cancel_flag() {
        clear_solve_cancel();
        assert!(!is_solve_cancelled());
        request_solve_cancel();
        assert!(is_solve_cancelled());
        clear_solve_cancel();
        assert!(!is_solve_cancelled());
    }

    #[test]
    fn test_solve_prepared_respects_cancel_flag() {
        let dir = tempdir().unwrap();
        let db_path = make_test_db(dir.path());
        let prepared = PreparedDatabase::load(&db_path).unwrap();

        clear_solve_cancel();
        request_solve_cancel();

        let sources: Vec<ImageSource> = (0..12)
            .map(|i| ImageSource {
                x_px: i as f64 * 25.0,
                y_px: (i as f64 % 4.0) * 30.0,
                flux: Some(12.0 - i as f64),
            })
            .collect();

        let req = SolveSourcesRequest {
            sources,
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: None,
        };

        let result = solve_prepared(&req, &prepared, "test");
        clear_solve_cancel();

        assert!(!result.success);
        assert!(
            result.log.iter().any(|l| l.contains("cancelled by client")),
            "expected cancel log, got: {:?}",
            result.log
        );
    }

    #[test]
    fn test_solve_prepared_times_out_immediately() {
        let dir = tempdir().unwrap();
        let db_path = make_test_db(dir.path());
        let prepared = PreparedDatabase::load(&db_path).unwrap();

        let sources: Vec<ImageSource> = (0..25)
            .map(|i| ImageSource {
                x_px: i as f64 * 18.0,
                y_px: (i as f64 % 5.0) * 22.0,
                flux: Some(25.0 - i as f64),
            })
            .collect();

        let req = SolveSourcesRequest {
            sources,
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: Some(1.0),
        };

        clear_solve_cancel();
        assert!(!is_solve_cancelled(), "cancel flag must be clear for timeout test");
        let result = solve_prepared(&req, &prepared, "test");
        clear_solve_cancel();

        assert!(!result.success);
        assert!(
            result.log.iter().any(|l| l.contains("timed out")),
            "expected timeout log, got: {:?}",
            result.log
        );
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
            fov_estimate_deg: None,
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

    fn make_minimal_db(star_count: usize) -> crate::db::AdbDatabase {
        crate::db::AdbDatabase {
            header: crate::db::AdbHeader {
                version: 1,
                n_stars: star_count as u32,
                n_patterns: 0,
                min_fov_deg: 10.0,
                max_fov_deg: 60.0,
                max_mag: 7.0,
                epoch: 2000,
                pattern_size: 4,
                pattern_bins: 50,
            },
            stars: (0..star_count)
                .map(|i| crate::db::StarRecord {
                    catalog_id: (i + 1) as u32,
                    ra_rad: 0.0,
                    dec_rad: 0.0,
                    x_unit: 0.0,
                    y_unit: 0.0,
                    z_unit: 1.0,
                    mag: 5.0,
                })
                .collect(),
            patterns: Vec::new(),
        }
    }

    #[test]
    fn test_match_sources_one_to_one_no_duplicate_catalog() {
        let db = make_minimal_db(2);
        let cat_tangent_all = vec![(0.0, 0.0), (1.0, 0.0)];
        let grid = CatalogGrid::build(&cat_tangent_all, 0.25);
        let identity = |x: f64, y: f64| (x, y);

        // Two sources cluster near catalog star 0; greedy one-to-one should claim only one.
        let crowded_sources = vec![
            ImageSource {
                x_px: 0.01,
                y_px: 0.0,
                flux: None,
            },
            ImageSource {
                x_px: 0.03,
                y_px: 0.0,
                flux: None,
            },
        ];
        let (crowded_matches, _) = match_sources_one_to_one(
            &crowded_sources,
            identity,
            &grid,
            &cat_tangent_all,
            &db,
            0.2,
        );
        assert_eq!(crowded_matches.len(), 1, "only one source should claim catalog star 0");
        assert_eq!(crowded_matches[0].0.catalog_id, 1);

        // Crossed nearest-neighbor case: each source is closest to the opposite catalog star.
        let crossed_sources = vec![
            ImageSource {
                x_px: 0.55,
                y_px: 0.0,
                flux: None,
            },
            ImageSource {
                x_px: 0.45,
                y_px: 0.0,
                flux: None,
            },
        ];
        let (crossed_matches, _) = match_sources_one_to_one(
            &crossed_sources,
            identity,
            &grid,
            &cat_tangent_all,
            &db,
            0.6,
        );
        assert_eq!(crossed_matches.len(), 2, "both sources should match uniquely");
        let assigned: Vec<usize> = crossed_matches.iter().map(|(_, cat_j)| *cat_j).collect();
        assert_eq!(assigned.len(), assigned.iter().collect::<std::collections::HashSet<_>>().len());
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

    /// Wrong-star distractor patterns plus the true pattern listed last.
    fn make_adversarial_ranking_db(
        true_pattern: [u16; 4],
        distractor_count: usize,
    ) -> crate::db::AdbDatabase {
        use crate::db::{AdbHeader, PatternRecord, StarRecord};
        use crate::geometry::{radec_to_unit, unit_to_radec};

        let field_stars: [(f64, f64); 8] = [
            (45.0, 20.0),
            (46.0, 20.0),
            (45.5, 20.5),
            (45.2, 19.8),
            (45.8, 20.3),
            (44.7, 20.1),
            (45.3, 19.5),
            (44.5, 19.9),
        ];

        let mut stars: Vec<StarRecord> = field_stars
            .iter()
            .enumerate()
            .map(|(i, &(ra, dec))| {
                let vec = radec_to_unit(ra, dec);
                StarRecord {
                    catalog_id: (i + 1) as u32,
                    ra_rad: ra.to_radians() as f32,
                    dec_rad: dec.to_radians() as f32,
                    x_unit: vec.x as f32,
                    y_unit: vec.y as f32,
                    z_unit: vec.z as f32,
                    mag: 5.0 + i as f32 * 0.05,
                }
            })
            .collect();

        let pivot = radec_to_unit(44.0, 19.0);
        let axis = pivot.cross(Vec3::new(0.0, 0.0, 1.0)).normalize();
        for seed in 0..distractor_count {
            let angle = (seed as f64 + 1.0) * 0.02;
            let vec = pivot
                .scale(angle.cos())
                .add(axis.scale(angle.sin()))
                .normalize();
            let (ra, dec) = unit_to_radec(vec);
            stars.push(StarRecord {
                catalog_id: stars.len() as u32 + 1,
                ra_rad: ra.to_radians() as f32,
                dec_rad: dec.to_radians() as f32,
                x_unit: vec.x as f32,
                y_unit: vec.y as f32,
                z_unit: vec.z as f32,
                mag: 8.5,
            });
        }

        let filler_base = 8usize;
        let mut patterns: Vec<PatternRecord> = (0..distractor_count)
            .map(|i| PatternRecord {
                star_indices: [
                    4,
                    5,
                    6,
                    (filler_base + i) as u16,
                ],
            })
            .collect();
        patterns.push(PatternRecord {
            star_indices: true_pattern,
        });

        crate::db::AdbDatabase {
            header: AdbHeader {
                version: 1,
                n_stars: stars.len() as u32,
                n_patterns: patterns.len() as u32,
                min_fov_deg: 10.0,
                max_fov_deg: 60.0,
                max_mag: 7.0,
                epoch: 2000,
                pattern_size: 4,
                pattern_bins: 50,
            },
            stars,
            patterns,
        }
    }

    #[test]
    fn test_candidate_ranking_survives_dense_hash_bucket() {
        let dir = tempdir().unwrap();
        let db_path = make_test_db(dir.path());
        let db = crate::db::load_database(&db_path).unwrap();
        let center = crate::geometry::radec_to_unit(45.5, 20.0);
        let tp = TangentPlane::at(center);

        let pixel_scale = 0.02_f64.to_radians();
        let roll = 10.0_f64.to_radians();
        let offset_x = 600.0;
        let offset_y = 800.0;
        let cr = roll.cos();
        let sr = roll.sin();

        let mut sources = Vec::new();
        for (i, star) in db.stars.iter().enumerate() {
            let vec = Vec3::new(star.x_unit as f64, star.y_unit as f64, star.z_unit as f64);
            if let Some((xi, eta)) = tp.project(vec) {
                let px = offset_x + (xi * cr - eta * sr) / pixel_scale;
                let py = offset_y + (xi * sr + eta * cr) / pixel_scale;
                if px > 0.0 && px < 1200.0 && py > 0.0 && py < 1600.0 {
                    sources.push(ImageSource {
                        x_px: px,
                        y_px: py,
                        flux: Some(20.0 - i as f64),
                    });
                }
            }
        }
        assert!(sources.len() >= 8, "need a rich synthetic field");

        let hash_index = crate::hash::HashIndex::build(&db);
        let image_quads = generate_image_quads(
            &sources,
            MAX_SOURCES_FOR_QUADS,
            MIN_BASELINE_PX,
            hash_index.bin_size,
            || false,
        );
        assert!(!image_quads.is_empty());

        // Pick the image quad that best matches the true catalog pattern [0,1,2,3].
        let true_pattern = [0u16, 1, 2, 3];
        let cat_vecs: [Vec3; 4] = [
            Vec3::new(db.stars[0].x_unit as f64, db.stars[0].y_unit as f64, db.stars[0].z_unit as f64),
            Vec3::new(db.stars[1].x_unit as f64, db.stars[1].y_unit as f64, db.stars[1].z_unit as f64),
            Vec3::new(db.stars[2].x_unit as f64, db.stars[2].y_unit as f64, db.stars[2].z_unit as f64),
            Vec3::new(db.stars[3].x_unit as f64, db.stars[3].y_unit as f64, db.stars[3].z_unit as f64),
        ];
        let true_hash = compute_quad_hash(&dist_matrix_3d(&cat_vecs), hash_index.bin_size).unwrap();

        let target_quad = image_quads
            .iter()
            .min_by(|a, b| {
                let da = quad_feature_dist_sq(&a.feature, &true_hash.feature);
                let db = quad_feature_dist_sq(&b.feature, &true_hash.feature);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })
            .expect("image quad matching true pattern");

        let adversarial_db = make_adversarial_ranking_db(
            true_pattern,
            MAX_GLOBAL_CANDIDATES + MAX_CANDIDATES_PER_QUAD,
        );
        assert!(
            adversarial_db.patterns.len() > MAX_GLOBAL_CANDIDATES,
            "adversarial DB must exceed global candidate cap"
        );

        let true_pattern_idx = (adversarial_db.patterns.len() - 1) as u32;
        let mut prepared = PreparedDatabase::from_database(adversarial_db);
        for pattern_idx in 0..true_pattern_idx {
            prepared
                .hash_index
                .inject_pattern_for_test(target_quad.hash, pattern_idx);
        }

        let req = SolveSourcesRequest {
            sources,
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: Some(30_000.0),
        };

        let result = solve_prepared(&req, &prepared, "adversarial");

        for line in &result.log {
            eprintln!("  [adversarial] {}", line);
        }

        assert!(
            result.success,
            "ranked candidate selection should keep the true match. Log: {:?}",
            result.log
        );
        let ra_err = (result.ra_deg.unwrap() - 45.5).abs().min(
            (result.ra_deg.unwrap() + 360.0 - 45.5).abs(),
        );
        assert!(ra_err < 2.0, "RA should be near 45.5°");
        assert!((result.dec_deg.unwrap() - 20.0).abs() < 2.0, "Dec should be near 20.0°");
    }
}
