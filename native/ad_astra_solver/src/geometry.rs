//! 3D vector operations, tangent-plane (gnomonic) projection, and
//! affine transform fitting used by the plate solver.

use std::f64::consts::PI;

/// A 3D unit vector on the celestial sphere.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub const ZERO: Vec3 = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Vec3 { x, y, z }
    }

    pub fn sub(self, other: Vec3) -> Vec3 {
        Vec3::new(self.x - other.x, self.y - other.y, self.z - other.z)
    }

    pub fn add(self, other: Vec3) -> Vec3 {
        Vec3::new(self.x + other.x, self.y + other.y, self.z + other.z)
    }

    pub fn scale(self, s: f64) -> Vec3 {
        Vec3::new(self.x * s, self.y * s, self.z * s)
    }

    pub fn dot(self, other: Vec3) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn cross(self, other: Vec3) -> Vec3 {
        Vec3::new(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )
    }

    pub fn norm_sq(self) -> f64 {
        self.x * self.x + self.y * self.y + self.z * self.z
    }

    pub fn norm(self) -> f64 {
        self.norm_sq().sqrt()
    }

    pub fn normalize(self) -> Vec3 {
        let n = self.norm();
        if n < 1e-15 {
            return self;
        }
        self.scale(1.0 / n)
    }
}

/// Chord (Euclidean) distance between two unit vectors.
pub fn chord_distance(a: Vec3, b: Vec3) -> f64 {
    a.sub(b).norm()
}

/// Convert a unit vector to equatorial coordinates in degrees.
pub fn unit_to_radec(v: Vec3) -> (f64, f64) {
    let dec = v.z.asin().to_degrees();
    let ra = v.y.atan2(v.x).to_degrees().rem_euclid(360.0);
    (ra, dec)
}

/// Convert equatorial coordinates (degrees) to a unit vector.
pub fn radec_to_unit(ra_deg: f64, dec_deg: f64) -> Vec3 {
    let ra = ra_deg * PI / 180.0;
    let dec = dec_deg * PI / 180.0;
    let cd = dec.cos();
    Vec3::new(cd * ra.cos(), cd * ra.sin(), dec.sin())
}

/// Tangent-plane (gnomonic) projection around a center point on the sphere.
pub struct TangentPlane {
    /// Center unit vector (tangent point).
    pub center: Vec3,
    /// First basis vector in the tangent plane.
    pub e1: Vec3,
    /// Second basis vector (center × e1, right-handed).
    pub e2: Vec3,
}

impl TangentPlane {
    /// Create a tangent plane at the given center point.
    ///
    /// The basis vectors are chosen so that the system is right-handed
    /// (e1 × e2 = center).
    pub fn at(center: Vec3) -> Self {
        let center = center.normalize();
        // Pick a reference direction that is not parallel to center.
        let ref_dir = if center.z.abs() < 0.9 {
            Vec3::new(0.0, 0.0, 1.0)
        } else {
            Vec3::new(1.0, 0.0, 0.0)
        };
        // e1 = project(ref_dir onto tangent plane), normalized.
        let e1 = ref_dir.sub(center.scale(center.dot(ref_dir))).normalize();
        let e2 = center.cross(e1).normalize();
        TangentPlane { center, e1, e2 }
    }

    /// Forward gnomonic projection: unit vector → tangent-plane coords.
    ///
    /// Returns `None` if the point is on or behind the tangent plane.
    pub fn project(&self, v: Vec3) -> Option<(f64, f64)> {
        let cos_ang = v.dot(self.center);
        if cos_ang <= 1e-9 {
            return None;
        }
        let xi = v.dot(self.e1) / cos_ang;
        let eta = v.dot(self.e2) / cos_ang;
        Some((xi, eta))
    }

    /// Inverse gnomonic projection: tangent-plane coords → unit vector.
    pub fn unproject(&self, xi: f64, eta: f64) -> Vec3 {
        self.center
            .add(self.e1.scale(xi))
            .add(self.e2.scale(eta))
            .normalize()
    }
}

/// A 2D affine transformation: `dst = A * src + t`.
///
/// Maps `(x, y)` → `(a*x + b*y + tx, c*x + d*y + ty)`.
#[derive(Clone, Copy, Debug)]
pub struct Affine2D {
    pub a: f64,
    pub b: f64,
    pub tx: f64,
    pub c: f64,
    pub d: f64,
    pub ty: f64,
}

impl Affine2D {
    /// Identity transform.
    pub const IDENTITY: Affine2D = Affine2D {
        a: 1.0,
        b: 0.0,
        tx: 0.0,
        c: 0.0,
        d: 1.0,
        ty: 0.0,
    };

    /// Fit an affine transform from `src` → `dst` using least squares.
    ///
    /// Requires at least 3 non-degenerate point correspondences.
    pub fn fit(src: &[(f64, f64)], dst: &[(f64, f64)]) -> Option<Affine2D> {
        let n = src.len();
        if n < 3 || dst.len() < n {
            return None;
        }

        // Normal equations: A^T A x = A^T b
        // Design matrix rows: [x, y, 1] for each point.
        // Solve two independent 3x3 systems (one for dst_x, one for dst_y).

        // accumulate sums
        let (mut sxx, mut sxy, mut sx, mut syy, mut sy, mut s1) =
            (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let (mut tx_sxx, mut tx_sxy, mut tx_sx) = (0.0, 0.0, 0.0);
        let (mut ty_sxy, mut ty_syy, mut ty_sy) = (0.0, 0.0, 0.0);

        for i in 0..n {
            let (x, y) = src[i];
            let (dx, dy) = dst[i];
            sxx += x * x;
            sxy += x * y;
            sx += x;
            syy += y * y;
            sy += y;
            s1 += 1.0;
            tx_sxx += x * dx;
            tx_sxy += y * dx;
            tx_sx += dx;
            ty_sxy += x * dy;
            ty_syy += y * dy;
            ty_sy += dy;
        }

        // 3x3 normal matrix:
        // [ sxx  sxy  sx ]
        // [ sxy  syy  sy ]
        // [ sx   sy   s1 ]
        let normal = [
            [sxx, sxy, sx],
            [sxy, syy, sy],
            [sx, sy, s1],
        ];
        let rhs_x = [tx_sxx, tx_sxy, tx_sx];
        let rhs_y = [ty_sxy, ty_syy, ty_sy];

        let sol = solve_3x3(&normal, &rhs_x, &rhs_y)?;
        let [a, b, tx] = sol.0;
        let [c, d, ty] = sol.1;

        Some(Affine2D { a, b, tx, c, d, ty })
    }

    /// Apply the transform to a point.
    pub fn apply(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.a * x + self.b * y + self.tx,
            self.c * x + self.d * y + self.ty,
        )
    }

    /// Uniform scale factor (pixels per tangent-plane-radian).
    pub fn scale(&self) -> f64 {
        // The magnitude of the column vector (a, c).
        (self.a * self.a + self.c * self.c).sqrt()
    }

    /// Rotation angle in degrees.
    pub fn rotation_deg(&self) -> f64 {
        self.c.atan2(self.a).to_degrees()
    }

    /// Determinant of the linear part — negative indicates a reflection.
    pub fn determinant(&self) -> f64 {
        self.a * self.d - self.b * self.c
    }
}

/// Solve two 3×3 linear systems sharing the same matrix.
///
/// Returns `(solution_x, solution_y)` or `None` if the matrix is singular.
fn solve_3x3(m: &[[f64; 3]; 3], x: &[f64; 3], y: &[f64; 3]) -> Option<([f64; 3], [f64; 3])> {
    // Cramer's rule.
    let m00 = m[0][0];
    let m01 = m[0][1];
    let m02 = m[0][2];
    let m10 = m[1][0];
    let m11 = m[1][1];
    let m12 = m[1][2];
    let m20 = m[2][0];
    let m21 = m[2][1];
    let m22 = m[2][2];

    let det = m00 * (m11 * m22 - m12 * m21)
        - m01 * (m10 * m22 - m12 * m20)
        + m02 * (m10 * m21 - m11 * m20);

    if det.abs() < 1e-18 {
        return None;
    }

    let inv_det = 1.0 / det;

    // Adjugate matrix.
    let a00 = m11 * m22 - m12 * m21;
    let a01 = -(m01 * m22 - m02 * m21);
    let a02 = m01 * m12 - m02 * m11;
    let a10 = -(m10 * m22 - m12 * m20);
    let a11 = m00 * m22 - m02 * m20;
    let a12 = -(m00 * m12 - m02 * m10);
    let a20 = m10 * m21 - m11 * m20;
    let a21 = -(m00 * m21 - m01 * m20);
    let a22 = m00 * m11 - m01 * m10;

    let sx0 = (a00 * x[0] + a01 * x[1] + a02 * x[2]) * inv_det;
    let sx1 = (a10 * x[0] + a11 * x[1] + a12 * x[2]) * inv_det;
    let sx2 = (a20 * x[0] + a21 * x[1] + a22 * x[2]) * inv_det;

    let sy0 = (a00 * y[0] + a01 * y[1] + a02 * y[2]) * inv_det;
    let sy1 = (a10 * y[0] + a11 * y[1] + a12 * y[2]) * inv_det;
    let sy2 = (a20 * y[0] + a21 * y[1] + a22 * y[2]) * inv_det;

    Some(([sx0, sx1, sx2], [sy0, sy1, sy2]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vec3_basic() {
        let a = Vec3::new(1.0, 2.0, 3.0);
        let b = Vec3::new(4.0, 5.0, 6.0);
        assert!((a.add(b).x - 5.0).abs() < 1e-12);
        assert!((a.dot(b) - 32.0).abs() < 1e-12);
        assert!((a.norm() - 14.0_f64.sqrt()).abs() < 1e-12);
    }

    #[test]
    fn test_radec_roundtrip() {
        let (ra, dec) = (123.456, -12.34);
        let v = radec_to_unit(ra, dec);
        let (ra2, dec2) = unit_to_radec(v);
        assert!((ra - ra2).abs() < 1e-6, "RA mismatch: {} vs {}", ra, ra2);
        assert!((dec - dec2).abs() < 1e-6, "Dec mismatch: {} vs {}", dec, dec2);
    }

    #[test]
    fn test_tangent_plane_roundtrip() {
        let center = radec_to_unit(45.0, 30.0);
        let tp = TangentPlane::at(center);

        let star = radec_to_unit(46.0, 31.0);
        let (xi, eta) = tp.project(star).unwrap();
        let back = tp.unproject(xi, eta);
        let (ra1, dec1) = unit_to_radec(star);
        let (ra2, dec2) = unit_to_radec(back);
        assert!((ra1 - ra2).abs() < 1e-6);
        assert!((dec1 - dec2).abs() < 1e-6);
    }

    #[test]
    fn test_tangent_plane_behind() {
        let center = radec_to_unit(0.0, 0.0);
        let tp = TangentPlane::at(center);
        let behind = radec_to_unit(180.0, 0.0);
        assert!(tp.project(behind).is_none());
    }

    #[test]
    fn test_affine_identity_fit() {
        let src = vec![(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)];
        let dst = src.clone();
        let aff = Affine2D::fit(&src, &dst).unwrap();
        assert!((aff.a - 1.0).abs() < 1e-9);
        assert!((aff.d - 1.0).abs() < 1e-9);
        assert!(aff.b.abs() < 1e-9);
        assert!(aff.c.abs() < 1e-9);
        assert!(aff.tx.abs() < 1e-9);
        assert!(aff.ty.abs() < 1e-9);
    }

    #[test]
    fn test_affine_scale_rotation() {
        // src = unit square; dst = scaled 2x and rotated 30°.
        let theta = 30.0_f64.to_radians();
        let s = 2.0;
        let ct = theta.cos();
        let st = theta.sin();
        let transform = |x: f64, y: f64| -> (f64, f64) {
            (s * (ct * x - st * y) + 5.0, s * (st * x + ct * y) + 3.0)
        };
        let src: Vec<(f64, f64)> = vec![(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (2.0, 3.0)];
        let dst: Vec<(f64, f64)> = src.iter().map(|&(x, y)| transform(x, y)).collect();
        let aff = Affine2D::fit(&src, &dst).unwrap();
        assert!((aff.scale() - s).abs() < 1e-9, "scale: {}", aff.scale());
        let rot = aff.rotation_deg();
        assert!((rot - 30.0).abs() < 1e-6, "rotation: {}", rot);
        let (tx, ty) = aff.apply(0.0, 0.0);
        assert!((tx - 5.0).abs() < 1e-9, "tx: {}", tx);
        assert!((ty - 3.0).abs() < 1e-9, "ty: {}", ty);
    }

    #[test]
    fn test_affine_degenerate() {
        // Collinear points — should fail.
        let src = vec![(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)];
        let dst = vec![(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)];
        assert!(Affine2D::fit(&src, &dst).is_none());
    }

    #[test]
    fn test_chord_distance() {
        let a = Vec3::new(1.0, 0.0, 0.0);
        let b = Vec3::new(0.0, 1.0, 0.0);
        assert!((chord_distance(a, b) - 2.0_f64.sqrt()).abs() < 1e-12);
        assert!(chord_distance(a, a).abs() < 1e-12);
    }
}
