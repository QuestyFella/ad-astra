import { NativeModules, Platform } from 'react-native';

const { AdAstraSolver } = NativeModules;

export interface PingResult {
  ok: boolean;
  message: string;
}

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
  return AdAstraSolver.loadDatabase(path);
}

export async function solvePlate(
  sourcesJson: string,
  imageWidth: number,
  imageHeight: number,
): Promise<string> {
  return AdAstraSolver.solveSources(sourcesJson, imageWidth, imageHeight);
}

export async function unloadDatabase(): Promise<string> {
  return AdAstraSolver.unloadDatabase();
}
