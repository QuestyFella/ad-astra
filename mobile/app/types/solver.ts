export type SolverStep =
  | 'preparing'
  | 'detecting'
  | 'building'
  | 'querying'
  | 'verifying';

export type SolverState =
  | 'idle'
  | 'image_selected'
  | 'detecting_sources'
  | 'building_patterns'
  | 'querying_index'
  | 'verifying_solution'
  | 'solved'
  | 'failed'
  | 'cancelled';

export interface DetectedStar {
  x: number;
  y: number;
  brightness: number;
}

export interface MatchedStar {
  imageX: number;
  imageY: number;
  catalogId: number;
  ra: number;
  dec: number;
}

export interface SolveResult {
  success: boolean;
  raDeg: number | null;
  decDeg: number | null;
  fovXDeg: number | null;
  fovYDeg: number | null;
  rotationDeg: number | null;
  confidence: 'high' | 'medium' | 'low';
  matchedStars: number;
  rmsErrorPx: number;
  detectedStars: DetectedStar[];
  matchedStarPositions: MatchedStar[];
  solveTimeMs: number;
  log: string[];
}

export interface CatalogInfo {
  id: string;
  name: string;
  maxMag: number;
  sizeMb: number;
  installed: boolean;
  version: string;
  starCount: number;
}

export interface SolverConfig {
  maxSolveTimeMs: number;
  minStars: number;
  catalogId: string;
  showDebugOverlay: boolean;
}

export const STEP_LABELS: Record<SolverStep, string> = {
  preparing: 'Preparing image',
  detecting: 'Detecting stars',
  building: 'Building patterns',
  querying: 'Searching catalog',
  verifying: 'Verifying solution',
};

export const STEP_ORDER: SolverStep[] = [
  'preparing',
  'detecting',
  'building',
  'querying',
  'verifying',
];
