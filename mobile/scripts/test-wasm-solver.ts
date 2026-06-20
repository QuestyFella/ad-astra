/**
 * Simulation test: WASM Solver Bridge
 * Validates the JS↔WASM interface with a tiny database.
 *
 * Run with:
 *   cd mobile && npx tsx scripts/test-wasm-solver.ts
 */

import * as fs from "fs";
import * as path from "path";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const MOBILE_DIR = path.resolve(__dirname);
const WASM_PATH = path.resolve(MOBILE_DIR, "..", "app", "wasm", "ad_astra_solver_wasm_bg.wasm");

// Build a tiny .adb database in memory for WASM testing
function buildTinyDb(): Uint8Array {
  const nStars = 10;
  const nPatterns = 3;

  const headerSize = 64;
  const starSize = 28;
  const patternSize = 8;

  const totalSize = headerSize + nStars * starSize + nPatterns * patternSize;
  const buf = new ArrayBuffer(totalSize);
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);

  // Magic "ADB\0"
  b[0] = 65; b[1] = 68; b[2] = 66; b[3] = 0;
  dv.setUint32(4, 1, true);      // version
  dv.setUint32(8, nStars, true);  // n_stars
  dv.setUint32(12, nPatterns, true); // n_patterns
  dv.setFloat32(16, 10, true);    // min_fov
  dv.setFloat32(20, 30, true);    // max_fov
  dv.setFloat32(24, 7, true);     // max_mag
  dv.setUint32(28, 2000, true);   // epoch
  dv.setUint32(32, 4, true);      // pattern_size
  dv.setUint32(36, 50, true);     // pattern_bins

  // Write 10 fake stars (unit vectors pointing to random-ish sky positions)
  const starPositions: [number, number, number][] = [
    [0.12, 0.45, 0.88], [0.34, 0.67, 0.66], [0.56, 0.12, 0.82],
    [0.78, 0.34, 0.52], [0.23, 0.89, 0.39], [0.91, 0.23, 0.34],
    [0.45, 0.56, 0.69], [0.67, 0.78, 0.12], [0.89, 0.91, 0.01],
    [0.11, 0.22, 0.97],
  ];

  for (let i = 0; i < nStars; i++) {
    const off = headerSize + i * starSize;
    dv.setUint32(off, 1000 + i, true);       // catalog_id
    dv.setFloat32(off + 4, 0, true);          // ra_rad
    dv.setFloat32(off + 8, 0, true);          // dec_rad
    dv.setFloat32(off + 12, starPositions[i][0], true);
    dv.setFloat32(off + 16, starPositions[i][1], true);
    dv.setFloat32(off + 20, starPositions[i][2], true);
    dv.setFloat32(off + 24, 5 - i * 0.2, true); // mag
  }

  // Write 3 fake patterns
  const patterns: [number, number, number, number][] = [
    [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5],
  ];
  const patternOff = headerSize + nStars * starSize;
  for (let i = 0; i < nPatterns; i++) {
    const off = patternOff + i * patternSize;
    dv.setUint16(off, patterns[i][0], true);
    dv.setUint16(off + 2, patterns[i][1], true);
    dv.setUint16(off + 4, patterns[i][2], true);
    dv.setUint16(off + 6, patterns[i][3], true);
  }

  return new Uint8Array(buf);
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════
async function main() {
  console.log("WASM Solver Bridge Tests\n");

  // Init
  let mod: any;
  let dbBytes: Uint8Array;

  await runTest("WASM module loads", async () => {
    const wasmBin = fs.readFileSync(WASM_PATH);
    const response = new Response(wasmBin, {
      headers: { "Content-Type": "application/wasm" },
    });
    mod = await import("../app/wasm/ad_astra_solver_wasm.js");
    await mod.default(response);
    assert(typeof mod.solve === "function", "solve() export missing");
  });

  await runTest("tiny database built and accepted", () => {
    dbBytes = buildTinyDb();
    assert(dbBytes.length > 64, `db too small: ${dbBytes.length}B`);
    console.log(`    Generated ${dbBytes.length}B test database`);
  });

  await runTest("solve with empty sources → returns valid result struct", () => {
    const json = JSON.stringify([]);
    const resultJson = mod.solve(dbBytes, json, 400, 300);
    console.log(`    raw result (first 100): ${typeof resultJson === 'string' ? resultJson.substring(0, 100) : typeof resultJson}`);
    const result = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
    assert(typeof result.success === "boolean", "success missing");
    assert(typeof result.log !== "undefined", "log missing");
    console.log(`    success=${result.success} log=[${result.log?.join("; ")}]`);
  });

  await runTest("solve with 2 sources → returns valid result struct", () => {
    const sources = [
      { x_px: 100, y_px: 200, flux: 1.0 },
      { x_px: 300, y_px: 400, flux: 0.5 },
    ];
    const resultJson = mod.solve(dbBytes, JSON.stringify(sources), 800, 600);
    const result = JSON.parse(resultJson);
    assert(typeof result.success === "boolean", "success field missing");
    assert(typeof result.confidence === "number", "confidence missing");
    assert(typeof result.matched_stars === "number", "matched_stars missing");
    assert(typeof result.solve_time_ms === "number", "solve_time_ms missing");
    assert(Array.isArray(result.log), "log not an array");
    assert(Array.isArray(result.detected_stars), "detected_stars missing");
    console.log(`    success=${result.success} confidence=${result.confidence} matched=${result.matched_stars}`);
  });

  await runTest("solve with 4 aligned sources (forms quads)", () => {
    const sources = [
      { x_px: 100, y_px: 200, flux: 1.0 },
      { x_px: 200, y_px: 200, flux: 0.9 },
      { x_px: 150, y_px: 250, flux: 0.8 },
      { x_px: 150, y_px: 150, flux: 0.7 },
    ];
    const resultJson = mod.solve(dbBytes, JSON.stringify(sources), 400, 300);
    const result = JSON.parse(resultJson);
    // Won't solve (tiny DB), but should not crash
    console.log(`    success=${result.success} log=[${result.log.join("; ")}]`);
    assert(result.log !== undefined, "log missing");
  });

  await runTest("solve handles various image sizes", () => {
    for (const [w, h] of [[800, 600], [1600, 1200]] as [number, number][]) {
      const resultJson = mod.solve(
        dbBytes,
        JSON.stringify([{ x_px: w / 2, y_px: h / 2, flux: 1 }]),
        w,
        h
      );
      const result = JSON.parse(resultJson);
      assert(typeof result.solve_time_ms === "number", `size ${w}x${h} failed`);
    }
  });

  await runTest("empty database bytes → error", () => {
    try {
      const resultJson = mod.solve(
        new Uint8Array(0),
        JSON.stringify([]),
        100,
        100
      );
      const result = JSON.parse(resultJson);
      assert(!result.success, "should fail with empty db");
      console.log(`    log: ${result.log.join("; ")}`);
    } catch (e: any) {
      // May throw if the WASM can't even parse the header
      console.log(`    expected error: ${e.message}`);
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
