import { describe, expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board.js';
import { appendBoardHistory, createBoardHistory, moveBoardHistory, recordHistoryResult, restorableHistoryResult } from '../../src/app/board-history.js';
import type { HistoryResult } from '../../src/app/board-history.js';

const success = (): HistoryResult => ({ phase: 'solved', validation: { status: 'valid' },
  proposal: { safe: [0], mines: [1], guesses: [], primaryGuess: null }, message: null });

describe('board history', () => {
  it('現在を含む直近100盤面を保持し、両端の移動はno-opになる', () => {
    let history = createBoardHistory(createBoard(2, 1, 1, 0));
    expect(moveBoardHistory(history, -1)).toBe(history);
    for (let revision = 1; revision <= 110; revision++) {
      history = appendBoardHistory(history, createBoard(2, 1, 1, revision));
    }
    expect(history.entries).toHaveLength(100);
    expect(history.entries[0]!.board.revision).toBe(11);
    expect(history.cursor).toBe(99);
    expect(moveBoardHistory(history, 1)).toBe(history);
    for (let index = 0; index < 99; index++) history = moveBoardHistory(history, -1);
    expect(history.entries[history.cursor]!.board.revision).toBe(11);
    expect(moveBoardHistory(history, -1)).toBe(history);
  });

  it('Undo後の新編集でRedo側を破棄する', () => {
    const board = createBoard(2, 1, 1, 0);
    const history = appendBoardHistory(appendBoardHistory(createBoardHistory(board), editCell(board, 0, 1)), editCell(board, 1, 'flag'));
    const branched = appendBoardHistory(moveBoardHistory(history, -1), createBoard(3, 1, 1, 8));
    expect(branched.entries.map(entry => entry.board.width)).toEqual([2, 2, 3]);
    expect(branched.cursor).toBe(2);
    expect(moveBoardHistory(branched, 1)).toBe(branched);
  });

  it('結果は現在entryだけを更新し、最後の完了と成功を独立に保持する', () => {
    const initial = appendBoardHistory(createBoardHistory(createBoard(2, 1, 1, 0)), createBoard(2, 1, 1, 1));
    const solved = recordHistoryResult(initial, success());
    const failed = recordHistoryResult(solved, { phase: 'limit-reached', validation: { status: 'valid' }, proposal: null, message: null, limitReason: 'timeout' });
    expect(failed.entries).toHaveLength(2);
    expect(failed.entries[0]!.result).toBeNull();
    expect(failed.entries[1]!.result?.phase).toBe('limit-reached');
    expect(restorableHistoryResult(failed.entries[1]!)?.proposal?.safe).toEqual([0]);
    expect(initial.entries[1]!.result).toBeNull();
    const terminal = recordHistoryResult(initial, { phase: 'error', validation: { status: 'valid' }, proposal: null, message: 'failed' });
    expect(restorableHistoryResult(terminal.entries[1]!)?.message).toBe('failed');
    expect(restorableHistoryResult(initial.entries[0]!)).toBeNull();
  });

  it('入力盤面・結果配列と復元結果の後からの変更が保存snapshotを変えない', () => {
    const cells = [{ value: 'closed' as const, source: 'manual' as const, uncertain: false }];
    const board = { ...createBoard(1, 1, 0, 0), cells };
    const validation = { status: 'needs-review' as const, reason: 'uncertain' as const, cells: [0] };
    const result = success();
    let history = recordHistoryResult(createBoardHistory(board), result);
    history = appendBoardHistory(history, board);
    history = recordHistoryResult(history, { phase: 'needs-review', validation, proposal: null, message: null });
    cells[0]!.uncertain = true;
    result.proposal!.safe.push(4);
    validation.cells.push(4);
    const restored = restorableHistoryResult(history.entries[0]!)!;
    restored.proposal!.mines.push(8);
    expect(history.entries.map(entry => entry.board.cells[0]!.uncertain)).toEqual([false, false]);
    expect(history.entries[0]!.result?.proposal).toEqual({ safe: [0], mines: [1], guesses: [], primaryGuess: null });
    expect(history.entries[1]!.result?.validation).toEqual({ status: 'needs-review', reason: 'uncertain', cells: [0] });
  });
});
