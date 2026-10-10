import { expect, it } from 'vitest';
import { replayDiagnosticExport } from '../../scripts/solver/replay';
import { createDiagnosticHistory } from '../../src/app/diagnostic-history';
import { createBoard, editCell } from '../../src/board/board';
import { oracle } from './oracle';

it('replays a real exported observation with its effective flag policy and original node budget', () => {
  const history = createDiagnosticHistory();
  history.setEnabled(true);
  const board = editCell(editCell(createBoard(3, 1, 1, 0), 0, 0), 1, 'flag');
  history.start({ kind: 'solve', requestId: 1, revision: board.revision, board,
    policy: 'reconsidered', options: { maxNodes: 200_000 } }, { policy: 'trusted', autoReconsider: true });
  history.finish({ requestId: 1, revision: board.revision, outcome: 'solved', elapsedMs: 12,
    timeoutMs: 5000, statistics: null, statisticsSource: 'unavailable', error: null });
  const replay = replayDiagnosticExport(JSON.parse(history.exportJson({ version: 'test', commit: 'abc', dirty: false })), 0);
  expect(replay.result).toEqual(oracle(board, 'reconsidered'));
  expect(replay).toMatchObject({ entryIndex: 0, originalOutcome: 'solved', effectivePolicy: 'reconsidered',
    maxNodes: 200_000, workerTimeoutReproduced: false, statistics: { visitedNodes: 0, components: [] } });
});

it('reproduces node exhaustion without promoting an incomplete result to a proposal', () => {
  const board = editCell(createBoard(3, 1, 1, 0), 1, 1);
  const replay = replayDiagnosticExport({ schemaVersion: 1, entries: [{ board, effectivePolicy: 'trusted', maxNodes: 1,
    outcome: 'node-budget' }] }, 0);
  expect(replay.result).toEqual({ status: 'limit-reached', reason: 'node-budget' });
  expect(replay.statistics).toMatchObject({ visitedNodes: 1, components: [{ status: 'limit-reached' }] });
});

it.each([
  { schemaVersion: 2, entries: [] },
  { schemaVersion: 1, entries: [] },
  { schemaVersion: 1, entries: [{ board: createBoard(1, 1, 0, 0), effectivePolicy: 'trusted', maxNodes: -1 }] },
  { schemaVersion: 1, entries: [{ board: { ...createBoard(1, 1, 0, 0), cells: [{ value: 'code', source: 'manual', uncertain: false }] }, effectivePolicy: 'trusted', maxNodes: 1 }] },
])('rejects incompatible or malformed reproduction input %#', input => {
  expect(() => replayDiagnosticExport(input, 0)).toThrow();
});
