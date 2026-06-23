export type WasmWorkerState = 'none' | 'initializing' | 'ready';

export function bumpWorkerGeneration(generation: number): number {
  return generation + 1;
}

export function isWorkerGenerationCurrent(captured: number, current: number): boolean {
  return captured === current;
}

/**
 * Worker termination on abort is reserved for catalog preparation;
 * a prepared worker stays warm after solve cancel/timeout.
 */
export function shouldResetWorkerOnAbort(state: WasmWorkerState): boolean {
  return state === 'initializing';
}

export function withSolveTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  onTimeout: () => void,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`Solve timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
