import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  parseNativeSolveResponse,
  type NativeDetectedStar,
  type NativeMatchedStarPosition,
  type NativePlateSolveResult,
} from './parseNativeSolveResponse';

export {
  parseNativeSolveResponse,
  type NativeDetectedStar,
  type NativeMatchedStarPosition,
  type NativePlateSolveResult,
};
interface AdAstraSolverModule {
  ping(): Promise<string>;
  loadDatabase(path: string): Promise<string>;
  solveSources(sourcesJson: string, imageWidth: number, imageHeight: number): Promise<string>;
  unloadDatabase(): Promise<string>;
}

const AdAstraSolver = Platform.OS === 'android'
  ? requireOptionalNativeModule<AdAstraSolverModule>('AdAstraSolver')
  : null;

export interface PingResult {
  ok: boolean;
  message: string;
}

export type NativeEnvelope = 'ffi_error' | 'solve_result';

export function isNativeAvailable(): boolean {
  return Platform.OS === 'android' && AdAstraSolver != null;
}

export async function ping(): Promise<PingResult> {
  try {
    if (!AdAstraSolver) {
      return { ok: false, message: 'Native module not available' };
    }
    const result: string = await AdAstraSolver.ping();
    return { ok: result.startsWith('ad_astra_native_ok'), message: result };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

export async function loadDatabase(path: string): Promise<string> {
  if (!AdAstraSolver) {
    throw new Error('Native module not available');
  }
  return AdAstraSolver.loadDatabase(path);
}

export async function solvePlate(
  sourcesJson: string,
  imageWidth: number,
  imageHeight: number,
): Promise<NativePlateSolveResult> {
  if (!AdAstraSolver) {
    throw new Error('Native module not available');
  }
  const raw = await AdAstraSolver.solveSources(sourcesJson, imageWidth, imageHeight);
  return parseNativeSolveResponse(raw);
}

export async function unloadDatabase(): Promise<string> {
  if (!AdAstraSolver) {
    throw new Error('Native module not available');
  }
  return AdAstraSolver.unloadDatabase();
}
