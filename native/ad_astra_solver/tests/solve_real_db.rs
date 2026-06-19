//! Integration test against the real `data/processed/default.adb` database.
//!
//! Marked `#[ignore]` so it does not run in CI / normal `cargo test`.  It
//! requires the database to have been built via `python scripts/build_adb.py`.
//!
//! Run with:
//!     cargo test --manifest-path native/ad_astra_solver/Cargo.toml \
//!         --test solve_real_db -- --ignored --nocapture

use std::path::PathBuf;
use std::time::Instant;

use ad_astra_solver::{
    db, geometry::{radec_to_unit, TangentPlane, Vec3}, hash::HashIndex,
    solve_sources, types::{ImageSource, SolveSourcesRequest},
};

fn db_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/processed/default.adb")
}

fn field_center() -> Vec3 {
    // Orion region — well-populated part of the Hipparcos catalog.
    radec_to_unit(83.0, -5.0)
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

    // Pixel scale: 0.015 deg/px → 15°×15° field, within the database FOV range.
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

    // Print the catalog indices to verify we have real stars.
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

#[test]
#[ignore]
fn test_hash_lookup_finds_correct_pattern() {
    // Build sources from 4 catalog stars that form a *real* pattern, then
    // check that the hash index returns that pattern as a candidate.
    let path = db_path();
    if !path.exists() {
        eprintln!("skipping: {} does not exist", path.display());
        return;
    }

    let db = db::load_database(&path).expect("load db");
    let index = HashIndex::build(&db);
    eprintln!("hash index: {} patterns, bin_size={:.4}", index.total_patterns(), index.bin_size);

    // Pick the first nonzero pattern and check it can be found.
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
