use std::path::Path;
use std::time::Instant;

use crate::db;
use crate::types::{SolveResult, SolveSourcesRequest};

/// Solve from a list of detected image centroids.
///
/// Currently a scaffold: loads the database and returns metadata
/// without performing actual pattern matching.
pub fn solve_sources(request: &SolveSourcesRequest) -> SolveResult {
    let start = Instant::now();

    let path = Path::new(&request.database_path);

    let header = match db::read_header(path) {
        Ok(h) => h,
        Err(e) => {
            return SolveResult::failure(vec![format!("Failed to read database: {}", e)]);
        }
    };

    let db_id = Some(path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default());

    if request.sources.is_empty() {
        let elapsed = start.elapsed().as_millis() as u64;
        return SolveResult {
            success: false,
            ra_deg: None,
            dec_deg: None,
            roll_deg: None,
            fov_x_deg: None,
            fov_y_deg: None,
            pixel_scale_arcsec: None,
            confidence: 0.0,
            matched_stars: 0,
            rms_error_arcsec: None,
            solve_time_ms: elapsed,
            database_id: db_id,
            log: vec!["No sources provided.".into()],
        };
    }

    let elapsed = start.elapsed().as_millis() as u64;

    SolveResult {
        success: false,
        ra_deg: None,
        dec_deg: None,
        roll_deg: None,
        fov_x_deg: None,
        fov_y_deg: None,
        pixel_scale_arcsec: None,
        confidence: 0.0,
        matched_stars: 0,
        rms_error_arcsec: None,
        solve_time_ms: elapsed,
        database_id: db_id,
        log: vec![
            format!(
                "Native solver scaffold loaded DB: {} stars, {} patterns",
                header.n_stars, header.n_patterns
            ),
            format!(
                "FOV range: {:.1} - {:.1} deg, max mag: {:.1}",
                header.min_fov_deg, header.max_fov_deg, header.max_mag
            ),
            format!("Input: {} sources", request.sources.len()),
            "Matcher not implemented yet.".into(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ImageSource;
    use std::io::Write;

    fn make_test_db(dir: &std::path::Path) -> std::path::PathBuf {
        let path = dir.join("test.adb");
        let mut file = std::fs::File::create(&path).unwrap();

        let mut header = vec![0u8; 64];
        header[0..4].copy_from_slice(b"ADB\0");
        header[4..8].copy_from_slice(&1u32.to_le_bytes());
        header[8..12].copy_from_slice(&100u32.to_le_bytes());
        header[12..16].copy_from_slice(&500u32.to_le_bytes());
        header[16..20].copy_from_slice(&10.0f32.to_le_bytes());
        header[20..24].copy_from_slice(&30.0f32.to_le_bytes());
        header[24..28].copy_from_slice(&7.0f32.to_le_bytes());
        header[28..32].copy_from_slice(&2000u32.to_le_bytes());
        header[32..36].copy_from_slice(&4u32.to_le_bytes());
        header[36..40].copy_from_slice(&50u32.to_le_bytes());
        file.write_all(&header).unwrap();

        for i in 0..100u32 {
            let mut star = vec![0u8; 28];
            star[0..4].copy_from_slice(&(i + 1).to_le_bytes());
            star[4..8].copy_from_slice(&(i as f32 * 0.1).to_le_bytes());
            star[8..12].copy_from_slice(&(i as f32 * 0.05).to_le_bytes());
            star[24..28].copy_from_slice(&(5.0 + i as f32 * 0.01).to_le_bytes());
            file.write_all(&star).unwrap();
        }

        for i in 0..500u16 {
            let mut pat = vec![0u8; 8];
            pat[0..2].copy_from_slice(&(i % 100).to_le_bytes());
            pat[2..4].copy_from_slice(&((i + 1) % 100).to_le_bytes());
            pat[4..6].copy_from_slice(&((i + 2) % 100).to_le_bytes());
            pat[6..8].copy_from_slice(&((i + 3) % 100).to_le_bytes());
            file.write_all(&pat).unwrap();
        }

        path
    }

    #[test]
    fn test_solve_empty_sources() {
        let dir = tempfile::tempdir().unwrap();
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
        assert!(result.log[0].contains("No sources"));
    }

    #[test]
    fn test_solve_with_sources_returns_scaffold() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = make_test_db(dir.path());

        let req = SolveSourcesRequest {
            sources: vec![
                ImageSource { x_px: 100.0, y_px: 200.0, flux: Some(1.0) },
                ImageSource { x_px: 300.0, y_px: 400.0, flux: Some(0.8) },
            ],
            image_width_px: 1200,
            image_height_px: 1600,
            fov_estimate_deg: Some(15.0),
            fov_max_error_deg: None,
            database_path: db_path.to_string_lossy().to_string(),
            solve_timeout_ms: None,
        };

        let result = solve_sources(&req);
        assert!(!result.success);
        assert!(result.log.iter().any(|l| l.contains("100 stars")));
        assert!(result.log.iter().any(|l| l.contains("500 patterns")));
        assert!(result.log.iter().any(|l| l.contains("Matcher not implemented")));
        assert!(result.solve_time_ms < 1000);
        assert!(result.database_id.is_some());
    }

    #[test]
    fn test_solve_missing_database() {
        let req = SolveSourcesRequest {
            sources: vec![ImageSource { x_px: 100.0, y_px: 200.0, flux: None }],
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
}
