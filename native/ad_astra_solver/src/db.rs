use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use crate::error::SolverError;
use crate::hash::HashIndex;

pub const MAGIC: [u8; 4] = *b"ADB\0";
pub const HEADER_SIZE: usize = 64;
pub const STAR_SIZE: usize = 28;
pub const PATTERN_SIZE: usize = 8;

/// Parsed .adb file header.
#[derive(Debug, Clone, PartialEq)]
pub struct AdbHeader {
    pub version: u32,
    pub n_stars: u32,
    pub n_patterns: u32,
    pub min_fov_deg: f32,
    pub max_fov_deg: f32,
    pub max_mag: f32,
    pub epoch: u32,
    pub pattern_size: u32,
    pub pattern_bins: u32,
}

/// A single star record from the .adb file.
#[derive(Debug, Clone, PartialEq)]
pub struct StarRecord {
    pub catalog_id: u32,
    pub ra_rad: f32,
    pub dec_rad: f32,
    pub x_unit: f32,
    pub y_unit: f32,
    pub z_unit: f32,
    pub mag: f32,
}

/// A single pattern record (4 star indices).
#[derive(Debug, Clone, PartialEq)]
pub struct PatternRecord {
    pub star_indices: [u16; 4],
}

/// Loaded .adb database.
#[derive(Debug, Clone)]
pub struct AdbDatabase {
    pub header: AdbHeader,
    pub stars: Vec<StarRecord>,
    pub patterns: Vec<PatternRecord>,
}

fn read_u32_le(buf: &[u8]) -> u32 {
    u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]])
}

fn read_f32_le(buf: &[u8]) -> f32 {
    f32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]])
}

fn read_u16_le(buf: &[u8]) -> u16 {
    u16::from_le_bytes([buf[0], buf[1]])
}

/// Parse an .adb header from the first 64 bytes.
pub fn parse_header(data: &[u8]) -> Result<AdbHeader, SolverError> {
    if data.len() < HEADER_SIZE {
        return Err(SolverError::Truncated {
            context: "header".into(),
        });
    }

    let magic: [u8; 4] = [data[0], data[1], data[2], data[3]];
    if magic != MAGIC {
        return Err(SolverError::BadMagic(magic));
    }

    let version = read_u32_le(&data[4..8]);
    if version != 1 {
        return Err(SolverError::UnsupportedVersion(version));
    }

    Ok(AdbHeader {
        version,
        n_stars: read_u32_le(&data[8..12]),
        n_patterns: read_u32_le(&data[12..16]),
        min_fov_deg: read_f32_le(&data[16..20]),
        max_fov_deg: read_f32_le(&data[20..24]),
        max_mag: read_f32_le(&data[24..28]),
        epoch: read_u32_le(&data[28..32]),
        pattern_size: read_u32_le(&data[32..36]),
        pattern_bins: read_u32_le(&data[36..40]),
    })
}

/// Parse a single star record at the given byte offset.
pub fn parse_star(data: &[u8]) -> StarRecord {
    StarRecord {
        catalog_id: read_u32_le(&data[0..4]),
        ra_rad: read_f32_le(&data[4..8]),
        dec_rad: read_f32_le(&data[8..12]),
        x_unit: read_f32_le(&data[12..16]),
        y_unit: read_f32_le(&data[16..20]),
        z_unit: read_f32_le(&data[20..24]),
        mag: read_f32_le(&data[24..28]),
    }
}

/// Parse a single pattern record at the given byte offset.
pub fn parse_pattern(data: &[u8]) -> PatternRecord {
    PatternRecord {
        star_indices: [
            read_u16_le(&data[0..2]),
            read_u16_le(&data[2..4]),
            read_u16_le(&data[4..6]),
            read_u16_le(&data[6..8]),
        ],
    }
}

/// Read only the header from an .adb file.
pub fn read_header(path: &Path) -> Result<AdbHeader, SolverError> {
    let mut file = File::open(path)?;
    let mut buf = vec![0u8; HEADER_SIZE];
    file.read_exact(&mut buf)?;
    parse_header(&buf)
}

/// Read a single star by index.
pub fn read_star(path: &Path, index: usize) -> Result<StarRecord, SolverError> {
    let header = read_header(path)?;
    if index >= header.n_stars as usize {
        return Err(SolverError::StarIndexOutOfRange {
            index,
            n_stars: header.n_stars as usize,
        });
    }
    let offset = HEADER_SIZE + index * STAR_SIZE;
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset as u64))?;
    let mut buf = vec![0u8; STAR_SIZE];
    file.read_exact(&mut buf)?;
    Ok(parse_star(&buf))
}

/// Read a single pattern by index.
pub fn read_pattern(path: &Path, index: usize) -> Result<PatternRecord, SolverError> {
    let header = read_header(path)?;
    if index >= header.n_patterns as usize {
        return Err(SolverError::PatternIndexOutOfRange {
            index,
            n_patterns: header.n_patterns as usize,
        });
    }
    let offset = HEADER_SIZE + header.n_stars as usize * STAR_SIZE + index * PATTERN_SIZE;
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset as u64))?;
    let mut buf = vec![0u8; PATTERN_SIZE];
    file.read_exact(&mut buf)?;
    Ok(parse_pattern(&buf))
}

/// Load the entire .adb database from bytes in memory.
pub fn load_database_from_bytes(data: &[u8]) -> Result<AdbDatabase, SolverError> {
    if data.len() < HEADER_SIZE {
        return Err(SolverError::Truncated {
            context: "header".into(),
        });
    }

    let header = parse_header(&data[..HEADER_SIZE])?;

    let n_stars = header.n_stars as usize;
    let n_patterns = header.n_patterns as usize;

    let star_offset = HEADER_SIZE;
    let star_bytes = n_stars * STAR_SIZE;
    if data.len() < star_offset + star_bytes {
        return Err(SolverError::Truncated {
            context: "star records".into(),
        });
    }

    let mut stars = Vec::with_capacity(n_stars);
    for i in 0..n_stars {
        let offset = star_offset + i * STAR_SIZE;
        stars.push(parse_star(&data[offset..offset + STAR_SIZE]));
    }

    let pattern_offset = star_offset + star_bytes;
    let pattern_bytes = n_patterns * PATTERN_SIZE;
    if data.len() < pattern_offset + pattern_bytes {
        return Err(SolverError::Truncated {
            context: "pattern records".into(),
        });
    }

    let mut patterns = Vec::with_capacity(n_patterns);
    for i in 0..n_patterns {
        let offset = pattern_offset + i * PATTERN_SIZE;
        patterns.push(parse_pattern(&data[offset..offset + PATTERN_SIZE]));
    }

    Ok(AdbDatabase {
        header,
        stars,
        patterns,
    })
}

/// Load the entire .adb database from a file path.
pub fn load_database(path: &Path) -> Result<AdbDatabase, SolverError> {
    let mut file = File::open(path)?;

    let mut header_buf = vec![0u8; HEADER_SIZE];
    file.read_exact(&mut header_buf)?;
    let header = parse_header(&header_buf)?;

    let n_stars = header.n_stars as usize;
    let n_patterns = header.n_patterns as usize;

    let star_bytes = n_stars * STAR_SIZE;
    let mut star_buf = vec![0u8; star_bytes];
    file.read_exact(&mut star_buf)?;

    let mut stars = Vec::with_capacity(n_stars);
    for i in 0..n_stars {
        let offset = i * STAR_SIZE;
        stars.push(parse_star(&star_buf[offset..offset + STAR_SIZE]));
    }

    let pattern_bytes = n_patterns * PATTERN_SIZE;
    let mut pattern_buf = vec![0u8; pattern_bytes];
    file.read_exact(&mut pattern_buf)?;

    let mut patterns = Vec::with_capacity(n_patterns);
    for i in 0..n_patterns {
        let offset = i * PATTERN_SIZE;
        patterns.push(parse_pattern(&pattern_buf[offset..offset + PATTERN_SIZE]));
    }

    Ok(AdbDatabase {
        header,
        stars,
        patterns,
    })
}

/// Database plus pre-built hash index for repeated solves.
#[derive(Debug, Clone)]
pub struct PreparedDatabase {
    pub db: AdbDatabase,
    pub hash_index: HashIndex,
}

impl PreparedDatabase {
    /// Build the hash index from an already-loaded database.
    pub fn from_database(db: AdbDatabase) -> Self {
        let hash_index = HashIndex::build(&db);
        Self { db, hash_index }
    }

    /// Load a database from disk and build its hash index once.
    pub fn load(path: &Path) -> Result<Self, SolverError> {
        let db = load_database(path)?;
        Ok(Self::from_database(db))
    }

    /// Parse database bytes and build its hash index once.
    pub fn from_bytes(data: &[u8]) -> Result<Self, SolverError> {
        let db = load_database_from_bytes(data)?;
        Ok(Self::from_database(db))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_header_bytes(
        n_stars: u32,
        n_patterns: u32,
        min_fov: f32,
        max_fov: f32,
    ) -> Vec<u8> {
        let mut buf = vec![0u8; HEADER_SIZE];
        buf[0..4].copy_from_slice(&MAGIC);
        buf[4..8].copy_from_slice(&1u32.to_le_bytes());
        buf[8..12].copy_from_slice(&n_stars.to_le_bytes());
        buf[12..16].copy_from_slice(&n_patterns.to_le_bytes());
        buf[16..20].copy_from_slice(&min_fov.to_le_bytes());
        buf[20..24].copy_from_slice(&max_fov.to_le_bytes());
        buf[24..28].copy_from_slice(&7.0f32.to_le_bytes());
        buf[28..32].copy_from_slice(&2000u32.to_le_bytes());
        buf[32..36].copy_from_slice(&4u32.to_le_bytes());
        buf[36..40].copy_from_slice(&50u32.to_le_bytes());
        buf
    }

    fn make_test_star_bytes(catalog_id: u32, ra: f32, dec: f32, mag: f32) -> Vec<u8> {
        let mut buf = vec![0u8; STAR_SIZE];
        buf[0..4].copy_from_slice(&catalog_id.to_le_bytes());
        buf[4..8].copy_from_slice(&ra.to_le_bytes());
        buf[8..12].copy_from_slice(&dec.to_le_bytes());
        buf[12..16].copy_from_slice(&0.5f32.to_le_bytes());
        buf[16..20].copy_from_slice(&0.3f32.to_le_bytes());
        buf[20..24].copy_from_slice(&0.8f32.to_le_bytes());
        buf[24..28].copy_from_slice(&mag.to_le_bytes());
        buf
    }

    fn make_test_pattern_bytes(s0: u16, s1: u16, s2: u16, s3: u16) -> Vec<u8> {
        let mut buf = vec![0u8; PATTERN_SIZE];
        buf[0..2].copy_from_slice(&s0.to_le_bytes());
        buf[2..4].copy_from_slice(&s1.to_le_bytes());
        buf[4..6].copy_from_slice(&s2.to_le_bytes());
        buf[6..8].copy_from_slice(&s3.to_le_bytes());
        buf
    }

    #[test]
    fn test_parse_valid_header() {
        let buf = make_test_header_bytes(8818, 12369092, 10.0, 30.0);
        let hdr = parse_header(&buf).unwrap();
        assert_eq!(hdr.version, 1);
        assert_eq!(hdr.n_stars, 8818);
        assert_eq!(hdr.n_patterns, 12369092);
        assert!((hdr.min_fov_deg - 10.0).abs() < 1e-6);
        assert!((hdr.max_fov_deg - 30.0).abs() < 1e-6);
        assert_eq!(hdr.epoch, 2000);
        assert_eq!(hdr.pattern_size, 4);
    }

    #[test]
    fn test_parse_bad_magic() {
        let mut buf = make_test_header_bytes(100, 500, 5.0, 50.0);
        buf[0..4].copy_from_slice(b"XXXX");
        let err = parse_header(&buf).unwrap_err();
        match err {
            SolverError::BadMagic(m) => assert_eq!(m, *b"XXXX"),
            _ => panic!("Expected BadMagic, got {:?}", err),
        }
    }

    #[test]
    fn test_parse_unsupported_version() {
        let mut buf = make_test_header_bytes(100, 500, 5.0, 50.0);
        buf[4..8].copy_from_slice(&99u32.to_le_bytes());
        let err = parse_header(&buf).unwrap_err();
        match err {
            SolverError::UnsupportedVersion(v) => assert_eq!(v, 99),
            _ => panic!("Expected UnsupportedVersion, got {:?}", err),
        }
    }

    #[test]
    fn test_parse_truncated_header() {
        let buf = vec![0u8; 32];
        let err = parse_header(&buf).unwrap_err();
        match err {
            SolverError::Truncated { .. } => {}
            _ => panic!("Expected Truncated, got {:?}", err),
        }
    }

    #[test]
    fn test_parse_star() {
        let buf = make_test_star_bytes(42, 1.5, -0.3, 6.5);
        let star = parse_star(&buf);
        assert_eq!(star.catalog_id, 42);
        assert!((star.ra_rad - 1.5).abs() < 1e-6);
        assert!((star.dec_rad - (-0.3)).abs() < 1e-6);
        assert!((star.mag - 6.5).abs() < 1e-6);
    }

    #[test]
    fn test_parse_pattern() {
        let buf = make_test_pattern_bytes(10, 20, 30, 40);
        let pat = parse_pattern(&buf);
        assert_eq!(pat.star_indices, [10, 20, 30, 40]);
    }

    #[test]
    fn test_read_write_roundtrip() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let n_stars = 3u32;
        let n_patterns = 2u32;

        let mut file = NamedTempFile::new().unwrap();
        file.write_all(&make_test_header_bytes(n_stars, n_patterns, 10.0, 30.0))
            .unwrap();
        file.write_all(&make_test_star_bytes(1001, 0.1, 0.2, 3.5))
            .unwrap();
        file.write_all(&make_test_star_bytes(1002, 0.3, 0.4, 4.0))
            .unwrap();
        file.write_all(&make_test_star_bytes(1003, 0.5, 0.6, 5.0))
            .unwrap();
        file.write_all(&make_test_pattern_bytes(0, 1, 2, 0))
            .unwrap();
        file.write_all(&make_test_pattern_bytes(1, 2, 0, 0))
            .unwrap();

        let path = file.path();

        let hdr = read_header(path).unwrap();
        assert_eq!(hdr.n_stars, 3);
        assert_eq!(hdr.n_patterns, 2);

        let s0 = read_star(path, 0).unwrap();
        assert_eq!(s0.catalog_id, 1001);

        let s2 = read_star(path, 2).unwrap();
        assert_eq!(s2.catalog_id, 1003);

        let p1 = read_pattern(path, 1).unwrap();
        assert_eq!(p1.star_indices, [1, 2, 0, 0]);

        let db = load_database(path).unwrap();
        assert_eq!(db.stars.len(), 3);
        assert_eq!(db.patterns.len(), 2);
        assert_eq!(db.stars[1].catalog_id, 1002);
    }

    #[test]
    fn test_star_index_out_of_range() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let mut file = NamedTempFile::new().unwrap();
        file.write_all(&make_test_header_bytes(2, 0, 10.0, 30.0))
            .unwrap();
        file.write_all(&make_test_star_bytes(1, 0.0, 0.0, 5.0))
            .unwrap();
        file.write_all(&make_test_star_bytes(2, 0.0, 0.0, 6.0))
            .unwrap();

        let err = read_star(file.path(), 5).unwrap_err();
        match err {
            SolverError::StarIndexOutOfRange { index, n_stars } => {
                assert_eq!(index, 5);
                assert_eq!(n_stars, 2);
            }
            _ => panic!("Expected StarIndexOutOfRange, got {:?}", err),
        }
    }
}
