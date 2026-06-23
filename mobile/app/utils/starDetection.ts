/**
 * Star detection and centroid extraction from astrophotography images.
 *
 * Algorithm:
 * 1. Resize image to manageable dimensions
 * 2. Convert to grayscale
 * 3. Estimate local background (box blur)
 * 4. Subtract background, threshold
 * 5. Find connected components (bright regions)
 * 6. Compute centroid and flux for each star
 * 7. Return sorted by brightness (brightest first)
 */

/**
 * Star detection and centroid extraction from astrophotography images.
 *
 * Algorithm:
 * 1. Resize image to manageable dimensions
 * 2. Convert to grayscale
 * 3. Estimate local background (box blur)
 * 4. Subtract background, threshold
 * 5. Find connected components (bright regions)
 * 6. Compute centroid and flux for each star
 * 7. Return sorted by brightness (brightest first)
 */

import UPNG from 'upng-js';

export interface DetectedStar {
  x: number;
  y: number;
  flux: number;
}

export interface StarDetectionOptions {
  /** Max dimension to resize to before processing */
  maxDimension?: number;
  /** Threshold above local background in sigma units */
  thresholdSigma?: number;
  /** Minimum star radius in pixels (filters hot pixels) */
  minRadiusPx?: number;
  /** Maximum star radius in pixels (filters saturated/blooming) */
  maxRadiusPx?: number;
  /** Minimum flux for a star to be considered */
  minFlux?: number;
  /** Maximum number of stars to return */
  maxStars?: number;
}

export const DEFAULT_OPTIONS: Required<StarDetectionOptions> = {
  maxDimension: 1024,
  thresholdSigma: 5.0,
  minRadiusPx: 1,
  maxRadiusPx: 50,
  minFlux: 100,
  maxStars: 50,
};

/**
 * Detect stars directly from RGBA pixel data (no image loading).
 * Each pixel is 4 values: R, G, B, A.
 */
export function detectStarsFromPixels(
  rgbaPixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: StarDetectionOptions = {}
): DetectedStar[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Convert to grayscale
  const grayscale = rgbaToGrayscale(rgbaPixels, width, height);

  // Estimate background with box blur
  const background = boxBlur(grayscale, width, height, 15);

  // Subtract background
  const subtracted = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    subtracted[i] = Math.max(0, grayscale[i] - background[i]);
  }

  // Compute noise level
  const noiseLevel = estimateNoise(subtracted);

  // Threshold
  const threshold = opts.thresholdSigma * noiseLevel;
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    binary[i] = subtracted[i] > threshold ? 1 : 0;
  }

  // Find connected components
  const stars = findConnectedComponents(
    binary,
    subtracted,
    width,
    height,
    opts.minRadiusPx,
    opts.maxRadiusPx,
    opts.minFlux
  );

  // Sort by flux (brightest first) and limit
  stars.sort((a, b) => b.flux - a.flux);
  return stars.slice(0, opts.maxStars).map((s) => ({
    x: s.x,
    y: s.y,
    flux: s.flux,
  }));
}

/**
 * Detect stars in an image URI — loads image, then delegates to detectStarsFromPixels.
 * Returns detected stars and the actual image dimensions after resize.
 */
export async function detectStars(
  imageUri: string,
  options: StarDetectionOptions = {}
): Promise<{ stars: DetectedStar[]; imageWidth: number; imageHeight: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const { base64, width, height } = await loadImagePixels(imageUri, opts.maxDimension);
  if (!base64) {
    throw new Error("Failed to load image pixels");
  }

  const { pixels, width: decodedWidth, height: decodedHeight } = decodePngBase64(base64);
  const stars = detectStarsFromPixels(pixels, decodedWidth, decodedHeight, options);
  return {
    stars,
    imageWidth: decodedWidth || width,
    imageHeight: decodedHeight || height,
  };
}

function decodePngBase64(
  base64: string
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const pngBytes = base64ToUint8(base64);
  const png = UPNG.decode(pngBytes.buffer as ArrayBuffer);
  const rgbaFrames = UPNG.toRGBA8(png);
  if (!rgbaFrames.length) {
    throw new Error("Failed to decode PNG image");
  }

  return {
    pixels: new Uint8ClampedArray(rgbaFrames[0]),
    width: png.width,
    height: png.height,
  };
}

function base64ToUint8(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Convert RGBA pixel array to grayscale float values. */
export function rgbaToGrayscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

async function loadImagePixels(
  uri: string,
  maxDimension: number
): Promise<{ base64: string | null; width: number; height: number }> {
  const ImageManipulator = await import("expo-image-manipulator");
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxDimension } }],
    { base64: true, format: ImageManipulator.SaveFormat.PNG }
  );

  return {
    base64: manipulated.base64 || null,
    width: manipulated.width,
    height: manipulated.height,
  };
}

function boxBlur(
  src: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const dst = new Float32Array(width * height);
  const temp = new Float32Array(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.max(0, Math.min(width - 1, x + dx));
        sum += src[y * width + px];
        count++;
      }
      temp[y * width + x] = sum / count;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const py = Math.max(0, Math.min(height - 1, y + dy));
        sum += temp[py * width + x];
        count++;
      }
      dst[y * width + x] = sum / count;
    }
  }

  return dst;
}

function estimateNoise(data: Float32Array): number {
  // Use median absolute deviation (MAD) as robust noise estimate
  // Sample every 10th pixel for speed
  const sample: number[] = [];
  for (let i = 0; i < data.length; i += 10) {
    if (data[i] > 0) {
      sample.push(data[i]);
    }
  }

  if (sample.length === 0) return 1.0;

  sample.sort((a, b) => a - b);
  const median = sample[Math.floor(sample.length / 2)];

  const deviations = sample.map((v) => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];

  // MAD * 1.4826 ≈ standard deviation for normal distribution
  return mad * 1.4826;
}

function findConnectedComponents(
  binary: Uint8Array,
  fluxImage: Float32Array,
  width: number,
  height: number,
  minRadiusPx: number,
  maxRadiusPx: number,
  minFlux: number
): Array<{ x: number; y: number; flux: number; radius: number }> {
  const visited = new Uint8Array(width * height);
  const stars: Array<{ x: number; y: number; flux: number; radius: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 0 || visited[idx]) continue;

      // Flood fill to find connected component
      const pixels: Array<{ x: number; y: number }> = [];
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited[idx] = 1;

      while (queue.length > 0) {
        const p = queue.pop()!;
        pixels.push(p);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = p.x + dx;
            const ny = p.y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nidx = ny * width + nx;
            if (binary[nidx] === 1 && !visited[nidx]) {
              visited[nidx] = 1;
              queue.push({ x: nx, y: ny });
            }
          }
        }
      }

      if (pixels.length < 3) continue; // Too small, likely noise

      // Compute centroid and flux
      let sumX = 0;
      let sumY = 0;
      let sumFlux = 0;
      let minX = width,
        maxX = 0,
        minY = height,
        maxY = 0;

      for (const p of pixels) {
        const flux = fluxImage[p.y * width + p.x];
        sumX += p.x * flux;
        sumY += p.y * flux;
        sumFlux += flux;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }

      if (sumFlux < minFlux) continue;

      const centroidX = sumX / sumFlux;
      const centroidY = sumY / sumFlux;
      const radius = Math.max(maxX - minX, maxY - minY) / 2;

      if (radius < minRadiusPx || radius > maxRadiusPx) continue;

      stars.push({
        x: centroidX,
        y: centroidY,
        flux: sumFlux,
        radius,
      });
    }
  }

  return stars;
}
