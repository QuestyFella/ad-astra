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

const MOCK_DELAY_MS = 800;

function randomStars(n: number, w: number, h: number): DetectedStar[] {
  const stars: DetectedStar[] = [];
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      brightness: 0.3 + Math.random() * 0.7,
    });
  }
  return stars;
}

function mockMatchedStars(detected: DetectedStar[]): MatchedStar[] {
  const matched: MatchedStar[] = [];
  for (let i = 0; i < Math.min(detected.length, 12); i++) {
    matched.push({
      imageX: detected[i].x + (Math.random() - 0.5) * 4,
      imageY: detected[i].y + (Math.random() - 0.5) * 4,
      catalogId: 1000 + i,
      ra: Math.random() * 360,
      dec: (Math.random() - 0.5) * 180,
    });
  }
  return matched;
}

export function useSolver() {
  const [state, setState] = useState<SolverState>('idle');
  const [currentStep, setCurrentStep] = useState<SolverStep>('preparing');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const config: SolverConfig = {
    maxSolveTimeMs: 5000,
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
    const imageWidth = 1200;
    const imageHeight = 1600;

    for (const step of STEP_ORDER) {
      if (cancelledRef.current) {
        setState('cancelled');
        return;
      }
      setCurrentStep(step);
      const stateMap: Record<SolverStep, SolverState> = {
        preparing: 'detecting_sources',
        detecting: 'detecting_sources',
        building: 'building_patterns',
        querying: 'querying_index',
        verifying: 'verifying_solution',
      };
      setState(stateMap[step]);
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
    }

    if (cancelledRef.current) {
      setState('cancelled');
      return;
    }

    const detected = randomStars(45, imageWidth, imageHeight);
    const matched = mockMatchedStars(detected);
    const elapsed = Date.now() - startTime;

    const solveResult: SolveResult = {
      success: true,
      raDeg: 83.8221,
      decDeg: -5.3912,
      fovXDeg: 62.4,
      fovYDeg: 46.8,
      rotationDeg: -12.6,
      confidence: 'high',
      matchedStars: matched.length,
      rmsErrorPx: 1.8,
      detectedStars: detected,
      matchedStarPositions: matched,
      solveTimeMs: elapsed,
      log: [
        `Detected ${detected.length} stars`,
        `Built ${Math.floor(detected.length * 0.6)} quads`,
        `Matched ${matched.length} stars in 0.42s`,
        `RMS error: 1.8 px`,
      ],
    };

    setResult(solveResult);
    setState('solved');
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
