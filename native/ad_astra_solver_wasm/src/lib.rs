use wasm_bindgen::prelude::*;
use ad_astra_solver::{solve_sources_with_db, db, types::{SolveSourcesRequest, ImageSource}};

/// Solve from detected star centroids.
///
/// # Arguments
/// * `db_bytes` - The raw bytes of the .adb database file
/// * `sources_json` - JSON array of {x_px, y_px, flux} objects
/// * `image_width_px` - Image width in pixels
/// * `image_height_px` - Image height in pixels
///
/// # Returns
/// JSON string with the SolveResult
#[wasm_bindgen]
pub fn solve(db_bytes: &[u8], sources_json: &str, image_width_px: u32, image_height_px: u32) -> String {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    // Parse database
    let db = match db::load_database_from_bytes(db_bytes) {
        Ok(db) => db,
        Err(e) => {
            return serde_json::json!({
                "success": false,
                "log": [format!("Failed to parse database: {}", e)]
            }).to_string();
        }
    };

    // Parse sources
    let sources: Vec<ImageSource> = match serde_json::from_str(sources_json) {
        Ok(s) => s,
        Err(e) => {
            return serde_json::json!({
                "success": false,
                "log": [format!("Failed to parse sources: {}", e)]
            }).to_string();
        }
    };

    let request = SolveSourcesRequest {
        database_path: "memory".to_string(), // not used when db is pre-loaded
        sources,
        image_width_px,
        image_height_px,
        fov_estimate_deg: None,
        fov_max_error_deg: None,
        solve_timeout_ms: None,
    };

    let result = solve_sources_with_db(&request, db, "memory");
    
    serde_json::to_string(&result).unwrap_or_else(|e| {
        serde_json::json!({
            "success": false,
            "log": [format!("Failed to serialize result: {}", e)]
        }).to_string()
    })
}
