/**
 * Synthetic star field image generator for simulation testing.
 *
 * Renders Gaussian PSFs at known positions into a pixel grid.
 * Used to verify star detection accuracy against ground truth.
 */

import { detectStarsFromPixels, DetectedStar, StarDetectionOptions } from "./starDetection";

export interface SyntheticStar {
  /** Ground-truth pixel X coordinate */
  x: number;
  /** Ground-truth pixel Y coordinate */
  y: number;
  /** Peak brightness (0-255) */
  flux: number;
  /** Gaussian sigma in pixels (PSF width) */
  sigma: number;
}

export interface SyntheticFieldOptions {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Background offset (0-255) */
  background: number;
  /** Background Gaussian noise sigma */
  noiseSigma: number;
  /** Stars to render */
  stars: SyntheticStar[];
}

export interface DetectionTestResult {
  /** True stars rendered */
  trueStars: SyntheticStar[];
  /** Detected stars */
  detectedStars: DetectedStar[];
  /** Matches between true and detected (closest within radius) */
  matches: Array<{
    trueStar: SyntheticStar;
    detectedStar: DetectedStar;
    errorPx: number;
  }>;
  /** True stars not detected */
  missed: SyntheticStar[];
  /** Detected stars not close to any true star (false positives) */
  falsePositives: DetectedStar[];
  /** Mean centroid error in pixels for matched stars */
  meanErrorPx: number;
  /** Max centroid error */
  maxErrorPx: number;
  /** Match rate (matched / true_stars) */
  matchRate: number;
}

function gaussian(x: number, sigma: number): number {
  return Math.exp(-0.5 * (x / sigma) * (x / sigma));
}

/**
 * Render synthetic stars into an RGBA pixel array.
 * Each star is rendered as a 2D Gaussian PSF.
 */
export function renderSyntheticField(options: SyntheticFieldOptions): {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const { width, height, background, noiseSigma, stars } = options;
  const size = width * height * 4;
  const rgba = new Uint8ClampedArray(size);

  // Fill background with noise
  for (let i = 0; i < width * height; i++) {
    const noise = gaussianRandom() * noiseSigma;
    const value = Math.max(0, Math.min(255, Math.round(background + noise)));
    rgba[i * 4] = value;     // R
    rgba[i * 4 + 1] = value; // G
    rgba[i * 4 + 2] = value; // B
    rgba[i * 4 + 3] = 255;   // A
  }

  // Render each star as a Gaussian PSF
  for (const star of stars) {
    // Render within 3-sigma radius for performance
    const radius = Math.ceil(star.sigma * 3);
    const x0 = Math.max(0, Math.floor(star.x - radius));
    const x1 = Math.min(width - 1, Math.ceil(star.x + radius));
    const y0 = Math.max(0, Math.floor(star.y - radius));
    const y1 = Math.min(height - 1, Math.ceil(star.y + radius));

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - star.x;
        const dy = py - star.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        const g = gaussian(r, star.sigma);
        const add = Math.round(star.flux * g);
        const idx = (py * width + px) * 4;
        const newVal = Math.min(255, rgba[idx] + add);
        rgba[idx] = newVal;
        rgba[idx + 1] = newVal;
        rgba[idx + 2] = newVal;
      }
    }
  }

  return { rgba, width, height };
}

let gaussianZ2 = 0;
let gaussianHave = false;

function gaussianRandom(): number {
  if (gaussianHave) {
    gaussianHave = false;
    return gaussianZ2;
  }
  let u1: number, u2: number;
  do {
    u1 = Math.random() * 2 - 1;
    u2 = Math.random() * 2 - 1;
  } while (u1 * u1 + u2 * u2 >= 1 || (u1 === 0 && u2 === 0));
  const r = Math.sqrt(-2 * Math.log(u1 * u1 + u2 * u2) / (u1 * u1 + u2 * u2));
  gaussianZ2 = u2 * r;
  gaussianHave = true;
  return u1 * r;
}

/**
 * Run a detection test on a synthetic field and return results.
 */
export function runDetectionTest(
  options: SyntheticFieldOptions,
  detectionOptions: StarDetectionOptions = {}
): DetectionTestResult {
  const { rgba, width, height } = renderSyntheticField(options);
  const detected = detectStarsFromPixels(rgba, width, height, detectionOptions);

  // Match each detected star to the closest true star within maxError
  const maxError = 3; // pixels
  const matchedTrueIdx = new Set<number>();
  const matches: DetectionTestResult["matches"] = [];

  for (const det of detected) {
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < options.stars.length; i++) {
      if (matchedTrueIdx.has(i)) continue;
      const dx = det.x - options.stars[i].x;
      const dy = det.y - options.stars[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestDist <= maxError && bestIdx >= 0) {
      matches.push({
        trueStar: options.stars[bestIdx],
        detectedStar: det,
        errorPx: bestDist,
      });
      matchedTrueIdx.add(bestIdx);
    }
  }

  // Collect missed and false positives
  const missed: SyntheticStar[] = [];
  for (let i = 0; i < options.stars.length; i++) {
    if (!matchedTrueIdx.has(i)) {
      missed.push(options.stars[i]);
    }
  }

  const matchedDetectedIdx = new Set(matches.map((m) => m.detectedStar));
  const falsePositives = detected.filter(
    (d) => !matchedDetectedIdx.has(d)
  );

  const meanErrorPx =
    matches.length > 0
      ? matches.reduce((sum, m) => sum + m.errorPx, 0) / matches.length
      : Infinity;

  const maxErrorPx =
    matches.length > 0
      ? Math.max(...matches.map((m) => m.errorPx))
      : Infinity;

  return {
    trueStars: options.stars,
    detectedStars: detected,
    matches,
    missed,
    falsePositives,
    meanErrorPx,
    maxErrorPx,
    matchRate: options.stars.length > 0 ? matches.length / options.stars.length : 0,
  };
}

/**
 * Generate random star positions for a synthetic field.
 */
export function generateRandomStars(
  count: number,
  width: number,
  height: number,
  minFlux: number = 50,
  maxFlux: number = 200,
  minSigma: number = 1.0,
  maxSigma: number = 2.5
): SyntheticStar[] {
  const stars: SyntheticStar[] = [];
  const margin = 20;
  for (let i = 0; i < count; i++) {
    stars.push({
      x: margin + Math.random() * (width - 2 * margin),
      y: margin + Math.random() * (height - 2 * margin),
      flux: minFlux + Math.random() * (maxFlux - minFlux),
      sigma: minSigma + Math.random() * (maxSigma - minSigma),
    });
  }
  return stars;
}
