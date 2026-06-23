import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  loadBundledDatabasePath,
  loadDatabase,
} from './databaseLoader';
import { loadWasmModule } from '../wasm/loadWasm';
import {
  bumpWorkerGeneration,
  isWorkerGenerationCurrent,
  shouldResetWorkerOnAbort,
  withSolveTimeout,
  type WasmWorkerState,
} from './solverLifecycle';

let wasm: any = null;
let dbBytes: Uint8Array | null = null;
let isWasmReady = false;
let isWasmDatabasePrepared = false;
let isNativeReady = false;
let dbPath: string | null = null;
let activeWasmReject: ((reason: Error) => void) | null = null;
let persistentWasmWorker: Worker | null = null;
let wasmWorkerReadyPromise: Promise<void> | null = null;
let wasmWorkerReadyReject: ((reason: Error) => void) | null = null;
let wasmWorkerReadyDbLength: number | null = null;
let wasmWorkerGeneration = 0;
let wasmWorkerState: WasmWorkerState = 'none';
let nextWorkerSolveId = 0;
const pendingWorkerSolves = new Map<
  number,
  { resolve: (value: string) => void; reject: (reason: Error) => void }
>();

interface NativeSolverModule {
  ping(): Promise<string>;
  loadDatabase(path: string): Promise<string>;
  solveSources(sourcesJson: string, imageWidth: number, imageHeight: number): Promise<string>;
  cancelSolve(): Promise<string>;
}

const NativeSolver = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeSolverModule>('AdAstraSolver')
  : null;

const canUseWasmWorker = (): boolean =>
  Platform.OS === 'web' && typeof Worker !== 'undefined';

function rejectPendingWorkerSolves(reason: Error): void {
  for (const pending of pendingWorkerSolves.values()) {
    pending.reject(reason);
  }
  pendingWorkerSolves.clear();
}

function resetWasmWorker(reason?: Error): void {
  wasmWorkerGeneration = bumpWorkerGeneration(wasmWorkerGeneration);

  if (wasmWorkerReadyReject) {
    wasmWorkerReadyReject(reason ?? new Error('WASM worker reset'));
    wasmWorkerReadyReject = null;
  }

  if (persistentWasmWorker) {
    persistentWasmWorker.terminate();
    persistentWasmWorker = null;
  }
  wasmWorkerReadyPromise = null;
  wasmWorkerReadyDbLength = null;
  wasmWorkerState = 'none';
  isWasmDatabasePrepared = false;
}

/**
 * Abort an in-flight solve without tearing down a prepared worker.
 * Worker termination is reserved for init failure, database changes, and
 * cancellation while the catalog is still being prepared.
 */
function abortWasmWorkerSolve(reason: Error): void {
  rejectPendingWorkerSolves(reason);
  if (activeWasmReject) {
    activeWasmReject(reason);
    activeWasmReject = null;
  }
}

/**
 * Terminate an in-flight solve when possible.
 * Web WASM: rejects pending worker solves and tears down the persistent worker.
 * Android JNI: sets a cooperative cancel flag checked by the Rust solve loop.
 */
export function abortActiveSolve(): void {
  const reason = new Error('Solve aborted');
  abortWasmWorkerSolve(reason);

  if (shouldResetWorkerOnAbort(wasmWorkerState)) {
    resetWasmWorker(reason);
  }

  if (isNativeReady && NativeSolver?.cancelSolve) {
    NativeSolver.cancelSolve().catch(() => {});
  }
}

function prepareWasmDatabase(bytes: Uint8Array): void {
  if (!wasm || isWasmDatabasePrepared) return;

  const prepare = wasm.prepare_database ?? wasm.load_database;
  if (typeof prepare !== 'function') {
    isWasmDatabasePrepared = true;
    return;
  }

  const result = JSON.parse(prepare(bytes));
  if (result.success === false) {
    throw new Error(result.error || result.log?.[0] || 'WASM database preparation failed');
  }

  isWasmDatabasePrepared = true;
  console.log('WASM database prepared:', result);
}

/**
 * Initialize the solver — tries native Android module first, then WASM fallback.
 */
export async function initSolver(): Promise<void> {
  if (isNativeReady || isWasmReady) return;

  // Try native Android module first. Hermes cannot run the WASM fallback.
  if (Platform.OS === 'android') {
    if (!NativeSolver) {
      throw new Error('Native Android solver module AdAstraSolver was not found in this build.');
    }

    try {
      const result: string = await NativeSolver.ping();
      if (result.startsWith('ad_astra_native_ok')) {
        const path = await loadBundledDatabasePath();
        const loadResult: string = await NativeSolver.loadDatabase(path);
        const loadInfo = JSON.parse(loadResult);
        if (loadInfo.success === false) {
          throw new Error(loadInfo.error || 'Database load failed');
        }
        dbPath = path;
        isNativeReady = true;
        console.log('Native solver initialized with database:', loadInfo);
        return;
      }
      console.warn('Native solver ping failed:', result);
      throw new Error(result);
    } catch (e: any) {
      throw new Error(`Native Android solver init failed: ${e?.message ?? e}`);
    }
  }

  // Fall back to WASM
  if (Platform.OS === 'web') {
    isWasmReady = true;
    console.log('Web WASM solver will run in persistent worker');
    return;
  }

  try {
    const wasmModule = await loadWasmModule();
    wasm = wasmModule;
    isWasmReady = true;
    console.log('WASM solver initialized');
  } catch (err) {
    console.error('Failed to init WASM solver:', err);
    throw err;
  }
}

/**
 * Initialize the solver and load the star catalog database.
 * Safe to call from multiple places; work is deduplicated.
 */
export async function ensureSolverReady(): Promise<void> {
  await initSolver();

  if (isNativeReady) return;

  if (!dbBytes) {
    await loadDatabase();
  }

  if (canUseWasmWorker()) {
    if (dbBytes) {
      await ensureWasmWorkerReady(dbBytes);
    }
    return;
  }

  if (isWasmReady && wasm && dbBytes) {
    prepareWasmDatabase(dbBytes);
  }
}

export function isSolverReady(): boolean {
  if (isNativeReady) return true;
  if (!isWasmReady || dbBytes === null) return false;
  if (canUseWasmWorker()) {
    return isWasmDatabasePrepared;
  }
  return wasm !== null && isWasmDatabasePrepared;
}

export function getDatabaseSize(): number | null {
  return dbBytes?.length ?? null;
}

export function setDatabase(bytes: Uint8Array): void {
  dbBytes = bytes;
  isWasmDatabasePrepared = false;
  resetWasmWorker();
  console.log(`Database loaded: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
  if (!canUseWasmWorker() && isWasmReady && wasm) {
    prepareWasmDatabase(bytes);
  }
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

interface MatchedStarPosition {
  imageX: number;
  imageY: number;
  catalogId: number;
  ra: number;
  dec: number;
}

interface PlateSolveOptions {
  solveTimeoutMs?: number;
  fovEstimateDeg?: number;
  fovMaxErrorDeg?: number;
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
  detectedStars: DetectedStar[];
  matchedStarPositions: MatchedStarPosition[];
}

function mapDetectedStars(stars: any[]): DetectedStar[] {
  return (stars || []).map((s) => ({
    x: s.x_px,
    y: s.y_px,
    flux: s.brightness,
  }));
}

function mapMatchedStars(stars: any[]): MatchedStarPosition[] {
  return (stars || []).map((s) => ({
    imageX: s.image_x,
    imageY: s.image_y,
    catalogId: s.catalog_id,
    ra: s.ra_deg,
    dec: s.dec_deg,
  }));
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
    detectedStars: mapDetectedStars(result.detected_stars),
    matchedStarPositions: mapMatchedStars(result.matched_star_positions),
  };
}

function parseNativeResult(resultJson: string): PlateSolveResult {
  const result = JSON.parse(resultJson);

  // JNI/FFI error envelope: { success: false, error: "..." } without solve fields.
  if (result.error && !Array.isArray(result.log)) {
    return {
      success: false,
      confidence: 0,
      matchedStars: 0,
      solveTimeMs: 0,
      log: [result.error],
      detectedStars: [],
      matchedStarPositions: [],
    };
  }

  return {
    success: result.success ?? false,
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
    detectedStars: mapDetectedStars(result.detected_stars),
    matchedStarPositions: mapMatchedStars(result.matched_star_positions),
  };
}

type WasmWorkerResponse =
  | { ok: true; result: string }
  | { ok: false; error: string };

type WasmWorkerOutbound =
  | { type: 'ready' }
  | { type: 'error'; error: string }
  | ({ type: 'solveResult'; id: number } & WasmWorkerResponse);

function attachPersistentWorkerHandlers(worker: Worker): void {
  worker.addEventListener('message', (event: MessageEvent<WasmWorkerOutbound>) => {
    const payload = event.data;

    if (payload.type === 'ready') {
      isWasmDatabasePrepared = true;
      return;
    }

    if (payload.type === 'error') {
      resetWasmWorker(new Error(payload.error || 'WASM worker init failed'));
      return;
    }

    if (payload.type === 'solveResult') {
      const pending = pendingWorkerSolves.get(payload.id);
      if (!pending) return;

      pendingWorkerSolves.delete(payload.id);
      if (activeWasmReject === pending.reject) {
        activeWasmReject = null;
      }

      if (payload.ok) {
        pending.resolve(payload.result);
      } else {
        pending.reject(new Error(payload.error || 'WASM worker solve failed'));
      }
    }
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    const reason = new Error(event.message || 'WASM worker error');
    resetWasmWorker(reason);
    rejectPendingWorkerSolves(reason);
  });
}

async function ensureWasmWorkerReady(bytes: Uint8Array): Promise<void> {
  if (
    wasmWorkerReadyPromise
    && wasmWorkerReadyDbLength === bytes.length
    && (wasmWorkerState === 'ready' || wasmWorkerState === 'initializing')
  ) {
    return wasmWorkerReadyPromise;
  }

  resetWasmWorker();

  const generation = wasmWorkerGeneration;
  const worker = new Worker(new URL('./wasmSolve.worker.ts', import.meta.url));
  persistentWasmWorker = worker;
  wasmWorkerState = 'initializing';
  wasmWorkerReadyDbLength = bytes.length;
  attachPersistentWorkerHandlers(worker);

  wasmWorkerReadyPromise = new Promise<void>((resolve, reject) => {
    wasmWorkerReadyReject = reject;

    const settleIfCurrent = (): boolean =>
      isWorkerGenerationCurrent(generation, wasmWorkerGeneration);

    const onReady = (event: MessageEvent<WasmWorkerOutbound>) => {
      if (event.data.type !== 'ready' || !settleIfCurrent()) return;
      worker.removeEventListener('message', onReady);
      worker.removeEventListener('message', onError);
      wasmWorkerReadyReject = null;
      wasmWorkerState = 'ready';
      resolve();
    };

    const onError = (event: MessageEvent<WasmWorkerOutbound>) => {
      if (event.data.type !== 'error' || !settleIfCurrent()) return;
      worker.removeEventListener('message', onReady);
      worker.removeEventListener('message', onError);
      resetWasmWorker(new Error(event.data.error || 'WASM worker init failed'));
    };

    worker.addEventListener('message', onReady);
    worker.addEventListener('message', onError);
    worker.postMessage({ type: 'init', dbBytes: bytes });
  });

  return wasmWorkerReadyPromise;
}

function solveWasmSync(
  requestJson: string,
  imageWidth: number,
  imageHeight: number,
): string {
  if (!wasm) {
    throw new Error('WASM solver not ready');
  }

  const solveLoaded = wasm.solve_loaded;
  if (typeof solveLoaded === 'function') {
    return solveLoaded(requestJson, imageWidth, imageHeight);
  }

  if (!dbBytes) {
    throw new Error('Database not loaded');
  }

  return wasm.solve(dbBytes, requestJson, imageWidth, imageHeight);
}

function solveWasmInWorker(
  requestJson: string,
  imageWidth: number,
  imageHeight: number,
): Promise<string> {
  if (!dbBytes) {
    return Promise.reject(new Error('Database not loaded'));
  }

  if (!canUseWasmWorker()) {
    return Promise.resolve(solveWasmSync(requestJson, imageWidth, imageHeight));
  }

  return ensureWasmWorkerReady(dbBytes).then(() => {
    if (!persistentWasmWorker) {
      throw new Error('WASM worker not ready');
    }

    rejectPendingWorkerSolves(new Error('Solve superseded'));

    const id = nextWorkerSolveId++;
    return new Promise<string>((resolve, reject) => {
      activeWasmReject = reject;
      pendingWorkerSolves.set(id, { resolve, reject });
      persistentWasmWorker!.postMessage({
        type: 'solve',
        id,
        requestJson,
        imageWidth,
        imageHeight,
      });
    });
  });
}

export async function solvePlate(
  imageWidth: number,
  imageHeight: number,
  stars: DetectedStar[],
  options: PlateSolveOptions = {}
): Promise<PlateSolveResult> {
  const requestPayload = {
    sources: stars.map((s) => ({
      x_px: s.x,
      y_px: s.y,
      flux: s.flux,
    })),
    fov_estimate_deg: options.fovEstimateDeg,
    fov_max_error_deg: options.fovMaxErrorDeg,
    solve_timeout_ms: options.solveTimeoutMs,
  };
  const requestJson = JSON.stringify(requestPayload);

  // Native path (Android)
  if (isNativeReady && NativeSolver) {
    const nativePromise = NativeSolver
      .solveSources(requestJson, imageWidth, imageHeight)
      .then(parseNativeResult);
    return withSolveTimeout(nativePromise, options.solveTimeoutMs, abortActiveSolve);
  }

  // WASM fallback
  if (!isWasmReady || !dbBytes || !isWasmDatabasePrepared) {
    throw new Error('Solver not ready. Call ensureSolverReady() first.');
  }

  if (!canUseWasmWorker() && !wasm) {
    throw new Error('WASM solver not ready');
  }

  const wasmPromise = solveWasmInWorker(requestJson, imageWidth, imageHeight)
    .then(parseWasmResult);
  return withSolveTimeout(wasmPromise, options.solveTimeoutMs, abortActiveSolve);
}
