use thiserror::Error;

#[derive(Error, Debug)]
pub enum SolverError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid database: {0}")]
    InvalidDatabase(String),

    #[error("Bad magic bytes: expected ADB\\0, got {0:?}")]
    BadMagic([u8; 4]),

    #[error("Unsupported database version: {0}")]
    UnsupportedVersion(u32),

    #[error("Database file truncated at {context}")]
    Truncated { context: String },

    #[error("Star index {index} out of range (n_stars={n_stars})")]
    StarIndexOutOfRange { index: usize, n_stars: usize },

    #[error("Pattern index {index} out of range (n_patterns={n_patterns})")]
    PatternIndexOutOfRange { index: usize, n_patterns: usize },

    #[error("No sources provided")]
    NoSources,

    #[error("No database loaded")]
    NoDatabase,

    #[error("Solver error: {0}")]
    Solver(String),
}
