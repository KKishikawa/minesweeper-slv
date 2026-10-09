import type { SolverRequest, SolverResponse } from '../workers/protocol.js';

export interface SolverWorkerPort {
  postMessage(request: SolverRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}
export interface SolverClientOptions {
  workerFactory: () => SolverWorkerPort;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProposal(value: unknown, request: SolverRequest, status: 'solved' | 'guess-required'): boolean {
  if (!isRecord(value) || !Array.isArray(value.safe) || !Array.isArray(value.mines) || !Array.isArray(value.guesses)) return false;
  const arrays = [value.safe, value.mines, value.guesses];
  const cellCount = request.board.cells.length;
  if (!arrays.every(array => array.every((index, position) => Number.isInteger(index)
    && index >= 0 && index < cellCount && (position === 0 || index > array[position - 1])))) return false;
  const indexes = arrays.flat();
  if (new Set(indexes).size !== indexes.length) return false;
  if (request.policy === 'trusted' && indexes.some(index => request.board.cells[index]?.value === 'flag')) return false;
  if (status === 'solved') return value.guesses.length === 0 && value.primaryGuess === null;
  return value.safe.length === 0 && value.mines.length === 0 && value.guesses.length > 0
    && value.primaryGuess === value.guesses[0];
}

function isResponse(value: unknown, request: SolverRequest): value is SolverResponse {
  if (!isRecord(value) || !Number.isInteger(value.requestId) || !Number.isInteger(value.revision)) return false;
  if (value.kind === 'error') return typeof value.message === 'string' && !('proposal' in value) && !('result' in value);
  if (value.kind !== 'result' || !isRecord(value.result)) return false;
  const result = value.result;
  if (result.status === 'inconsistent' || result.status === 'limit-reached') return !('proposal' in result);
  if (result.status === 'solved' || result.status === 'guess-required') return isProposal(result.proposal, request, result.status);
  return false;
}

function isEnvelope(value: unknown): value is { kind: 'result' | 'error'; requestId: number; revision: number } {
  return isRecord(value) && (value.kind === 'result' || value.kind === 'error')
    && Number.isInteger(value.requestId) && Number.isInteger(value.revision);
}

export function createSolverClient(onResponse: (response: SolverResponse) => void, options: SolverClientOptions):
  { run(request: SolverRequest): void; cancel(): void; dispose(): void } {
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be a positive finite number');
  let current: { worker: SolverWorkerPort | null; timer: ReturnType<typeof setTimeout> | null; request: SolverRequest } | null = null;
  let disposed = false;
  function cancel(): void {
    if (!current) return;
    if (current.timer !== null) clearTimeout(current.timer);
    current.worker?.terminate();
    current = null;
  }
  function finish(request: SolverRequest, response: SolverResponse): void {
    if (!current || current.request !== request || disposed) return;
    cancel();
    onResponse(response);
  }
  function error(request: SolverRequest, message: string): void {
    finish(request, { kind: 'error', requestId: request.requestId, revision: request.revision, message });
  }
  return {
    run(request) {
      if (disposed) throw new Error('Solver client is disposed');
      cancel();
      current = { worker: null, timer: null, request };
      try {
        const worker = options.workerFactory();
        if (!current || current.request !== request) { worker.terminate(); return; }
        current.worker = worker;
        worker.onmessage = event => {
          if (!current || current.request !== request) return;
          if (!isEnvelope(event.data)) { error(request, 'Workerからの応答が不正です'); return; }
          if (event.data.requestId !== request.requestId || event.data.revision !== request.revision) return;
          if (!isResponse(event.data, request)) { error(request, 'Workerからの応答が不正です'); return; }
          finish(request, event.data);
        };
        worker.onerror = event => error(request, event.message || 'Workerの実行に失敗しました');
        worker.onmessageerror = () => error(request, 'Workerメッセージを読み取れません');
        current.timer = setTimeout(() => finish(request, { kind: 'result', requestId: request.requestId,
          revision: request.revision, result: { status: 'limit-reached' } }), timeoutMs);
        worker.postMessage(request);
      } catch (cause) {
        error(request, cause instanceof Error ? cause.message : String(cause));
      }
    },
    cancel,
    dispose() { cancel(); disposed = true; },
  };
}

export function createModuleSolverWorker(): SolverWorkerPort {
  return new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' });
}
