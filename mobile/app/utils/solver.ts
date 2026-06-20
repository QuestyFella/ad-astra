import { NativeModules, Platform } from 'react-native';

let wasm: any = null;
let dbBytes: Uint8Array | null = null;
let isWasmReady = false;
let isNativeReady = false;
let dbPath: string | null = null;

const NativeSolver = Platform.OS === 'android' ? NativeModules.AdAstraSolver : null;

/**
 * Initialize the solver — tries native Android module first, then WASM fallback.
 */
export async function initSolver(): Promise<void> {
  if (isNativeReady || isWasmReady) return;

  // Try native Android module first
  if (NativeSolver) {
    try {
      const result: string = await NativeSolver.ping();
      if (result.startsWith('ad_astra_native_ok')) {
        isNativeReady = true;
        console.log('Native solver initialized:', result);
        return;
      }
      console.warn('Native solver ping failed:', result);
    } catch (e: any) {
      console.log('Native solver not available:', e?.message ?? e);
    }
  }

  // Fall back to WASM
  try {
    const wasmModule = await import('../wasm/ad_astra_solver_wasm.js');
    await wasmModule.default();
    wasm = wasmModule;
    isWasmReady = true;
    console.log('WASM solver initialized');
  } catch (err) {
    console.error('Failed to init WASM solver:', err);
    throw err;
  }
}

export function isSolverReady(): boolean {
  return isNativeReady || (isWasmReady && wasm !== null && dbBytes !== null);
}

export function getDatabaseSize(): number | null {
  return dbBytes?.length ?? null;
}

export function setDatabase(bytes: Uint8Array): void {
  dbBytes = bytes;
  console.log(`Database loaded: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

export function setDatabasePath(path: string): void {
  dbPath = path;
  console.log(`Database path set: ${path}`);
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

function parseWasmResult(resultJson: string): PlateSolveResult {
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

function parseNativeResult(resultJson: string): PlateSolveResult {
  const result = JSON.parse(resultJson);
  if (!result.success) {
    return {
      success: false,
      confidence: 0,
      matchedStars: 0,
      solveTimeMs: 0,
      log: [result.error || 'Solve failed'],
    };
  }
  return {
    success: result.success,
    raDeg: result.ra_deg ?? undefined,
    decDeg: result.dec_deg ?? undefined,
    rollDeg: result.roll_deg ?? undefined,
    fovXDeg: result.fov_x_deg ?? undefined,
    fovYDeg: result.fov_y_deg ?? undefined,
    pixelScaleArcsec: result.pixel_scale_arcsec ?? undefined,
    confidence: result.confidence ?? 0,
    matchedStars: result.matched_stars ?? 0,
    rmsErrorArcsec: result.rms_error_arcsec ?? undefined,
    solveTimeMs: result.solve_time_ms ?? 0,
    log: result.log ?? [],
  };
}

export async function solvePlate(
  imageWidth: number,
  imageHeight: number,
  stars: DetectedStar[]
): Promise<PlateSolveResult> {
  // Native path (Android)
  if (isNativeReady && NativeSolver) {
    const sources = stars.map((s) => ({
      x_px: s.x,
      y_px: s.y,
      flux: s.flux,
    }));
    const sourcesJson = JSON.stringify(sources);
    const resultJson: string = await NativeSolver.solveSources(sourcesJson, imageWidth, imageHeight);
    return parseNativeResult(resultJson);
  }

  // WASM fallback
  if (!isWasmReady || !wasm || !dbBytes) {
    throw new Error('Solver not ready. Call initSolver() and setDatabase() first.');
  }

  const sources = stars.map((s) => ({
    x_px: s.x,
    y_px: s.y,
    flux: s.flux,
  }));

  const sourcesJson = JSON.stringify(sources);
  const resultJson = wasm.solve(dbBytes!, sourcesJson, imageWidth, imageHeight);
  return parseWasmResult(resultJson);
}
