/**
 * WASM solver wrapper — loads the Rust plate solver compiled to WebAssembly.
 *
 * Usage:
 *   import { initSolver, solvePlate } from '../utils/solver';
 *   await initSolver();
 *   const result = solvePlate(imageWidth, imageHeight, detectedStars);
 */

let wasm: any = null;
let dbBytes: Uint8Array | null = null;
let isInitialized = false;

/**
 * Initialize the WASM solver.
 * Call this once at app startup.
 */
export async function initSolver(): Promise<void> {
  if (isInitialized) return;

  try {
    const wasmModule = await import("../wasm/ad_astra_solver_wasm.js");
    await wasmModule.default();
    wasm = wasmModule;
    isInitialized = true;
    console.log("WASM solver initialized");
  } catch (err) {
    console.error("Failed to init WASM solver:", err);
    throw err;
  }
}

/**
 * Set the database bytes (call before solving).
 * For development, you can load the .adb from a remote URL or bundled asset.
 */
export function setDatabase(bytes: Uint8Array): void {
  dbBytes = bytes;
  console.log(`Database loaded: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

/**
 * Check if the solver is ready (WASM loaded + database available).
 */
export function isSolverReady(): boolean {
  return isInitialized && wasm !== null && dbBytes !== null;
}

/**
 * Get the database size in bytes.
 */
export function getDatabaseSize(): number | null {
  return dbBytes?.length ?? null;
}

interface DetectedStar {
  x: number;
  y: number;
  flux: number;
}

interface PlateSolveResult {
  success: boolean;
  raDeg?: number;
  decDeg?: number;
  rollDeg?: number;
  fovXDeg?: number;
  fovYDeg?: number;
  pixelScaleArcsec?: number;
  confidence: number;
  matchedStars: number;
  rmsErrorArcsec?: number;
  solveTimeMs: number;
  log: string[];
}

/**
 * Solve a plate from detected star centroids.
 */
export function solvePlate(
  imageWidth: number,
  imageHeight: number,
  stars: DetectedStar[]
): PlateSolveResult {
  if (!isSolverReady()) {
    throw new Error("Solver not ready. Call initSolver() and setDatabase() first.");
  }

  const sources = stars.map((s) => ({
    x_px: s.x,
    y_px: s.y,
    flux: s.flux,
  }));

  const sourcesJson = JSON.stringify(sources);
  const resultJson = wasm.solve(dbBytes!, sourcesJson, imageWidth, imageHeight);
  const result = JSON.parse(resultJson);

  return {
    success: result.success,
    raDeg: result.ra_deg ?? undefined,
    decDeg: result.dec_deg ?? undefined,
    rollDeg: result.roll_deg ?? undefined,
    fovXDeg: result.fov_x_deg ?? undefined,
    fovYDeg: result.fov_y_deg ?? undefined,
    pixelScaleArcsec: result.pixel_scale_arcsec ?? undefined,
    confidence: result.confidence,
    matchedStars: result.matched_stars,
    rmsErrorArcsec: result.rms_error_arcsec ?? undefined,
    solveTimeMs: result.solve_time_ms,
    log: result.log || [],
  };
}
