import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../../src/board/board.js';
import { createSolverClient } from '../../src/app/solver-client.js';
import type { SolverWorkerPort } from '../../src/app/solver-client.js';
import type { SolverRequest, SolverResponse } from '../../src/workers/protocol.js';

function fakeWorker(): SolverWorkerPort & { terminated: boolean } {
  return { terminated: false, postMessage: vi.fn(), terminate() { this.terminated = true; },
    onmessage: null, onerror: null, onmessageerror: null };
}
const request = (id: number): SolverRequest => ({ kind: 'solve', requestId: id, revision: id,
  board: createBoard(2, 1, 1, id), policy: 'trusted', options: { maxNodes: 200_000 } });
const result = (id: number): SolverResponse => ({ kind: 'result', requestId: id, revision: id, result: { status: 'inconsistent' } });

describe('solver client', () => {
  afterEach(() => vi.useRealTimers());
  it('新requestは前Workerを終了し古い成功・errorを通知しない', () => {
    const old = fakeWorker();
    const workers = [old, fakeWorker()];
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => workers.shift()! });
    client.run(request(1));
    client.run(request(2));
    expect(old.terminated).toBe(true);
    old.onmessage?.({ data: result(1) } as MessageEvent);
    old.onerror?.({ message: 'old' } as ErrorEvent);
    expect(received).toEqual([]);
  });

  it('別IDの応答を無視してタイムアウト監視を続ける', () => {
    vi.useFakeTimers();
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => worker, timeoutMs: 50 });
    client.run(request(1));
    worker.onmessage?.({ data: result(2) } as MessageEvent);
    vi.advanceTimersByTime(50);
    expect(received).toEqual([{ kind: 'result', requestId: 1, revision: 1, result: { status: 'limit-reached', reason: 'timeout' } }]);
    expect(worker.terminated).toBe(true);
  });
  it('旧盤面では範囲内の別ID応答を現盤面検査前に無視し監視を続ける', () => {
    vi.useFakeTimers();
    const oldWorker = fakeWorker();
    const worker = fakeWorker();
    const workers = [oldWorker, worker];
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => workers.shift()!, timeoutMs: 50 });
    client.run({ ...request(0), board: createBoard(3, 1, 1, 0) });
    client.run({ ...request(1), board: createBoard(1, 1, 0, 1) });
    expect(oldWorker.terminated).toBe(true);
    worker.onmessage?.({ data: { kind: 'result', requestId: 0, revision: 0,
      result: { status: 'solved', proposal: { safe: [2], mines: [], guesses: [], primaryGuess: null } } } } as MessageEvent);
    expect(received).toEqual([]);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(50);
    expect(received).toEqual([{ kind: 'result', requestId: 1, revision: 1, result: { status: 'limit-reached', reason: 'timeout' } }]);
  });
  it('現requestの不正envelopeはerrorへ変換する', () => {
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    createSolverClient(response => received.push(response), { workerFactory: () => worker }).run(request(1));
    worker.onmessage?.({ data: { kind: 'result', requestId: '1', revision: 1, result: { status: 'inconsistent' } } } as MessageEvent);
    expect(received[0]).toMatchObject({ kind: 'error', requestId: 1, revision: 1 });
  });

  it('不正応答とmessageerrorをerrorに変換する', () => {
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => worker });
    client.run(request(1));
    worker.onmessage?.({ data: { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved' } } } as MessageEvent);
    expect(received[0]).toMatchObject({ kind: 'error', requestId: 1, revision: 1 });
    expect(worker.terminated).toBe(true);
  });

  it('cancelとdisposeの後は通知せずdispose後のrunを拒否する', () => {
    vi.useFakeTimers();
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => worker, timeoutMs: 5 });
    client.run(request(1));
    client.cancel();
    worker.onmessage?.({ data: result(1) } as MessageEvent);
    vi.advanceTimersByTime(5);
    expect(received).toEqual([]);
    client.dispose();
    expect(() => client.run(request(2))).toThrow();
  });

  it('factory例外とpostMessage例外を現requestのerrorに変換する', () => {
    const received: SolverResponse[] = [];
    createSolverClient(response => received.push(response), { workerFactory: () => { throw Error('factory'); } }).run(request(1));
    const worker = fakeWorker();
    worker.postMessage = () => { throw Error('post'); };
    createSolverClient(response => received.push(response), { workerFactory: () => worker }).run(request(2));
    expect(received.map(response => response.requestId)).toEqual([1, 2]);
    expect(received.every(response => response.kind === 'error')).toBe(true);
  });
  it('端末応答は通知前にWorkerを終了し二重通知しない', () => {
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => { expect(worker.terminated).toBe(true); received.push(response); }, { workerFactory: () => worker });
    client.run(request(1));
    worker.onmessage?.({ data: result(1) } as MessageEvent);
    worker.onmessage?.({ data: result(1) } as MessageEvent);
    expect(received).toEqual([result(1)]);
  });
  it.each([
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [2], mines: [], guesses: [], primaryGuess: null } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [0, 0], mines: [], guesses: [], primaryGuess: null } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [1, 0], mines: [], guesses: [], primaryGuess: null } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [0], mines: [0], guesses: [], primaryGuess: null } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [0], mines: [], guesses: [1], primaryGuess: 1 } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'guess-required', proposal: { safe: [], mines: [], guesses: [0], primaryGuess: 1 } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'guess-required', proposal: { safe: [0], mines: [], guesses: [1], primaryGuess: 1 } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'guess-required', proposal: { safe: [], mines: [], guesses: [], primaryGuess: null } } },
    { kind: 'error', requestId: 1, revision: 1, message: 'bad', proposal: { safe: [0] } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'limit-reached', proposal: { safe: [0] } } },
    { kind: 'result', requestId: 1, revision: 1, result: { status: 'inconsistent', proposal: { safe: [0] } } },
  ])('契約違反のproposalまたは応答をerrorへ変換する %#', data => {
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => worker });
    client.run(request(1));
    worker.onmessage?.({ data } as MessageEvent);
    expect(received[0]).toMatchObject({ kind: 'error', requestId: 1, revision: 1 });
  });
  it('trustedの入力旗を提案対象に含めない', () => {
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const client = createSolverClient(response => received.push(response), { workerFactory: () => worker });
    const flagged = { ...request(1), board: { ...createBoard(2, 1, 1, 1), cells: [
      { value: 'flag' as const, source: 'manual' as const, uncertain: false },
      { value: 'closed' as const, source: 'manual' as const, uncertain: false },
    ] } };
    client.run(flagged);
    worker.onmessage?.({ data: { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [0], mines: [], guesses: [], primaryGuess: null } } } } as MessageEvent);
    expect(received[0]?.kind).toBe('error');
  });
  it('契約どおりの確定手と推測は結果として受け付ける', () => {
    for (const proposal of [
      { status: 'solved', proposal: { safe: [0], mines: [1], guesses: [], primaryGuess: null } },
      { status: 'guess-required', proposal: { safe: [], mines: [], guesses: [0, 1], primaryGuess: 0 } },
    ]) {
      const worker = fakeWorker();
      const received: SolverResponse[] = [];
      createSolverClient(response => received.push(response), { workerFactory: () => worker }).run(request(1));
      worker.onmessage?.({ data: { kind: 'result', requestId: 1, revision: 1, result: proposal } } as MessageEvent);
      expect(received[0]?.kind).toBe('result');
    }
  });
  it('reconsideredでは入力旗も提案対象にできる', () => {
    const worker = fakeWorker();
    const received: SolverResponse[] = [];
    const flagged = { ...request(1), policy: 'reconsidered' as const, board: { ...createBoard(2, 1, 1, 1), cells: [
      { value: 'flag' as const, source: 'manual' as const, uncertain: false },
      { value: 'closed' as const, source: 'manual' as const, uncertain: false },
    ] } };
    createSolverClient(response => received.push(response), { workerFactory: () => worker }).run(flagged);
    worker.onmessage?.({ data: { kind: 'result', requestId: 1, revision: 1, result: { status: 'solved', proposal: { safe: [0], mines: [], guesses: [], primaryGuess: null } } } } as MessageEvent);
    expect(received[0]?.kind).toBe('result');
  });
  it.each([0, -1, NaN, Infinity])('不正なtimeout %sを拒否する', timeoutMs => {
    expect(() => createSolverClient(() => {}, { workerFactory: fakeWorker, timeoutMs })).toThrow(RangeError);
  });
});
