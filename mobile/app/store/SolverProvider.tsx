import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type {
  SolverState,
  SolverStep,
  SolveResult,
  SolverConfig,
  DetectedStar,
  MatchedStar,
} from '../types/solver';
import { detectStars } from '../utils/starDetection';
import {
  abortActiveSolve,
  ensureSolverReady,
  isSolverReady,
  solvePlate,
} from '../utils/solver';

interface SolverContextValue {
  state: SolverState;
  currentStep: SolverStep;
  result: SolveResult | null;
  imageUri: string | null;
  config: SolverConfig;
  startSolve: (uri: string) => void;
  cancel: () => void;
  reset: () => void;
}

const SolverContext = createContext<SolverContextValue | null>(null);

const DEFAULT_CONFIG: SolverConfig = {
  maxSolveTimeMs: 30000,
  minStars: 10,
  catalogId: 'hipparcos-8.5',
  showDebugOverlay: false,
  fovEstimateDeg: 20,
  fovMaxErrorDeg: 25,
};

export function SolverProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SolverState>('idle');
  const [currentStep, setCurrentStep] = useState<SolverStep>('preparing');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [config] = useState<SolverConfig>(DEFAULT_CONFIG);
  const cancelledRef = useRef(false);
  const solveGenerationRef = useRef(0);

  const reset = useCallback(() => {
    abortActiveSolve();
    solveGenerationRef.current += 1;
    setState('idle');
    setCurrentStep('preparing');
    setResult(null);
    setImageUri(null);
    cancelledRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortActiveSolve();
    setState('cancelled');
  }, []);

  const startSolve = useCallback(async (uri: string) => {
    const generation = ++solveGenerationRef.current;
    setImageUri(uri);
    cancelledRef.current = false;
    setState('image_selected');
    const startTime = Date.now();

    const isStale = () =>
      cancelledRef.current || generation !== solveGenerationRef.current;

    try {
      setCurrentStep('preparing');
      setState('detecting_sources');
      await ensureSolverReady();

      if (isStale()) {
        setState('cancelled');
        return;
      }

      setCurrentStep('detecting');
      const { stars: detectedStarsRaw, imageWidth, imageHeight } = await detectStars(uri, {
        maxDimension: 1024,
        thresholdSigma: 4,
        maxStars: 50,
      });

      if (isStale()) {
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
          raDeg: null,
          decDeg: null,
          fovXDeg: null,
          fovYDeg: null,
          rotationDeg: null,
          matchedStars: 0,
          confidence: 'low',
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
        setResult({
          success: false,
          raDeg: null,
          decDeg: null,
          fovXDeg: null,
          fovYDeg: null,
          rotationDeg: null,
          matchedStars: 0,
          confidence: 'low',
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

      setCurrentStep('building');
      setState('building_patterns');
      await new Promise((r) => setTimeout(r, 100));

      if (isStale()) {
        setState('cancelled');
        return;
      }

      setCurrentStep('querying');
      setState('querying_index');
      await new Promise((r) => setTimeout(r, 100));

      if (isStale()) {
        setState('cancelled');
        return;
      }

      setCurrentStep('verifying');
      setState('verifying_solution');

      const elapsedMs = Date.now() - startTime;
      const remainingSolveMs = Math.max(1000, config.maxSolveTimeMs - elapsedMs);

      const solveResult = await solvePlate(imageWidth, imageHeight, detectedStarsRaw, {
        solveTimeoutMs: remainingSolveMs,
        fovEstimateDeg: config.fovEstimateDeg,
        fovMaxErrorDeg: config.fovMaxErrorDeg,
      });

      if (isStale()) {
        setState('cancelled');
        return;
      }

      const matched: MatchedStar[] = solveResult.matchedStarPositions.map((m) => ({
        imageX: m.imageX,
        imageY: m.imageY,
        catalogId: m.catalogId,
        ra: m.ra,
        dec: m.dec,
      }));

      const solverDetectedStars: DetectedStar[] = solveResult.detectedStars.length > 0
        ? solveResult.detectedStars.map((s) => ({
            x: s.x,
            y: s.y,
            brightness: Math.min(1.0, s.flux / 50000),
          }))
        : detectedStars;

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
        rmsErrorPx: solveResult.rmsErrorArcsec ? solveResult.rmsErrorArcsec / 3 : 0,
        solveTimeMs: Date.now() - startTime,
        detectedStars: solverDetectedStars,
        matchedStarPositions: matched,
        imageWidth,
        imageHeight,
        log: solveResult.log,
      };

      setResult(finalResult);
      setState('solved');
    } catch (err: any) {
      console.error('Solve error:', err);
      if (isStale()) {
        setState('cancelled');
        return;
      }
      setResult({
        success: false,
        raDeg: null,
        decDeg: null,
        fovXDeg: null,
        fovYDeg: null,
        rotationDeg: null,
        matchedStars: 0,
        confidence: 'low',
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
  }, [config.maxSolveTimeMs, config.fovEstimateDeg, config.fovMaxErrorDeg]);

  return (
    <SolverContext.Provider
      value={{
        state,
        currentStep,
        result,
        imageUri,
        config,
        startSolve,
        cancel,
        reset,
      }}
    >
      {children}
    </SolverContext.Provider>
  );
}

export function useSolver(): SolverContextValue {
  const ctx = useContext(SolverContext);
  if (!ctx) {
    throw new Error('useSolver must be used within SolverProvider');
  }
  return ctx;
}
