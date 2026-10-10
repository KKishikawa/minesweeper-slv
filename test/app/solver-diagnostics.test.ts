import { afterEach, expect, it, vi } from 'vitest';
import { createBoard } from '../../src/board/board';
import { createSolverClient } from '../../src/app/solver-client';
import type { SolverRunDiagnostic, SolverWorkerPort } from '../../src/app/solver-client';
import type { SolverRequest, SolverResponse } from '../../src/workers/protocol';

afterEach(() => vi.useRealTimers());
const request = (id: number): SolverRequest => ({ kind: 'solve', requestId: id, revision: id,
  board: createBoard(2, 1, 1, id), policy: 'trusted', options: { maxNodes: 4 }, diagnostics: true });
const worker = (): SolverWorkerPort => ({ postMessage() {}, terminate() {}, onmessage: null, onerror: null, onmessageerror: null });
const statistics = { stage: 'enumeration' as const, elapsedMs: 12, visitedNodes: 4,
  components: [{ cells: 2, constraints: 1, visitedNodes: 4, status: 'limit-reached' as const }] };

it('classifies node budget, timeout with checkpoint, Worker error and cancellation independently', () => {
  vi.useFakeTimers();
  const events: SolverRunDiagnostic[] = [];
  const responses: SolverResponse[] = [];
  const workers = Array.from({ length: 4 }, worker);
  const client = createSolverClient(response => responses.push(response), {
    workerFactory: () => workers.shift()!, timeoutMs: 50, onDiagnostic: event => events.push(event),
  });
  const ports = [...workers];
  client.run(request(1));
  ports[0]!.onmessage?.({ data: { kind: 'result', requestId: 1, revision: 1,
    result: { status: 'limit-reached', reason: 'node-budget' }, statistics } } as MessageEvent);
  client.run(request(2));
  ports[1]!.onmessage?.({ data: { kind: 'progress', requestId: 2, revision: 2, statistics } } as MessageEvent);
  expect(responses).toHaveLength(1);
  vi.advanceTimersByTime(50);
  client.run(request(3));
  ports[2]!.onerror?.({ message: 'broken' } as ErrorEvent);
  client.run(request(4));
  client.cancel();
  ports[3]!.onmessage?.({ data: { kind: 'result', requestId: 4, revision: 4, result: { status: 'inconsistent' } } } as MessageEvent);
  expect(events.map(event => event.outcome)).toEqual(['node-budget', 'timeout', 'worker-error', 'cancelled']);
  expect(events[0]).toMatchObject({ statisticsSource: 'final', statistics });
  expect(events[1]).toMatchObject({ elapsedMs: 50, timeoutMs: 50, statisticsSource: 'checkpoint', statistics });
  expect(events[2]).toMatchObject({ error: 'broken', statistics: null, statisticsSource: 'unavailable' });
  expect(responses).toHaveLength(3);
  expect(responses[1]).toMatchObject({ result: { status: 'limit-reached', reason: 'timeout' } });
  client.dispose();
});

it('ignores stale statistics and does not record requests that did not opt in', () => {
  const port = worker();
  const events: SolverRunDiagnostic[] = [];
  const responses: SolverResponse[] = [];
  const client = createSolverClient(response => responses.push(response), { workerFactory: () => port,
    onDiagnostic: event => events.push(event) });
  client.run(request(1));
  port.onmessage?.({ data: { kind: 'progress', requestId: 0, revision: 0, statistics } } as MessageEvent);
  port.onmessage?.({ data: { kind: 'result', requestId: 1, revision: 1, result: { status: 'inconsistent' } } } as MessageEvent);
  expect(events[0]).toMatchObject({ statistics: null, statisticsSource: 'unavailable' });
  client.run({ ...request(2), diagnostics: false });
  port.onmessage?.({ data: { kind: 'result', requestId: 2, revision: 2, result: { status: 'inconsistent' } } } as MessageEvent);
  expect(events).toHaveLength(1);
  expect(responses).toHaveLength(2);
  client.dispose();
});

it('rejects malformed diagnostic messages without exposing a proposal', () => {
  const port = worker();
  const responses: SolverResponse[] = [];
  const client = createSolverClient(response => responses.push(response), { workerFactory: () => port });
  client.run(request(1));
  port.onmessage?.({ data: { kind: 'progress', requestId: 1, revision: 1,
    statistics: { ...statistics, visitedNodes: -1 } } } as MessageEvent);
  expect(responses[0]).toMatchObject({ kind: 'error' });
  expect(responses[0]).not.toHaveProperty('proposal');
  client.dispose();
});

it('marks statistics attached to a Worker exception as a checkpoint rather than final counts', () => {
  const port = worker();
  const events: SolverRunDiagnostic[] = [];
  const client = createSolverClient(() => {}, { workerFactory: () => port, onDiagnostic: event => events.push(event) });
  client.run(request(1));
  port.onmessage?.({ data: { kind: 'error', requestId: 1, revision: 1, message: 'exception', statistics } } as MessageEvent);
  expect(events[0]).toMatchObject({ outcome: 'worker-error', statistics, statisticsSource: 'checkpoint' });
  client.dispose();
});
