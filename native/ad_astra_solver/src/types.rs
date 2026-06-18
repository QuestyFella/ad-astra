/// Image source (detected star centroid).
#[derive(Debug, Clone, PartialEq)]
pub struct ImageSource {
    pub x_px: f64,
    pub y_px: f64,
    pub flux: Option<f64>,
}

/// Request to solve from a list of detected centroids.
#[derive(Debug, Clone)]
pub struct SolveSourcesRequest {
    pub sources: Vec<ImageSource>,
    pub image_width_px: u32,
    pub image_height_px: u32,
    pub fov_estimate_deg: Option<f32>,
    pub fov_max_error_deg: Option<f32>,
    pub database_path: String,
    pub solve_timeout_ms: Option<f64>,
}

/// A detected star for overlay display.
#[derive(Debug, Clone, PartialEq)]
pub struct DetectedStar {
    pub x_px: f64,
    pub y_px: f64,
    pub brightness: f64,
}

/// A star matched between image and catalog.
#[derive(Debug, Clone, PartialEq)]
pub struct MatchedStarInfo {
    pub image_x: f64,
    pub image_y: f64,
    pub catalog_id: u32,
    pub ra_deg: f64,
    pub dec_deg: f64,
}

/// Result of a plate solve.
#[derive(Debug, Clone, PartialEq)]
pub struct SolveResult {
    pub success: bool,
    pub ra_deg: Option<f64>,
    pub dec_deg: Option<f64>,
    pub roll_deg: Option<f32>,
    pub fov_x_deg: Option<f32>,
    pub fov_y_deg: Option<f32>,
    pub pixel_scale_arcsec: Option<f32>,
    pub confidence: f32,
    pub matched_stars: u32,
    pub rms_error_arcsec: Option<f32>,
    pub solve_time_ms: u64,
    pub database_id: Option<String>,
    pub log: Vec<String>,
    pub detected_stars: Vec<DetectedStar>,
    pub matched_star_positions: Vec<MatchedStarInfo>,
}

impl SolveResult {
    pub fn failure(log: Vec<String>) -> Self {
        Self {
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
            solve_time_ms: 0,
            database_id: None,
            log,
            detected_stars: Vec::new(),
            matched_star_positions: Vec::new(),
        }
    }
}
