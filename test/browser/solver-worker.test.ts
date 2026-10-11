import { afterAll, beforeAll, expect, it } from 'vitest';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';
let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });
it('runs the real worker with fixed flags and stops on contradictions', async () => {
  const page = await harness.browser.newPage();
  await page.goto(harness.baseUrl);
  const result = await page.evaluate(async () => {
    const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>;
    const { createBoard, editCell } = await load('/src/board/board.ts');
    const { createAppState, transition } = await load('/src/app/state.ts');
    const { createSolverClient, createModuleSolverWorker } = await load('/src/app/solver-client.ts');
    async function run(board: unknown) {
      let state = createAppState(board);
      return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => { client.dispose(); reject(new Error('Worker did not finish')); }, 3000);
        const client = createSolverClient((response: unknown) => apply({ type: 'response', response }), { workerFactory: createModuleSolverWorker });
        function apply(action: unknown) {
          const next = transition(state, action);
          state = next.state;
          for (const effect of next.effects) effect.type === 'cancel' ? client.cancel() : client.run(effect.request);
          if (state.phase !== 'solving') { clearTimeout(timer); client.dispose(); resolve(state); }
        }
        apply({ type: 'solve' });
      });
    }
    const flagged = editCell(editCell(createBoard(3, 1, 1, 0), 0, 0), 1, 'flag');
    return {
      guess: await run(createBoard(2, 1, 1, 0)),
      fixed: await run(editCell(editCell(createBoard(3, 1, 1, 0), 1, 1), 0, 'flag')),
      trusted: await run(flagged),
      impossible: await run(editCell(createBoard(3, 1, 2, 0), 1, 1)),
    };
  });
  expect(result.guess.phase).toBe('guess-required');
  expect(result.guess.proposal.guesses).toEqual([0, 1]);
  expect(result.fixed.proposal).toEqual({ safe: [2], mines: [], guesses: [], primaryGuess: null });
  expect(result.fixed.board.cells[0].value).toBe('flag');
  expect(result.trusted.phase).toBe('inconsistent');
  expect(result.impossible.phase).toBe('inconsistent');
  expect(result.impossible.nextRequestId).toBe(2);
  await page.close();
});
it('ignores malformed and legacy policy requests then accepts a new request on the same worker', async () => {
  const page = await harness.browser.newPage();
  await page.goto(harness.baseUrl);
  const response = await page.evaluate(async () => {
    const path = '/src/app/solver-client.ts';
    const { createModuleSolverWorker } = await (new Function('path', 'return import(path)'))(path);
    const worker = createModuleSolverWorker();
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('No response')); }, 3000);
      worker.onmessage = (event: MessageEvent) => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
      worker.postMessage({ kind: 'solve', requestId: 99 });
      const request = { kind: 'solve', requestId: 1, revision: 0, options: { maxNodes: 0 }, board: {
        width: 1, height: 1, totalMines: 0, revision: 0, cells: [{ value: 'closed', source: 'manual', uncertain: false }],
      } };
      worker.postMessage({ ...request, requestId: 2, policy: 'trusted' });
      worker.postMessage({ ...request, requestId: 3, policy: 'reconsidered' });
      worker.postMessage({ ...request, requestId: 4, policy: undefined });
      worker.postMessage(request);
    });
  });
  expect(response).toEqual({ kind: 'result', requestId: 1, revision: 0, result: { status: 'limit-reached', reason: 'node-budget' } });
  await page.close();
});

it('receives checkpoints and exact node-exhaustion statistics from the real Worker', async () => {
  const page = await harness.browser.newPage();
  await page.goto(harness.baseUrl);
  const output = await page.evaluate(async () => {
    const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>;
    const { createBoard, editCell } = await load('/src/board/board.ts');
    const { createModuleSolverWorker } = await load('/src/app/solver-client.ts');
    const board = editCell(editCell(createBoard(7, 1, 2, 0), 1, 1), 5, 1);
    const worker = createModuleSolverWorker();
    return new Promise<any>((resolve, reject) => {
      const checkpoints: unknown[] = [];
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('No terminal diagnostic')); }, 3000);
      worker.onmessage = (event: MessageEvent) => {
        if (event.data.kind === 'progress') { checkpoints.push(event.data); return; }
        clearTimeout(timer); worker.terminate(); resolve({ checkpoints, terminal: event.data });
      };
      worker.postMessage({ kind: 'solve', requestId: 1, revision: board.revision, board,
        options: { maxNodes: 4 }, diagnostics: true });
    });
  });
  expect(output.checkpoints[0]).toMatchObject({ kind: 'progress', statistics: { stage: 'validation', visitedNodes: 0 } });
  expect(output.terminal).toMatchObject({ result: { status: 'limit-reached', reason: 'node-budget' },
    statistics: { visitedNodes: 4, components: [{ cells: 2, visitedNodes: 4, status: 'limit-reached' }, { status: 'pending' }] } });
  expect(output.terminal.result).not.toHaveProperty('proposal');
  await page.close();
});
