import { expect, it } from 'vitest';
import { createDiagnosticHistory } from '../../src/app/diagnostic-history';
import { createBoard } from '../../src/board/board';
import type { SolverRequest } from '../../src/workers/protocol';

const request = (id: number): SolverRequest => ({ kind: 'solve', requestId: id, revision: id,
  board: createBoard(2, 1, 1, id), policy: 'reconsidered', options: { maxNodes: 200_000 } });
const context = { policy: 'trusted' as const, autoReconsider: true };
const terminal = (id: number) => ({ requestId: id, revision: id, outcome: 'cancelled' as const,
  elapsedMs: 15, timeoutMs: 5000, statistics: null, statisticsSource: 'unavailable' as const, error: null });

it('records only runs started while enabled and keeps finished history after disabling', () => {
  const history = createDiagnosticHistory();
  history.start(request(1), context);
  history.setEnabled(true);
  history.finish(terminal(1));
  expect(history.entries()).toEqual([]);
  const original = request(2);
  history.start(original, context);
  // A caller must not be able to replace the observations captured for reproduction.
  (original.board as { totalMines: number }).totalMines = 0;
  history.finish(terminal(2));
  history.setEnabled(false);
  history.start(request(3), context);
  history.finish(terminal(3));
  const exported = JSON.parse(history.exportJson({ version: 'test', commit: 'abc', dirty: false }));
  expect(exported).toMatchObject({ schemaVersion: 1, build: { version: 'test', commit: 'abc', dirty: false },
    entries: [{ requestId: 2, revision: 2, board: { totalMines: 1 }, policy: 'trusted',
      effectivePolicy: 'reconsidered', autoReconsider: true, maxNodes: 200_000,
      outcome: 'cancelled', elapsedMs: 15, timeoutMs: 5000, statistics: null, statisticsSource: 'unavailable' }] });
  expect(exported.entries).toHaveLength(1);
  expect(exported.entries[0]).not.toHaveProperty('proposal');
});

it('bounds history to 100 started runs, clears in-flight tracking and ignores duplicate finishes', () => {
  const history = createDiagnosticHistory();
  history.setEnabled(true);
  for (let id = 1; id <= 101; id++) { history.start(request(id), context); history.finish(terminal(id)); }
  expect(history.entries()).toHaveLength(100);
  expect(history.entries()[0]!.requestId).toBe(2);
  history.finish(terminal(101));
  expect(history.entries()).toHaveLength(100);
  history.start(request(102), context);
  history.clear();
  history.finish(terminal(102));
  expect(history.entries()).toEqual([]);
  history.start(request(103), context);
  history.setEnabled(false);
  history.finish(terminal(103));
  expect(history.entries()).toEqual([]);
});
