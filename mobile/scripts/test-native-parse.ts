/**
 * Unit tests for Android native solve JSON envelope parsing.
 *
 * Run with:
 *   cd mobile && npx tsx scripts/test-native-parse.ts
 */

import { parseNativeSolveResponse } from '../modules/ad-astra-solver-native/src/parseNativeSolveResponse';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

console.log('Native Solve Response Parsing Tests\n');

test('ffi_error envelope preserves error text', () => {
  const raw = JSON.stringify({
    envelope: 'ffi_error',
    success: false,
    error: 'JNI database mutex poisoned',
  });
  const result = parseNativeSolveResponse(raw);
  assert(result.success === false, 'expected unsuccessful result');
  assert(result.log[0] === 'JNI database mutex poisoned', `unexpected log: ${result.log[0]}`);
  assert(result.detectedStars.length === 0, 'ffi errors should not fabricate detections');
  assert(result.matchedStars === 0, 'ffi errors should zero matched stars');
});

test('solve_result envelope preserves solver diagnostics on failure', () => {
  const raw = JSON.stringify({
    envelope: 'solve_result',
    success: false,
    confidence: 0.12,
    matched_stars: 2,
    solve_time_ms: 87,
    log: ['Generated 4 image quads', 'Found 0 candidates'],
    detected_stars: [{ x_px: 10, y_px: 20, brightness: 1.5 }],
    matched_star_positions: [],
  });
  const result = parseNativeSolveResponse(raw);
  assert(result.success === false, 'expected unsuccessful solve');
  assert(result.confidence === 0.12, `confidence=${result.confidence}`);
  assert(result.matchedStars === 2, `matchedStars=${result.matchedStars}`);
  assert(result.solveTimeMs === 87, `solveTimeMs=${result.solveTimeMs}`);
  assert(result.log.length === 2, `log length=${result.log.length}`);
  assert(result.detectedStars.length === 1, 'detected stars should be preserved');
  assert(result.detectedStars[0].x === 10 && result.detectedStars[0].y === 20, 'star coords mapped');
});

test('legacy ffi error fallback without envelope tag', () => {
  const raw = JSON.stringify({
    success: false,
    error: 'Database not loaded',
  });
  const result = parseNativeSolveResponse(raw);
  assert(result.success === false, 'expected unsuccessful result');
  assert(result.log[0] === 'Database not loaded', `unexpected log: ${result.log[0]}`);
  assert(result.detectedStars.length === 0, 'legacy ffi errors should not include detections');
});

test('successful solve maps coordinates and matched stars', () => {
  const raw = JSON.stringify({
    envelope: 'solve_result',
    success: true,
    ra_deg: 123.4,
    dec_deg: 45.6,
    roll_deg: 7.8,
    fov_x_deg: 12.3,
    fov_y_deg: 11.1,
    pixel_scale_arcsec: 3.2,
    confidence: 0.95,
    matched_stars: 8,
    rms_error_arcsec: 4.5,
    solve_time_ms: 321,
    log: ['Solve complete'],
    detected_stars: [{ x_px: 100, y_px: 200, brightness: 9.1 }],
    matched_star_positions: [
      {
        image_x: 100,
        image_y: 200,
        catalog_id: 42,
        ra_deg: 120.0,
        dec_deg: 44.0,
      },
    ],
  });
  const result = parseNativeSolveResponse(raw);
  assert(result.success === true, 'expected success');
  assert(result.raDeg === 123.4, `raDeg=${result.raDeg}`);
  assert(result.decDeg === 45.6, `decDeg=${result.decDeg}`);
  assert(result.rollDeg === 7.8, `rollDeg=${result.rollDeg}`);
  assert(result.fovXDeg === 12.3, `fovXDeg=${result.fovXDeg}`);
  assert(result.fovYDeg === 11.1, `fovYDeg=${result.fovYDeg}`);
  assert(result.pixelScaleArcsec === 3.2, `pixelScaleArcsec=${result.pixelScaleArcsec}`);
  assert(result.rmsErrorArcsec === 4.5, `rmsErrorArcsec=${result.rmsErrorArcsec}`);
  assert(result.matchedStarPositions.length === 1, 'matched star positions mapped');
  assert(result.matchedStarPositions[0].catalogId === 42, 'catalog id mapped');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
