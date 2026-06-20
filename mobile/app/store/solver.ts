import { useState, useCallback, useRef } from 'react';
import type {
  SolverState,
  SolverStep,
  SolveResult,
  SolverConfig,
  DetectedStar,
  MatchedStar,
} from '../types/solver';
import { STEP_ORDER } from '../types/solver';
import { detectStars } from '../utils/starDetection';
import { initSolver, isSolverReady, solvePlate } from '../utils/solver';

// Ensure solver is initialized once globally
let solverInitPromise: Promise<void> | null = null;

function ensureSolverInit(): Promise<void> {
  if (!solverInitPromise) {
    solverInitPromise = initSolver().catch((err) => {
      console.warn('Solver init warning:', err);
      // Don't throw — app can still work with mock data or limited functionality
    });
  }
  return solverInitPromise;
}

export function useSolver() {
  const [state, setState] = useState<SolverState>('idle');
  const [currentStep, setCurrentStep] = useState<SolverStep>('preparing');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const config: SolverConfig = {
    maxSolveTimeMs: 30000, // 30s max for full pipeline
    minStars: 10,
    catalogId: 'hipparcos-8.5',
    showDebugOverlay: false,
  };

  const reset = useCallback(() => {
    setState('idle');
    setCurrentStep('preparing');
    setResult(null);
    setImageUri(null);
    cancelledRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setState('cancelled');
  }, []);

  const startSolve = useCallback(async (uri: string) => {
    setImageUri(uri);
    cancelledRef.current = false;
    setState('image_selected');
    const startTime = Date.now();

    try {
      // ── 1. Initialize solver (loads WASM + database) ──
      setCurrentStep('preparing');
      setState('detecting_sources');
      await ensureSolverInit();

      if (cancelledRef.current) {
        setState('cancelled');
        return;
      }

      // ── 2. Detect stars from image ──
      setCurrentStep('detecting');
      const { stars: detectedStarsRaw, imageWidth, imageHeight } = await detectStars(uri, {
        maxDimension: 1024,
        thresholdSigma: 4,
        maxStars: 50,
      });

      if (cancelledRef.current) {
        setState('cancelled');
        return;
      }

      const detectedStars: DetectedStar[] = detectedStarsRaw.map((s) => ({
        x: s.x,
        y: s.y,
        brightness: Math.min(1.0, s.flux / 50000),
      }));

      if (detectedStars.length < 4) {
        setResult({
          success: false,
          raDeg: undefined as any,
          decDeg: undefined as any,
          fovXDeg: undefined as any,
          fovYDeg: undefined as any,
          rotationDeg: undefined as any,
          matchedStars: 0,
          confidence: 'low' as const,
          rmsErrorPx: 0,
          solveTimeMs: Date.now() - startTime,
          detectedStars,
          matchedStarPositions: [],
          imageWidth,
          imageHeight,
          log: [
            `Detected only ${detectedStars.length} stars`,
            'Need at least 4 stars for solving.',
          ],
        });
        setState('solved');
        return;
      }

      if (!isSolverReady()) {
        // Solver not ready (no database), return detection-only result
        setResult({
          success: false,
          raDeg: undefined as any,
          decDeg: undefined as any,
          fovXDeg: undefined as any,
          fovYDeg: undefined as any,
          rotationDeg: undefined as any,
          matchedStars: 0,
          confidence: 'low' as const,
          rmsErrorPx: 0,
          solveTimeMs: Date.now() - startTime,
          detectedStars,
          matchedStarPositions: [],
          imageWidth,
          imageHeight,
          log: [
            `Detected ${detectedStars.length} stars`,
            'Star catalog database not loaded.',
            'Install the .adb database to enable solving.',
          ],
        });
        setState('solved');
        return;
      }

      // ── 3. Build patterns / query index (for UI feedback) ──
      setCurrentStep('building');
      setState('building_patterns');
      // Small delay for UI
      await new Promise((r) => setTimeout(r, 100));

      if (cancelledRef.current) {
        setState('cancelled');
        return;
      }

      setCurrentStep('querying');
      setState('querying_index');
      await new Promise((r) => setTimeout(r, 100));

      if (cancelledRef.current) {
        setState('cancelled');
        return;
      }

      // ── 4. Solve ──
      setCurrentStep('verifying');
      setState('verifying_solution');

      const solveResult = await solvePlate(imageWidth, imageHeight, detectedStarsRaw);

      if (cancelledRef.current) {
        setState('cancelled');
        return;
      }

      // ── 5. Format result ──
      const matched: MatchedStar[] = []; // Would come from solver if we add it to output

      const finalResult: SolveResult = {
        success: solveResult.success,
        raDeg: solveResult.raDeg ?? null,
        decDeg: solveResult.decDeg ?? null,
        fovXDeg: solveResult.fovXDeg ?? null,
        fovYDeg: solveResult.fovYDeg ?? null,
        rotationDeg: solveResult.rollDeg ?? null,
        confidence:
          solveResult.confidence > 0.75
            ? 'high'
            : solveResult.confidence > 0.5
              ? 'medium'
              : 'low',
        matchedStars: solveResult.matchedStars,
        rmsErrorPx: solveResult.rmsErrorArcsec ? solveResult.rmsErrorArcsec / 3 : 0, // rough conversion
        solveTimeMs: Date.now() - startTime,
        detectedStars,
        matchedStarPositions: matched,
        imageWidth,
        imageHeight,
        log: solveResult.log,
      };

      setResult(finalResult);
      setState('solved');
    } catch (err: any) {
      console.error('Solve error:', err);
      setResult({
        success: false,
        raDeg: undefined as any,
        decDeg: undefined as any,
        fovXDeg: undefined as any,
        fovYDeg: undefined as any,
        rotationDeg: undefined as any,
        matchedStars: 0,
        confidence: 'low' as const,
        rmsErrorPx: 0,
        solveTimeMs: Date.now() - startTime,
        detectedStars: [],
        matchedStarPositions: [],
        imageWidth: 0,
        imageHeight: 0,
        log: ['Error: ' + (err.message || String(err))],
      });
      setState('solved');
    }
  }, []);

  return {
    state,
    currentStep,
    result,
    imageUri,
    config,
    startSolve,
    cancel,
    reset,
  };
}
