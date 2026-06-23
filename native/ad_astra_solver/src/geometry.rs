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

/// Angular separation between two unit vectors, in degrees.
pub fn angular_separation_deg(a: Vec3, b: Vec3) -> f64 {
    a.dot(b).clamp(-1.0, 1.0).acos().to_degrees()
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

    /// Convert standard tangent-plane coords to catalog-matching coords.
    ///
    /// When `reflect_y` is true, η is negated to resolve the mirror-image
    /// ambiguity from the unsigned |η| in the quad hash.
    pub fn to_matching_coords(&self, xi: f64, eta: f64, reflect_y: bool) -> (f64, f64) {
        if reflect_y {
            (xi, -eta)
        } else {
            (xi, eta)
        }
    }

    /// Convert catalog-matching coords back to standard tangent-plane coords.
    pub fn from_matching_coords(&self, xi: f64, eta: f64, reflect_y: bool) -> (f64, f64) {
        self.to_matching_coords(xi, eta, reflect_y)
    }

    /// Forward projection into catalog-matching coords.
    pub fn project_matching(&self, v: Vec3, reflect_y: bool) -> Option<(f64, f64)> {
        self.project(v)
            .map(|(xi, eta)| self.to_matching_coords(xi, eta, reflect_y))
    }

    /// Inverse projection from catalog-matching coords.
    pub fn unproject_matching(&self, xi: f64, eta: f64, reflect_y: bool) -> Vec3 {
        let (xi, eta) = self.from_matching_coords(xi, eta, reflect_y);
        self.unproject(xi, eta)
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

/// A 2D transform with a radial quadratic term to model gnomonic
/// projection distortion:
///   `xi  = a*px + b*py + c  + d*((px-cx)² + (py-cy)²)`
///   `eta = e*px + f*py + g  + h*((px-cx)² + (py-cy)²)`
///
/// The radial term `((px-cx)² + (py-cy)²)` is centered at `(cx, cy)`
/// (typically the pixel centroid of the source stars) to keep the
/// quadratic basis well-conditioned.  This captures the dominant
/// third-order distortion of the tangent-plane projection, which a
/// pure affine cannot model.  At least 4 non-degenerate point
/// correspondences are required (8 parameters, 2 per point).
#[derive(Clone, Copy, Debug)]
pub struct RadialQuad2D {
    pub cx: f64, pub cy: f64,
    pub a: f64, pub b: f64, pub c: f64, pub d: f64,
    pub e: f64, pub f: f64, pub g: f64, pub h: f64,
}

impl RadialQuad2D {
    /// Fit from `src` → `dst` using least squares centered at `(cx, cy)`.
    /// Requires ≥ 4 points.
    pub fn fit(
        src: &[(f64, f64)],
        dst: &[(f64, f64)],
        cx: f64, cy: f64,
    ) -> Option<RadialQuad2D> {
        let n = src.len();
        if n < 4 || dst.len() < n {
            return None;
        }

        // Normal equations for [a, b, c, d] (xi) and [e, f, g, h] (eta).
        // Design row per point: [px, py, 1, r²] where r² = (px-cx)² + (py-cy)².
        let mut nm = [[0.0_f64; 4]; 4];
        let mut rhs_x = [0.0_f64; 4];
        let mut rhs_y = [0.0_f64; 4];

        for i in 0..n {
            let (px, py) = src[i];
            let (dx, dy) = dst[i];
            let r2 = (px - cx).powi(2) + (py - cy).powi(2);
            let row = [px, py, 1.0, r2];
            for j in 0..4 {
                for k in 0..4 {
                    nm[j][k] += row[j] * row[k];
                }
                rhs_x[j] += row[j] * dx;
                rhs_y[j] += row[j] * dy;
            }
        }

        let (sx, sy) = solve_4x4(&nm, &rhs_x, &rhs_y)?;
        Some(RadialQuad2D {
            cx, cy,
            a: sx[0], b: sx[1], c: sx[2], d: sx[3],
            e: sy[0], f: sy[1], g: sy[2], h: sy[3],
        })
    }

    /// Apply the transform to a point.
    pub fn apply(&self, px: f64, py: f64) -> (f64, f64) {
        let r2 = (px - self.cx).powi(2) + (py - self.cy).powi(2);
        (
            self.a * px + self.b * py + self.c + self.d * r2,
            self.e * px + self.f * py + self.g + self.h * r2,
        )
    }

    /// Extract the linear (affine) part for scale/rotation queries.
    pub fn affine_part(&self) -> Affine2D {
        Affine2D {
            a: self.a, b: self.b, tx: self.c,
            c: self.e, d: self.f, ty: self.g,
        }
    }

    /// Local pixel scales (tangent-plane radians per pixel) along X and Y axes.
    pub fn pixel_scales_at(&self, px: f64, py: f64) -> (f64, f64) {
        let dr2_dpx = 2.0 * (px - self.cx);
        let dr2_dpy = 2.0 * (py - self.cy);
        let dxi_dpx = self.a + self.d * dr2_dpx;
        let dxi_dpy = self.b + self.d * dr2_dpy;
        let deta_dpx = self.e + self.h * dr2_dpx;
        let deta_dpy = self.f + self.h * dr2_dpy;
        let scale_x = (dxi_dpx * dxi_dpx + deta_dpx * deta_dpx).sqrt();
        let scale_y = (dxi_dpy * dxi_dpy + deta_dpy * deta_dpy).sqrt();
        (scale_x, scale_y)
    }
}

/// Exact edge-to-edge angular FOV from a fitted image→tangent transform.
///
/// Transforms edge midpoints through `transform`, unprojects via `tp`, and
/// measures the angular span along each image axis. Returns `None` if any
/// edge point falls on or behind the tangent plane.
pub fn image_angular_fov_deg(
    transform: &RadialQuad2D,
    tp: &TangentPlane,
    width_px: u32,
    height_px: u32,
    reflect_y: bool,
) -> Option<(f64, f64)> {
    let w = width_px as f64;
    let h = height_px as f64;
    let mid_x = w / 2.0;
    let mid_y = h / 2.0;

    let to_sky = |px: f64, py: f64| -> Option<Vec3> {
        let (xi, eta) = transform.apply(px, py);
        let v = tp.unproject_matching(xi, eta, reflect_y);
        if v.dot(tp.center) <= 1e-9 {
            return None;
        }
        Some(v)
    };

    let left = to_sky(0.0, mid_y)?;
    let right = to_sky(w, mid_y)?;
    let top = to_sky(mid_x, 0.0)?;
    let bottom = to_sky(mid_x, h)?;

    let fov_x = angular_separation_deg(left, right);
    let fov_y = angular_separation_deg(top, bottom);
    Some((fov_x, fov_y))
}

/// Solve two 4×4 linear systems sharing the same matrix via Gaussian
/// elimination with partial pivoting.
fn solve_4x4(m: &[[f64; 4]; 4], x: &[f64; 4], y: &[f64; 4]) -> Option<([f64; 4], [f64; 4])> {
    let mut a = [[0.0_f64; 5]; 4]; // augmented matrix [m | x], solved twice
    let mut a_y = [[0.0_f64; 5]; 4];

    for i in 0..4 {
        for j in 0..4 {
            a[i][j] = m[i][j];
            a_y[i][j] = m[i][j];
        }
        a[i][4] = x[i];
        a_y[i][4] = y[i];
    }

    // Forward elimination with partial pivoting.
    for col in 0..4 {
        let mut pivot = col;
        for r in (col + 1)..4 {
            if a[r][col].abs() > a[pivot][col].abs() {
                pivot = r;
            }
        }
        if a[pivot][col].abs() < 1e-18 {
            return None;
        }
        if pivot != col {
            a.swap(pivot, col);
            a_y.swap(pivot, col);
        }
        let piv = a[col][col];
        let piv_y = a_y[col][col];
        for r in (col + 1)..4 {
            let factor = a[r][col] / piv;
            let factor_y = a_y[r][col] / piv_y;
            for c in col..5 {
                a[r][c] -= factor * a[col][c];
                a_y[r][c] -= factor_y * a_y[col][c];
            }
        }
    }

    // Back substitution.
    let mut sx = [0.0_f64; 4];
    let mut sy = [0.0_f64; 4];
    for i in (0..4).rev() {
        let mut sum_x = a[i][4];
        let mut sum_y = a_y[i][4];
        for j in (i + 1)..4 {
            sum_x -= a[i][j] * sx[j];
            sum_y -= a_y[i][j] * sy[j];
        }
        sx[i] = sum_x / a[i][i];
        sy[i] = sum_y / a_y[i][i];
    }

    Some((sx, sy))
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
    fn test_tangent_plane_matching_coords_reflect() {
        let center = radec_to_unit(45.5, 20.0);
        let tp = TangentPlane::at(center);
        let star = radec_to_unit(46.0, 20.5);

        let (xi, eta) = tp.project(star).unwrap();
        let (xi_m, eta_m) = tp.to_matching_coords(xi, eta, true);
        assert!((eta_m + eta).abs() < 1e-12);

        let recovered = tp.unproject_matching(xi_m, eta_m, true);
        let (ra1, dec1) = unit_to_radec(star);
        let (ra2, dec2) = unit_to_radec(recovered);
        assert!((ra1 - ra2).abs() < 1e-9);
        assert!((dec1 - dec2).abs() < 1e-9);
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
    fn test_radial_quad_anisotropic_pixel_scales() {
        let quad = RadialQuad2D {
            cx: 100.0,
            cy: 200.0,
            a: 0.002,
            b: 0.0,
            c: 0.0,
            d: 0.0,
            e: 0.0,
            f: 0.004,
            g: 0.0,
            h: 0.0,
        };
        let (scale_x, scale_y) = quad.pixel_scales_at(100.0, 200.0);
        assert!((scale_x - 0.002).abs() < 1e-12);
        assert!((scale_y - 0.004).abs() < 1e-12);
    }

    #[test]
    fn test_image_angular_fov_wide_field_anisotropic() {
        // Wide, anisotropic gnomonic field with 2:1 pixel aspect.
        let width = 2400.0;
        let height = 1200.0;
        let cx = width / 2.0;
        let cy = height / 2.0;

        let center = radec_to_unit(90.0, 35.0);
        let tp = TangentPlane::at(center);

        // Gnomonic tangent coords grow as tan(u·θ); edge half-angles set the field width.
        let half_x = 22.0_f64.to_radians();
        let half_y = 14.0_f64.to_radians();

        let gnomonic_coords = |px: f64, py: f64| -> (f64, f64) {
            let u = (px - cx) / cx;
            let v = (cy - py) / cy;
            ((u * half_x).tan(), (v * half_y).tan())
        };

        let (left_xi, _) = gnomonic_coords(0.0, cy);
        let (right_xi, _) = gnomonic_coords(width, cy);
        let (_, top_eta) = gnomonic_coords(cx, 0.0);
        let (_, bottom_eta) = gnomonic_coords(cx, height);
        let left_sky = tp.unproject(left_xi, 0.0);
        let right_sky = tp.unproject(right_xi, 0.0);
        let top_sky = tp.unproject(0.0, top_eta);
        let bottom_sky = tp.unproject(0.0, bottom_eta);
        let true_fov_x = angular_separation_deg(left_sky, right_sky);
        let true_fov_y = angular_separation_deg(top_sky, bottom_sky);

        // Build pixel↔tangent correspondences from the gnomonic mapping.
        let mut src = Vec::new();
        let mut dst = Vec::new();
        for iy in 0..=20 {
            for ix in 0..=20 {
                let px = ix as f64 / 20.0 * width;
                let py = iy as f64 / 20.0 * height;
                src.push((px, py));
                dst.push(gnomonic_coords(px, py));
            }
        }

        let quad = RadialQuad2D::fit(&src, &dst, cx, cy).expect("fit radial quad");

        let (fov_x, fov_y) = image_angular_fov_deg(&quad, &tp, width as u32, height as u32, false)
            .expect("angular FOV");

        assert!(
            (fov_x - true_fov_x).abs() < 1.0,
            "FOV x: expected {:.2}°, got {:.3}°",
            true_fov_x,
            fov_x
        );
        assert!(
            (fov_y - true_fov_y).abs() < 1.0,
            "FOV y: expected {:.2}°, got {:.3}°",
            true_fov_y,
            fov_y
        );
        assert!(
            (fov_x - fov_y).abs() > 8.0,
            "anisotropic axes should differ: {:.3} vs {:.3}",
            fov_x,
            fov_y
        );

        // Exact edge-to-edge measurement beats center-Jacobian × dimension.
        let (scale_x, scale_y) = quad.pixel_scales_at(cx, cy);
        let jacobian_fov_x = scale_x.to_degrees() * width;
        let jacobian_fov_y = scale_y.to_degrees() * height;
        let jacobian_err_x = (jacobian_fov_x - true_fov_x).abs();
        let jacobian_err_y = (jacobian_fov_y - true_fov_y).abs();
        let angular_err_x = (fov_x - true_fov_x).abs();
        let angular_err_y = (fov_y - true_fov_y).abs();
        assert!(
            angular_err_x < jacobian_err_x,
            "angular FOV x err {:.2}° should beat Jacobian err {:.2}° (true {:.2}°)",
            angular_err_x,
            jacobian_err_x,
            true_fov_x
        );
        assert!(
            angular_err_y < jacobian_err_y,
            "angular FOV y err {:.2}° should beat Jacobian err {:.2}° (true {:.2}°)",
            angular_err_y,
            jacobian_err_y,
            true_fov_y
        );
    }

    #[test]
    fn test_chord_distance() {
        let a = Vec3::new(1.0, 0.0, 0.0);
        let b = Vec3::new(0.0, 1.0, 0.0);
        assert!((chord_distance(a, b) - 2.0_f64.sqrt()).abs() < 1e-12);
        assert!(chord_distance(a, a).abs() < 1e-12);
    }
}
