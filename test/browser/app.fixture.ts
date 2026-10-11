import { mountApp } from '../../src/app/app';
import type { SolverWorkerPort } from '../../src/app/solver-client';
import { solve } from '../../src/solver/solve';
import '../../src/app/style.css';
const mode = new URLSearchParams(location.search).get('mode');
let count = 0;
const root = document.querySelector<HTMLElement>('#app')!;
root.dataset.solverRuns = '0';
mountApp(root, {
  timeoutMs: mode === 'limit' ? 50 : 1500,
  workerFactory: () => {
    const sequence = ++count;
    root.dataset.solverRuns = String(count);
    const worker: SolverWorkerPort = {
      onmessage: null, onerror: null, onmessageerror: null,
      terminate() {}, // Deliberately keep late events to exercise stale-result handling.
      postMessage(request) {
        if (mode === 'limit') return;
        if (mode === 'error') { setTimeout(() => worker.onerror?.(new ErrorEvent('error', { message: 'Injected test error' })), 10); return; }
        const result = mode === 'history' && request.board.width === 3 && request.board.height === 1
          && request.board.totalMines === 1 && request.board.cells[0]?.value === 1
          ? { status: 'limit-reached' as const, reason: 'node-budget' as const }
          : solve(request.board, request.options);
        const respond = () => worker.onmessage?.(new MessageEvent('message', { data: { kind: 'result', requestId: request.requestId, revision: request.revision, result } }));
        if (mode === 'draft' && sequence > 1) root.addEventListener('release-solver-result', respond, { once: true });
        else setTimeout(respond, mode === 'stability' ? 80 : mode === 'history' || mode === 'draft' ? 5 : sequence <= 2 ? 400 : 5);
      },
    };
    return worker;
  },
});
