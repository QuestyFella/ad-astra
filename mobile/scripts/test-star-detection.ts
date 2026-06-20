/**
 * Simulation test: Star Detector
 *
 * Generates synthetic star field images at known positions, runs the
 * JS star detector, and verifies centroid accuracy, match rate, and
 * false-positive rate.
 *
 * Run with:
 *   cd mobile && npx tsx scripts/test-star-detection.ts
 */

import {
  renderSyntheticField,
  runDetectionTest,
  generateRandomStars,
  SyntheticStar,
  SyntheticFieldOptions,
} from "../app/utils/syntheticImage";

let passed = 0;
let failed = 0;

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ───────── Test 1: Empty image ─────────
function testEmptyImage() {
  const options: SyntheticFieldOptions = {
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 2,
    stars: [],
  };
  const result = runDetectionTest(options, { minFlux: 50 });
  assert(
    result.detectedStars.length === 0,
    `Expected 0 detections on empty image, got ${result.detectedStars.length}`
  );
}

// ───────── Test 2: Single bright star ─────────
function testSingleStar() {
  const star: SyntheticStar = { x: 200, y: 150, flux: 200, sigma: 2.0 };
  const result = runDetectionTest({
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 1,
    stars: [star],
  });
  assert(result.matchRate === 1.0, `Expected matchRate=1, got ${result.matchRate}`);
  assert(result.matches.length === 1, `Expected 1 match, got ${result.matches.length}`);
  assert(result.matches[0].errorPx < 1.0, `Centroid error ${result.matches[0].errorPx}px too large`);
  assert(result.falsePositives.length === 0, `Expected 0 false positives, got ${result.falsePositives.length}`);
}

// ───────── Test 3: Multiple stars, all detected ─────────
function testManyStars() {
  const stars: SyntheticStar[] = [];
  // Grid of 20 stars
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      stars.push({
        x: 80 + col * 60,
        y: 80 + row * 50,
        flux: 150,
        sigma: 2.0,
      });
    }
  }
  const result = runDetectionTest({
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 1,
    stars,
  });
  assert(result.matchRate >= 0.9, `Match rate ${result.matchRate} < 0.9`);
  assert(result.meanErrorPx < 1.0, `Mean error ${result.meanErrorPx}px too large`);
  assert(result.falsePositives.length <= 2, `Too many false positives: ${result.falsePositives.length}`);
  console.log(`    matched: ${result.matches.length}/${stars.length}, meanError: ${result.meanErrorPx.toFixed(2)}px, FP: ${result.falsePositives.length}`);
}

// ───────── Test 4: High noise tolerance ─────────
function testNoisyImage() {
  const stars = generateRandomStars(15, 800, 600, 100, 180, 1.5, 2.5);
  const result = runDetectionTest(
    {
      width: 800,
      height: 600,
      background: 30,
      noiseSigma: 15, // heavy noise
      stars,
    },
    { thresholdSigma: 4, minFlux: 80 }
  );
  // With heavy noise, expect some misses but should still get most
  assert(result.matchRate >= 0.6, `Match rate ${result.matchRate} < 0.6 under heavy noise`);
  console.log(`    matched: ${result.matches.length}/${stars.length}, meanError: ${result.meanErrorPx.toFixed(2)}px, FP: ${result.falsePositives.length}`);
}

// ───────── Test 5: Dim stars ─────────
function testDimStars() {
  const stars: SyntheticStar[] = [
    { x: 100, y: 100, flux: 60, sigma: 2.0 },
    { x: 200, y: 100, flux: 75, sigma: 2.0 },
    { x: 300, y: 100, flux: 90, sigma: 2.0 },
  ];
  const result = runDetectionTest(
    { width: 400, height: 200, background: 20, noiseSigma: 5, stars },
    { thresholdSigma: 4, minFlux: 40 }
  );
  assert(result.matchRate >= 0.5, `Dim stars match rate ${result.matchRate} too low`);
  console.log(`    matched: ${result.matches.length}/${stars.length}`);
}

// ───────── Test 6: Centroid accuracy ─────────
function testCentroidAccuracy() {
  // Single star at non-integer position — centroid should be very close
  const star: SyntheticStar = { x: 247.3, y: 153.7, flux: 200, sigma: 2.0 };
  const result = runDetectionTest({
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 0.5,
    stars: [star],
  });
  assert(result.matches.length === 1, "Single star not matched");
  assert(result.matches[0].errorPx < 0.5, `Centroid error ${result.matches[0].errorPx}px > 0.5px`);
  console.log(`    true: (${star.x}, ${star.y}) detected: (${result.matches[0].detectedStar.x.toFixed(2)}, ${result.matches[0].detectedStar.y.toFixed(2)}) error: ${result.matches[0].errorPx.toFixed(3)}px`);
}

// ───────── Test 7: Close stars (no merging) ─────────
function testCloseStars() {
  const stars: SyntheticStar[] = [
    { x: 200, y: 150, flux: 200, sigma: 1.5 },
    { x: 206, y: 150, flux: 180, sigma: 1.5 }, // 6px apart
  ];
  const result = runDetectionTest({
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 1,
    stars,
  });
  // Close stars may merge into 1 detection. Accept 1 or 2.
  const matched = result.matches.length;
  assert(matched >= 1, `Expected at least 1 match for close stars, got ${matched}`);
  console.log(`    matched: ${matched}/${stars.length} (${matched < 2 ? "merged (acceptable)" : "resolved"})`);
}

// ───────── Test 8: Edge stars ─────────
function testEdgeStars() {
  const stars: SyntheticStar[] = [
    { x: 15, y: 150, flux: 180, sigma: 2.0 },
    { x: 385, y: 150, flux: 180, sigma: 2.0 },
    { x: 200, y: 15, flux: 180, sigma: 2.0 },
    { x: 200, y: 285, flux: 180, sigma: 2.0 },
  ];
  const result = runDetectionTest({
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 1,
    stars,
  });
  assert(result.matchRate >= 0.75, `Edge stars match rate ${result.matchRate} too low`);
  console.log(`    matched: ${result.matches.length}/${stars.length}`);
}

// ───────── Test 9: Sweep star counts ─────────
function testSweepStarCounts() {
  const counts = [5, 10, 20, 50];
  for (const n of counts) {
    const stars = generateRandomStars(n, 1024, 768, 120, 200, 1.5, 2.5);
    const result = runDetectionTest(
      {
        width: 1024,
        height: 768,
        background: 15,
        noiseSigma: 3,
        stars,
      },
      { thresholdSigma: 4.5 }
    );
    const ok = result.matchRate >= 0.8 && result.meanErrorPx < 1.5;
    console.log(`    n=${n}: matched=${result.matches.length}/${n} rate=${result.matchRate.toFixed(2)} meanErr=${result.meanErrorPx.toFixed(2)}px ${ok ? "OK" : "FAIL"}`);
    assert(ok, `Sweep n=${n} failed`);
  }
}

// ───────── Test 10: WYSIWYG — raw rendering check ─────────
function testRenderConsistency() {
  // Verify that rendering produces a visible star above background
  const star: SyntheticStar = { x: 200, y: 150, flux: 255, sigma: 2.0 };
  const { rgba, width } = renderSyntheticField({
    width: 400,
    height: 300,
    background: 10,
    noiseSigma: 0,
    stars: [star],
  });
  const centerIdx = (Math.floor(150) * width + Math.floor(200)) * 4;
  const centerValue = rgba[centerIdx];
  assert(centerValue > 100, `Star center pixel too dim: ${centerValue} (expected > 100)`);

  const farIdx = 10 * width * 4; // top-left corner
  const farValue = rgba[farIdx];
  assert(farValue <= 15, `Background pixel too bright: ${farValue} (expected <= 15)`);
  console.log(`    star center: ${centerValue}  background: ${farValue}`);
}

// ═══════════════════════════════════════════════════════════
console.log("Star Detector Simulation Tests\n");

test("empty image produces no detections", testEmptyImage);
test("single bright star detected accurately", testSingleStar);
test("20 stars in grid, >90% match rate", testManyStars);
test("noisy image still finds >60%", testNoisyImage);
test("dim stars near threshold", testDimStars);
test("centroid accuracy < 0.5px at (247.3, 153.7)", testCentroidAccuracy);
test("close stars (6px) acceptable merge", testCloseStars);
test("stars at image edges detected", testEdgeStars);
test("sweep star counts 5→50", testSweepStarCounts);
test("render produces visible star + clean background", testRenderConsistency);

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
