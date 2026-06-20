//! Integration test against the real `data/processed/default.adb` database.
//!
//! Marked `#[ignore]` so it does not run in CI / normal `cargo test`.  It
//! requires the database to have been built via `python scripts/build_adb.py`.
//!
//! Run with:
//!     cargo test --manifest-path native/ad_astra_solver/Cargo.toml \
//!         --test solve_real_db -- --ignored --nocapture

use std::io::Read;
use std::path::PathBuf;
use std::time::Instant;

use ad_astra_solver::{
    db, geometry::{radec_to_unit, TangentPlane, Vec3}, hash::HashIndex,
    solve_sources, solve_sources_with_db,
    types::{ImageSource, SolveSourcesRequest},
};

fn db_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/processed/default.adb")
}

fn field_center() -> Vec3 {
    // Orion region — well-populated part of the Hipparcos catalog.
    radec_to_unit(83.0, -5.0)
}

/// Build synthetic pixel sources from catalog stars visible in a field.
///
/// Returns `(sources, true_ra_deg, true_dec_deg, true_fov, true_roll)`.
fn build_synthetic_sources(
    db: &db::AdbDatabase,
    center_ra_deg: f64,
    center_dec_deg: f64,
    fov_deg: f64,
    image_w: u32,
    image_h: u32,
    roll_deg: f64,
    max_sources: usize,
    noise_px: f64,
) -> (Vec<ImageSource>, f64, f64, f64, f64) {
    let center = radec_to_unit(center_ra_deg, center_dec_deg);
    let tp = TangentPlane::at(center);
    let pixel_scale = fov_deg.to_radians() / image_w as f64;
    let roll = roll_deg.to_radians();
    let cr = roll.cos();
    let sr = roll.sin();
    let cx = image_w as f64 / 2.0;
    let cy = image_h as f64 / 2.0;

    let mut sources: Vec<ImageSource> = Vec::new();
    for star in db.stars.iter() {
        let v = Vec3::new(star.x_unit as f64, star.y_unit as f64, star.z_unit as f64);
        if let Some((xi, eta)) = tp.project(v) {
            // Apply rotation
            let xr = xi * cr - eta * sr;
            let yr = xi * sr + eta * cr;
            let mut px = cx + xr / pixel_scale;
            let mut py = cy + yr / pixel_scale;
            if noise_px > 0.0 {
                // Use deterministic pseudo-noise via star index for reproducibility
                let seed = star.catalog_id as f64 * 0.618033988749895;
                px += ((seed * 1000.0) % 2.0 - 1.0) * noise_px;
                py += ((seed * 2000.0) % 2.0 - 1.0) * noise_px;
            }
            let margin = 10.0;
            if px > margin && px < image_w as f64 - margin
                && py > margin && py < image_h as f64 - margin
            {
                let flux = (7.0 - star.mag as f64).max(0.0) + 1.0;
                sources.push(ImageSource { x_px: px, y_px: py, flux: Some(flux) });
            }
        }
        if sources.len() >= max_sources {
            break;
        }
    }
    (sources, center_ra_deg, center_dec_deg, fov_deg, roll_deg)
}

fn validate_solution(
    result: &ad_astra_solver::types::SolveResult,
    true_ra: f64,
    true_dec: f64,
    min_matched: u32,
    max_ra_err: f64,
    max_dec_err: f64,
) {
    assert!(result.success, "solve failed: {:?}", result.log);
    let ra = result.ra_deg.unwrap();
    let dec = result.dec_deg.unwrap();
    let ra_err = (ra - true_ra).abs().min((ra + 360.0 - true_ra).abs());
    let dec_err = (dec - true_dec).abs();
    eprintln!("  solved RA={:.4}° Dec={:.4}° (target {:.1},{:.1}) err=({:.3},{:.3})° matched={} rms={:.1}\"",
        ra, dec, true_ra, true_dec, ra_err, dec_err,
        result.matched_stars, result.rms_error_arcsec.unwrap_or(0.0));
    assert!(ra_err < max_ra_err, "RA error {:.3}° > {:.3}°", ra_err, max_ra_err);
    assert!(dec_err < max_dec_err, "Dec error {:.3}° > {:.3}°", dec_err, max_dec_err);
    assert!(result.matched_stars >= min_matched, "only {} matched stars", result.matched_stars);
}

#[test]
#[ignore]
fn test_hash_index_builds_from_real_db() {
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist (run scripts/build_adb.py)", path.display());
        return;
    }

    let t = Instant::now();
    let db = db::load_database(&path).expect("load db");
    eprintln!("loaded db: {} stars, {} patterns in {:?}", db.header.n_stars, db.header.n_patterns, t.elapsed());

    let t = Instant::now();
    let index = HashIndex::build(&db);
    eprintln!(
        "built hash index: {} patterns in {} bins in {:?} (bin_size={:.4})",
        index.total_patterns(),
        "n/a",
        t.elapsed(),
        index.bin_size,
    );

    assert!(index.total_patterns() > 1_000_000, "expected millions of patterns");
}

/// Verifies that `load_database_from_bytes` produces the same database as
/// `load_database` from a file.  This is the code path used by WASM.
#[test]
#[ignore]
fn test_load_database_from_bytes() {
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist", path.display());
        return;
    }

    let db_file = db::load_database(&path).expect("load db from file");

    let mut file = std::fs::File::open(&path).expect("open file");
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).expect("read file");
    let db_bytes = db::load_database_from_bytes(&bytes).expect("load db from bytes");

    assert_eq!(db_file.header, db_bytes.header, "headers should match");
    assert_eq!(db_file.stars.len(), db_bytes.stars.len(), "star counts should match");
    assert_eq!(db_file.patterns.len(), db_bytes.patterns.len(), "pattern counts should match");
    assert_eq!(db_file.stars[0], db_bytes.stars[0], "first star should match");
    assert_eq!(db_file.stars[100], db_bytes.stars[100], "100th star should match");
    assert_eq!(db_file.patterns[0], db_bytes.patterns[0], "first pattern should match");

    eprintln!("bytes-based load OK: {} stars, {} patterns", db_bytes.stars.len(), db_bytes.patterns.len());
}

/// Existing solve test via file path (kept for regression).
#[test]
#[ignore]
fn test_solve_real_db_synthetic_field() {
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist (run scripts/build_adb.py)", path.display());
        return;
    }

    let db = db::load_database(&path).expect("load db");
    let center = field_center();
    let tp = TangentPlane::at(center);
    let pixel_scale = 0.015_f64.to_radians();
    let roll = 10.0_f64.to_radians();
    let cr = roll.cos();
    let sr = roll.sin();

    let mut sources: Vec<ImageSource> = Vec::new();
    let mut source_catalog_idx: Vec<usize> = Vec::new();
    for (i, star) in db.stars.iter().enumerate() {
        let v = Vec3::new(star.x_unit as f64, star.y_unit as f64, star.z_unit as f64);
        if let Some((xi, eta)) = tp.project(v) {
            let px = 800.0 + (xi * cr - eta * sr) / pixel_scale;
            let py = 600.0 + (xi * sr + eta * cr) / pixel_scale;
            if px > 10.0 && px < 1590.0 && py > 10.0 && py < 1190.0 {
                sources.push(ImageSource {
                    x_px: px,
                    y_px: py,
                    flux: Some(10.0 - star.mag as f64 * 0.5),
                });
                source_catalog_idx.push(i);
            }
        }
        if sources.len() >= 20 {
            break;
        }
    }
    eprintln!("generated {} synthetic sources", sources.len());
    assert!(sources.len() >= 8, "need at least 8 in-field sources");
    eprintln!("source catalog indices: {:?}", &source_catalog_idx[..5.min(source_catalog_idx.len())]);

    let req = SolveSourcesRequest {
        sources,
        image_width_px: 1600,
        image_height_px: 1200,
        fov_estimate_deg: Some(15.0),
        fov_max_error_deg: None,
        database_path: path.to_string_lossy().to_string(),
        solve_timeout_ms: Some(60_000.0),
    };

    let t = Instant::now();
    let result = solve_sources(&req);
    eprintln!("solve took {:?}", t.elapsed());
    for line in &result.log {
        eprintln!("  [solve] {}", line);
    }

    assert!(result.success, "solve failed: {:?}", result.log);
    let (ra, dec) = (result.ra_deg.unwrap(), result.dec_deg.unwrap());
    let center_radec = (83.0_f64, -5.0_f64);
    let ra_err = (ra - center_radec.0).abs().min((ra + 360.0 - center_radec.0).abs());
    let dec_err = (dec - center_radec.1).abs();
    eprintln!("solved RA={:.4}° Dec={:.4}° (target 83.0, -5.0)", ra, dec);
    eprintln!("  matched_stars={}  confidence={:.2}  rms={:.1}\"",
              result.matched_stars, result.confidence,
              result.rms_error_arcsec.unwrap_or(0.0));
    assert!(ra_err < 3.0, "RA error too large: {:.3}°", ra_err);
    assert!(dec_err < 3.0, "Dec error too large: {:.3}°", dec_err);
    assert!(result.matched_stars >= 3, "too few matched stars");
}

/// Solve via `solve_sources_with_db` (bytes-based entry point used by WASM).
#[test]
#[ignore]
fn test_solve_synthetic_field_bytes() {
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist", path.display());
        return;
    }

    let mut file = std::fs::File::open(&path).expect("open file");
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).expect("read file");
    let db = db::load_database_from_bytes(&bytes).expect("load db from bytes");

    let (sources, true_ra, true_dec, _fov, _roll) = build_synthetic_sources(
        &db, 83.0, -5.0, 15.0, 1600, 1200, 10.0, 20, 0.0,
    );
    eprintln!("generated {} synthetic sources", sources.len());
    assert!(sources.len() >= 8, "need at least 8 sources");

    let req = SolveSourcesRequest {
        sources,
        image_width_px: 1600,
        image_height_px: 1200,
        fov_estimate_deg: Some(15.0),
        fov_max_error_deg: None,
        database_path: "memory".to_string(),
        solve_timeout_ms: Some(60_000.0),
    };

    let t = Instant::now();
    let result = solve_sources_with_db(&req, db, "memory");
    eprintln!("bytes-based solve took {:?}", t.elapsed());
    for line in &result.log {
        eprintln!("  [solve] {}", line);
    }

    validate_solution(&result, true_ra, true_dec, 6, 3.0, 3.0);
}

/// Sweep test: verify the solver succeeds across a range of field conditions
/// — different FOVs, rotations, and noise levels.
#[test]
#[ignore]
fn test_simulate_many_conditions() {
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist", path.display());
        return;
    }

    let db = db::load_database(&path).expect("load db");

    struct TestCase {
        label: &'static str,
        ra_deg: f64,
        dec_deg: f64,
        fov_deg: f64,
        roll_deg: f64,
        max_sources: usize,
        noise_px: f64,
        min_matched: u32,
    }

    let cases = vec![
        // ── Orion region, 15° FOV, varied rotations ──
        TestCase { label: "orion_15deg_r0",   ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 0.0,   max_sources: 20, noise_px: 0.0, min_matched: 6 },
        TestCase { label: "orion_15deg_r45",  ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 45.0,  max_sources: 20, noise_px: 0.0, min_matched: 6 },
        TestCase { label: "orion_15deg_r90",  ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 90.0,  max_sources: 20, noise_px: 0.0, min_matched: 6 },
        TestCase { label: "orion_15deg_r135", ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 135.0, max_sources: 20, noise_px: 0.0, min_matched: 6 },
        // ── Different FOVs ──
        TestCase { label: "orion_12deg_r30",  ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 12.0, roll_deg: 30.0,  max_sources: 25, noise_px: 0.0, min_matched: 6 },
        TestCase { label: "orion_25deg_r30",  ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 25.0, roll_deg: 30.0,  max_sources: 30, noise_px: 0.0, min_matched: 6 },
        // ── Different sky regions ──
        TestCase { label: "big_dipper",       ra_deg: 165.0, dec_deg: 55.0, fov_deg: 15.0, roll_deg: 20.0,  max_sources: 20, noise_px: 0.0, min_matched: 6 },
        TestCase { label: "scorpius",         ra_deg: 245.0, dec_deg: -25.0, fov_deg: 15.0, roll_deg: 20.0,  max_sources: 20, noise_px: 0.0, min_matched: 6 },
        // ── With noise ──
        TestCase { label: "orion_15deg_n1",   ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 10.0,  max_sources: 20, noise_px: 1.0, min_matched: 6 },
        TestCase { label: "orion_15deg_n2",   ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 10.0,  max_sources: 20, noise_px: 2.0, min_matched: 5 },
        // ── Higher star density ──
        TestCase { label: "orion_15deg_30s",  ra_deg: 83.0, dec_deg: -5.0,  fov_deg: 15.0, roll_deg: 10.0,  max_sources: 30, noise_px: 0.0, min_matched: 8 },
    ];

    let mut passed = 0u32;
    let mut failed = 0u32;

    for tc in &cases {
        eprintln!("\n── {} ──", tc.label);
        let (sources, true_ra, true_dec, _fov, _roll) = build_synthetic_sources(
            &db, tc.ra_deg, tc.dec_deg, tc.fov_deg, 1600, 1200, tc.roll_deg, tc.max_sources, tc.noise_px,
        );
        eprintln!("  sources: {}", sources.len());

        let req = SolveSourcesRequest {
            sources,
            image_width_px: 1600,
            image_height_px: 1200,
            fov_estimate_deg: Some(tc.fov_deg as f32),
            fov_max_error_deg: None,
            database_path: path.to_string_lossy().to_string(),
            solve_timeout_ms: Some(120_000.0),
        };

        let result = solve_sources(&req);
        for line in &result.log {
            eprintln!("    {}", line);
        }

        if !result.success {
            eprintln!("  FAIL: solve returned failure");
            failed += 1;
            continue;
        }

        let ra = result.ra_deg.unwrap();
        let dec = result.dec_deg.unwrap();
        let ra_err = (ra - true_ra).abs().min((ra + 360.0 - true_ra).abs());
        let dec_err = (dec - true_dec).abs();

        let ra_ok = ra_err < 3.0;
        let dec_ok = dec_err < 3.0;
        let matched_ok = result.matched_stars >= tc.min_matched;

        eprintln!("  RA={:.4}° (err={:.3}°) Dec={:.4}° (err={:.3}°) matched={}",
            ra, ra_err, dec, dec_err, result.matched_stars);

        if ra_ok && dec_ok && matched_ok {
            passed += 1;
            eprintln!("  PASS");
        } else {
            failed += 1;
            eprintln!("  FAIL: ra_ok={ra_ok} dec_ok={dec_ok} matched_ok={matched_ok}");
        }
    }

    eprintln!("\n═══════════════════════");
    eprintln!("Sweep results: {} passed, {} failed (of {} cases)", passed, failed, cases.len());
    assert_eq!(failed, 0, "{} simulation cases failed", failed);
}

#[test]
#[ignore]
fn test_hash_lookup_finds_correct_pattern() {
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist", path.display());
        return;
    }

    let db = db::load_database(&path).expect("load db");
    let index = HashIndex::build(&db);
    eprintln!("hash index: {} patterns, bin_size={:.4}", index.total_patterns(), index.bin_size);

    let mut found_pattern = None;
    for (i, pat) in db.patterns.iter().enumerate() {
        if pat.star_indices.iter().all(|&s| s != 0) {
            found_pattern = Some(i);
            break;
        }
    }
    let pat_idx = found_pattern.expect("no nonzero pattern found");
    let pattern = &db.patterns[pat_idx];
    eprintln!("test pattern {}: stars {:?}", pat_idx, pattern.star_indices);

    let quad = [
        Vec3::new(db.stars[pattern.star_indices[0] as usize].x_unit as f64,
                  db.stars[pattern.star_indices[0] as usize].y_unit as f64,
                  db.stars[pattern.star_indices[0] as usize].z_unit as f64),
        Vec3::new(db.stars[pattern.star_indices[1] as usize].x_unit as f64,
                  db.stars[pattern.star_indices[1] as usize].y_unit as f64,
                  db.stars[pattern.star_indices[1] as usize].z_unit as f64),
        Vec3::new(db.stars[pattern.star_indices[2] as usize].x_unit as f64,
                  db.stars[pattern.star_indices[2] as usize].y_unit as f64,
                  db.stars[pattern.star_indices[2] as usize].z_unit as f64),
        Vec3::new(db.stars[pattern.star_indices[3] as usize].x_unit as f64,
                  db.stars[pattern.star_indices[3] as usize].y_unit as f64,
                  db.stars[pattern.star_indices[3] as usize].z_unit as f64),
    ];

    let dmat = ad_astra_solver::hash::dist_matrix_3d(&quad);
    let hash_result = ad_astra_solver::hash::compute_quad_hash(&dmat, index.bin_size)
        .expect("compute hash for real pattern");
    eprintln!("pattern hash: {:?}", hash_result.key);

    let direct_hits = index.get(&hash_result.key);
    eprintln!("direct hits for this hash: {}", direct_hits.len());
    assert!(!direct_hits.is_empty(), "hash index should find the pattern");

    let neighbor_hits = index.get_with_neighbors(&hash_result.key, 1);
    eprintln!("neighbor hits: {}", neighbor_hits.len());
    let found_in_neighbors = neighbor_hits.iter().any(|(idx, _)| *idx as usize == pat_idx);
    assert!(found_in_neighbors, "pattern {} not found in neighbor search", pat_idx);
}

