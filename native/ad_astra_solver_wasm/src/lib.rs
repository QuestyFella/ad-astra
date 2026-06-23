use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex};

use wasm_bindgen::prelude::*;
use ad_astra_solver::{
    db::PreparedDatabase,
    solve_prepared,
    types::{SolveSourcesRequest, ImageSource},
};

// Use wee_alloc to avoid dlmalloc assertion failures with large WASM heaps
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

static DB_CACHE: Mutex<Option<(u64, usize, Arc<PreparedDatabase>)>> = Mutex::new(None);

fn db_bytes_hash(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

fn cached_prepared_database() -> Result<Arc<PreparedDatabase>, String> {
    let guard = DB_CACHE
        .lock()
        .map_err(|e| format!("Database cache lock error: {}", e))?;

    guard
        .as_ref()
        .map(|(_, _, prepared)| Arc::clone(prepared))
        .ok_or_else(|| "Database not prepared. Call prepare_database() first.".to_string())
}

fn prepared_database_for_bytes(db_bytes: &[u8]) -> Result<Arc<PreparedDatabase>, String> {
    let hash = db_bytes_hash(db_bytes);
    let byte_len = db_bytes.len();
    let mut guard = DB_CACHE
        .lock()
        .map_err(|e| format!("Database cache lock error: {}", e))?;

    if let Some((cached_hash, cached_len, prepared)) = guard.as_ref() {
        if *cached_hash == hash && *cached_len == byte_len {
            return Ok(Arc::clone(prepared));
        }
    }

    let prepared = Arc::new(
        PreparedDatabase::from_bytes(db_bytes)
            .map_err(|e| format!("Failed to parse database: {}", e))?,
    );
    *guard = Some((hash, byte_len, Arc::clone(&prepared)));
    Ok(prepared)
}

fn parse_solve_request(
    sources_json: &str,
    image_width_px: u32,
    image_height_px: u32,
) -> Result<SolveSourcesRequest, String> {
    if sources_json.trim_start().starts_with('[') {
        let sources: Vec<ImageSource> = serde_json::from_str(sources_json)
            .map_err(|e| format!("Failed to parse sources: {}", e))?;
        return Ok(SolveSourcesRequest {
            database_path: "memory".to_string(),
            sources,
            image_width_px,
            image_height_px,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            solve_timeout_ms: None,
        });
    }

    #[derive(serde::Deserialize)]
    struct PartialRequest {
        sources: Vec<ImageSource>,
        #[serde(default)]
        fov_estimate_deg: Option<f32>,
        #[serde(default)]
        fov_max_error_deg: Option<f32>,
        #[serde(default)]
        solve_timeout_ms: Option<f64>,
    }

    let partial: PartialRequest = serde_json::from_str(sources_json)
        .map_err(|e| format!("Failed to parse solve request: {}", e))?;

    Ok(SolveSourcesRequest {
        database_path: "memory".to_string(),
        sources: partial.sources,
        image_width_px,
        image_height_px,
        fov_estimate_deg: partial.fov_estimate_deg,
        fov_max_error_deg: partial.fov_max_error_deg,
        solve_timeout_ms: partial.solve_timeout_ms,
    })
}

fn solve_with_prepared(prepared: &PreparedDatabase, request: &SolveSourcesRequest) -> String {
    let result = solve_prepared(request, prepared, "memory");

    serde_json::to_string(&result).unwrap_or_else(|e| {
        serde_json::json!({
            "success": false,
            "log": [format!("Failed to serialize result: {}", e)]
        })
        .to_string()
    })
}

fn failure_json(message: impl AsRef<str>) -> String {
    serde_json::json!({
        "success": false,
        "log": [message.as_ref()]
    })
    .to_string()
}

/// Parse the database and build the hash index outside the solve timer.
///
/// Call this once after loading database bytes so `solve_loaded()` does not spend
/// the timeout budget on catalog preparation.
#[wasm_bindgen]
pub fn prepare_database(db_bytes: &[u8]) -> String {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    match prepared_database_for_bytes(db_bytes) {
        Ok(prepared) => serde_json::json!({
            "success": true,
            "stars": prepared.db.header.n_stars,
            "patterns": prepared.db.header.n_patterns,
        })
        .to_string(),
        Err(e) => failure_json(e),
    }
}

/// Solve using the database prepared by `prepare_database()`.
#[wasm_bindgen]
pub fn solve_loaded(sources_json: &str, image_width_px: u32, image_height_px: u32) -> String {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    let prepared = match cached_prepared_database() {
        Ok(prepared) => prepared,
        Err(e) => return failure_json(e),
    };

    let request = match parse_solve_request(sources_json, image_width_px, image_height_px) {
        Ok(request) => request,
        Err(e) => return failure_json(e),
    };

    solve_with_prepared(prepared.as_ref(), &request)
}

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

    let prepared = match prepared_database_for_bytes(db_bytes) {
        Ok(prepared) => prepared,
        Err(e) => return failure_json(e),
    };

    let request = match parse_solve_request(sources_json, image_width_px, image_height_px) {
        Ok(request) => request,
        Err(e) => return failure_json(e),
    };

    solve_with_prepared(prepared.as_ref(), &request)
}
