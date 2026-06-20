/**
 * Database loader — fetches and caches the .adb star catalog.
 *
 * In development, serves from a local HTTP server.
 * In production, bundles or downloads from a CDN.
 */

import { setDatabase } from "./solver";

// For development: start a local file server in the project root:
//   python -m http.server 8765
// and place default.adb at the project root or data/processed/
const DATABASE_URL = "http://localhost:8765/data/processed/default.adb";

let dbLoadingPromise: Promise<void> | null = null;

/**
 * Load the star catalog database into the solver.
 * Caches in memory after first load.
 */
export async function loadDatabase(): Promise<void> {
  if (dbLoadingPromise) return dbLoadingPromise;

  dbLoadingPromise = (async () => {
    try {
      console.log("Fetching star catalog database...");
      const response = await fetch(DATABASE_URL);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch database: ${response.status} ${response.statusText}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      setDatabase(bytes);
      console.log(`Database loaded: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      console.error("Failed to load database:", err);
      // Don't throw — app can still work with detection-only mode
    }
  })();

  return dbLoadingPromise;
}
