export interface NativeDetectedStar {
  x: number;
  y: number;
  flux: number;
}

export interface NativeMatchedStarPosition {
  imageX: number;
  imageY: number;
  catalogId: number;
  ra: number;
  dec: number;
}

export interface NativePlateSolveResult {
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
  detectedStars: NativeDetectedStar[];
  matchedStarPositions: NativeMatchedStarPosition[];
}

function mapDetectedStars(stars: any[]): NativeDetectedStar[] {
  return (stars || []).map((s) => ({
    x: s.x_px,
    y: s.y_px,
    flux: s.brightness,
  }));
}

function mapMatchedStars(stars: any[]): NativeMatchedStarPosition[] {
  return (stars || []).map((s) => ({
    imageX: s.image_x,
    imageY: s.image_y,
    catalogId: s.catalog_id,
    ra: s.ra_deg,
    dec: s.dec_deg,
  }));
}

function isNativeFfiErrorEnvelope(result: Record<string, unknown>): boolean {
  if (result.envelope === 'ffi_error') {
    return true;
  }
  if (result.envelope === 'solve_result') {
    return false;
  }

  // Fallback for older native builds without Kotlin envelope tagging.
  return (
    typeof result.error === 'string' &&
    result.log === undefined &&
    result.detected_stars === undefined &&
    result.matched_stars === undefined &&
    result.solve_time_ms === undefined
  );
}

/**
 * Parse Android native solve JSON, preserving solver diagnostics on failure.
 * FFI infrastructure errors ({ success, error }) are distinguished from full
 * Rust SolveResult payloads ({ success, log, detected_stars, ... }).
 */
export function parseNativeSolveResponse(raw: string): NativePlateSolveResult {
  const result = JSON.parse(raw) as Record<string, unknown>;

  if (isNativeFfiErrorEnvelope(result)) {
    return {
      success: false,
      confidence: 0,
      matchedStars: 0,
      solveTimeMs: 0,
      log: [typeof result.error === 'string' ? result.error : 'Native solve failed'],
      detectedStars: [],
      matchedStarPositions: [],
    };
  }

  return {
    success: (result.success as boolean | undefined) ?? false,
    raDeg: (result.ra_deg as number | null | undefined) ?? undefined,
    decDeg: (result.dec_deg as number | null | undefined) ?? undefined,
    rollDeg: (result.roll_deg as number | null | undefined) ?? undefined,
    fovXDeg: (result.fov_x_deg as number | null | undefined) ?? undefined,
    fovYDeg: (result.fov_y_deg as number | null | undefined) ?? undefined,
    pixelScaleArcsec: (result.pixel_scale_arcsec as number | null | undefined) ?? undefined,
    confidence: (result.confidence as number | undefined) ?? 0,
    matchedStars: (result.matched_stars as number | undefined) ?? 0,
    rmsErrorArcsec: (result.rms_error_arcsec as number | null | undefined) ?? undefined,
    solveTimeMs: (result.solve_time_ms as number | undefined) ?? 0,
    log: (result.log as string[] | undefined) ?? [],
    detectedStars: mapDetectedStars(result.detected_stars as any[]),
    matchedStarPositions: mapMatchedStars(result.matched_star_positions as any[]),
  };
}
