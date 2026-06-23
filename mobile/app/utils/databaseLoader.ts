/**
 * Database loader — loads the bundled .adb star catalog into the WASM solver.
 *
 * Production builds use the Expo-bundled asset (same file as Android native).
 * Development can still fall back to a local HTTP server:
 *   python -m http.server 8765
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { setDatabase } from './solver';

const BUNDLED_DATABASE = require('../../assets/default.adb');
const DEV_DATABASE_URL = 'http://localhost:8765/data/processed/default.adb';

let dbLoadingPromise: Promise<void> | null = null;

/**
 * Resolve the bundled .adb asset to a local URI (cache dir on native, URL on web).
 */
export async function resolveBundledDatabaseAsset(): Promise<Asset> {
  const asset = Asset.fromModule(BUNDLED_DATABASE);
  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error('Failed to resolve bundled database asset');
  }

  return asset;
}

/**
 * Read bundled database bytes from the Expo asset bundle.
 */
export async function loadBundledDatabaseBytes(): Promise<Uint8Array> {
  const asset = await resolveBundledDatabaseAsset();
  const uri = asset.localUri!;

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(
        `Failed to read bundled database: ${response.status} ${response.statusText}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  const buffer = await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Resolve the bundled database to a local filesystem path (native only).
 */
export async function loadBundledDatabasePath(): Promise<string> {
  const asset = await resolveBundledDatabaseAsset();
  return asset.localUri!.replace(/^file:\/\//, '');
}

async function loadDevDatabase(): Promise<void> {
  console.log('Fetching star catalog from dev server...');
  const response = await fetch(DEV_DATABASE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch database: ${response.status} ${response.statusText}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  setDatabase(bytes);
}

/**
 * Load the star catalog database into the solver.
 * Caches in memory after first load.
 */
export async function loadDatabase(): Promise<void> {
  if (dbLoadingPromise) return dbLoadingPromise;

  dbLoadingPromise = (async () => {
    try {
      console.log('Loading bundled star catalog database...');
      const bytes = await loadBundledDatabaseBytes();
      setDatabase(bytes);
      console.log('Bundled database loaded');
    } catch (bundledErr) {
      if (!__DEV__) {
        console.error('Failed to load bundled database:', bundledErr);
        return;
      }

      console.warn('Bundled database unavailable, trying dev server:', bundledErr);
      try {
        await loadDevDatabase();
        console.log('Dev server database loaded');
      } catch (devErr) {
        console.error('Failed to load database:', devErr);
        // Don't throw — app can still work with detection-only mode
      }
    }
  })();

  return dbLoadingPromise;
}
