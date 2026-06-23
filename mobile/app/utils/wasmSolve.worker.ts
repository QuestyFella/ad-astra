/**
 * Persistent Web Worker for non-blocking WASM plate solves on web.
 * Initializes WASM once, prepares the catalog once, then reuses both for
 * subsequent solve requests until the worker is terminated.
 */

import { loadWasmModule, type WasmModule } from '../wasm/loadWasm';

type InitMessage = {
  type: 'init';
  dbBytes: Uint8Array;
};

type SolveMessage = {
  type: 'solve';
  id: number;
  requestJson: string;
  imageWidth: number;
  imageHeight: number;
};

type WorkerInbound = InitMessage | SolveMessage;

type ReadyMessage = { type: 'ready' };

type ErrorMessage = {
  type: 'error';
  error: string;
};

type SolveResultMessage = {
  type: 'solveResult';
  id: number;
  ok: true;
  result: string;
} | {
  type: 'solveResult';
  id: number;
  ok: false;
  error: string;
};

type WorkerOutbound = ReadyMessage | ErrorMessage | SolveResultMessage;

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerInbound>) => void) | null;
  postMessage: (message: WorkerOutbound) => void;
};

let wasmModule: WasmModule | null = null;
let isDatabasePrepared = false;

async function ensureWasmReady(): Promise<WasmModule> {
  if (!wasmModule) {
    wasmModule = await loadWasmModule();
  }
  return wasmModule;
}

async function prepareDatabase(dbBytes: Uint8Array): Promise<void> {
  const module = await ensureWasmReady();

  if (typeof module.prepare_database !== 'function') {
    isDatabasePrepared = true;
    return;
  }

  const prep = JSON.parse(module.prepare_database(dbBytes));
  if (prep.success === false) {
    throw new Error((prep.log || ['Failed to prepare database'])[0]);
  }

  isDatabasePrepared = true;
}

async function runSolve(
  requestJson: string,
  imageWidth: number,
  imageHeight: number,
): Promise<string> {
  const module = await ensureWasmReady();

  if (!isDatabasePrepared || typeof module.solve_loaded !== 'function') {
    throw new Error('Worker database not prepared');
  }

  return module.solve_loaded(requestJson, imageWidth, imageHeight);
}

workerScope.onmessage = async (event: MessageEvent<WorkerInbound>) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      isDatabasePrepared = false;
      await prepareDatabase(message.dbBytes);
      workerScope.postMessage({ type: 'ready' });
    } catch (err) {
      workerScope.postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (message.type === 'solve') {
    const { id, requestJson, imageWidth, imageHeight } = message;
    try {
      if (!isDatabasePrepared) {
        throw new Error('Worker database not prepared');
      }

      const result = await runSolve(
        requestJson,
        imageWidth,
        imageHeight,
      );
      workerScope.postMessage({ type: 'solveResult', id, ok: true, result });
    } catch (err) {
      workerScope.postMessage({
        type: 'solveResult',
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

export {};
