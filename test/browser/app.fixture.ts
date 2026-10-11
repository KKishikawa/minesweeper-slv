import { mountApp } from '../../src/app/app';
import type { SolverWorkerPort } from '../../src/app/solver-client';
import { solve } from '../../src/solver/solve';
import '../../src/app/style.css';
const mode = new URLSearchParams(location.search).get('mode');
let count = 0;
mountApp(document.querySelector('#app')!, {
  timeoutMs: mode === 'limit' ? 50 : 1500,
  workerFactory: () => {
    const sequence = ++count;
    const worker: SolverWorkerPort = {
      onmessage: null, onerror: null, onmessageerror: null,
      terminate() {}, // Deliberately keep late events to exercise stale-result handling.
      postMessage(request) {
        if (mode === 'limit') return;
        if (mode === 'error') { setTimeout(() => worker.onerror?.(new ErrorEvent('error', { message: 'Injected test error' })), 10); return; }
        const result = solve(request.board, request.options);
        setTimeout(() => worker.onmessage?.(new MessageEvent('message', { data: { kind: 'result', requestId: request.requestId, revision: request.revision, result } })), mode === 'stability' ? 80 : sequence <= 2 ? 400 : 5);
      },
    };
    return worker;
  },
});
