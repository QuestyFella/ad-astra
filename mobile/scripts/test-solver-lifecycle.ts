/**
 * Bridge/lifecycle tests for worker generation settlement and solve timeouts.
 *
 * Run with:
 *   cd mobile && npx tsx scripts/test-solver-lifecycle.ts
 */

import {
  bumpWorkerGeneration,
  isWorkerGenerationCurrent,
  shouldResetWorkerOnAbort,
  withSolveTimeout,
} from '../app/utils/solverLifecycle';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Solver Lifecycle Tests\n');

  await runTest('bumpWorkerGeneration invalidates captured init tokens', () => {
    let generation = 0;
    const captured = generation;
    assert(isWorkerGenerationCurrent(captured, generation), 'token should start current');

    generation = bumpWorkerGeneration(generation);
    assert(!isWorkerGenerationCurrent(captured, generation), 'stale token must not settle');
    assert(isWorkerGenerationCurrent(generation, generation), 'fresh token should settle');
  });

  await runTest('reset during init rejects stale ready handlers', () => {
    let generation = 0;
    const initToken = generation;

    const onReady = (): boolean => isWorkerGenerationCurrent(initToken, generation);
    assert(onReady(), 'ready should settle before reset');

    generation = bumpWorkerGeneration(generation);
    assert(!onReady(), 'terminated worker ready must not settle init promise');
  });

  await runTest('shouldResetWorkerOnAbort only during initialization', () => {
    assert(shouldResetWorkerOnAbort('initializing'), 'init abort tears down worker');
    assert(!shouldResetWorkerOnAbort('ready'), 'prepared worker stays warm on solve abort');
    assert(!shouldResetWorkerOnAbort('none'), 'idle worker needs no terminate');
  });

  await runTest('withSolveTimeout rejects and invokes onTimeout', async () => {
    let timedOut = false;
    const slow = delay(80).then(() => 'late');

    await withSolveTimeout(slow, 15, () => {
      timedOut = true;
    }).then(
      () => {
        throw new Error('expected timeout rejection');
      },
      (err: Error) => {
        assert(timedOut, 'onTimeout callback was not invoked');
        assert(err.message.includes('timed out after 15ms'), `unexpected error: ${err.message}`);
      },
    );
  });

  await runTest('withSolveTimeout passes through fast resolves', async () => {
    let timedOut = false;
    const value = await withSolveTimeout(Promise.resolve('ok'), 50, () => {
      timedOut = true;
    });
    assert(value === 'ok', `expected ok, got ${value}`);
    assert(!timedOut, 'fast resolve should not trigger timeout');
  });

  await runTest('withSolveTimeout skips timer when budget disabled', async () => {
    let timedOut = false;
    const value = await withSolveTimeout(Promise.resolve(42), 0, () => {
      timedOut = true;
    });
    assert(value === 42, `expected 42, got ${value}`);
    assert(!timedOut, 'zero timeout should not arm a timer');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
