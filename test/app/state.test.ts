import { describe, expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board.js';
import { acceptsResponse, createAppState, transition } from '../../src/app/state.js';
import type { AppState } from '../../src/app/state.js';

describe('app state', () => {
  it('同revisionでも古いrequestを受け付けない', () => {
    const state: AppState = { board: createBoard(2, 1, 1, 3),
      phase: 'solving', validation: { status: 'valid' }, proposal: null, activeRequestId: 9,
      nextRequestId: 10, message: null };
    expect(acceptsResponse(state, { kind: 'result', requestId: 8, revision: 3, result: { status: 'inconsistent' } })).toBe(false);
  });

  it('編集は古い提案を消して新しいrequestを発行する', () => {
    const initial = createAppState(createBoard(2, 1, 1, 0));
    const first = transition(initial, { type: 'solve' });
    const changed = transition(first.state, { type: 'board-changed', board: editCell(first.state.board, 0, 1) });
    expect(changed.effects.map(effect => effect.type)).toEqual(['cancel', 'run']);
    expect(changed.state.activeRequestId).toBe(2);
    expect(changed.state.board.revision).toBe(1);
    expect(transition(changed.state, { type: 'response', response: { kind: 'result', requestId: 1, revision: 0, result: { status: 'inconsistent' } } }).state).toBe(changed.state);
  });

  it('同じか古い盤面は無視する', () => {
    const state = createAppState(createBoard(2, 1, 1, 2));
    expect(transition(state, { type: 'board-changed', board: state.board })).toEqual({ state, effects: [] });
  });

  it('入力旗と数字の矛盾は解析せず手動修正を待つ', () => {
    const board = editCell(editCell(createBoard(3, 1, 1, 0), 0, 0), 1, 'flag');
    const stopped = transition(createAppState(board), { type: 'solve' });
    expect(stopped.state.phase).toBe('inconsistent');
    expect(stopped.state.validation).toEqual({ status: 'inconsistent', reason: 'local', cells: [0] });
    expect(stopped.state.board.cells[1]!.value).toBe('flag');
    expect(stopped.effects).toEqual([{ type: 'cancel' }]);
    const corrected = transition(stopped.state, { type: 'board-changed', board: editCell(board, 1, 'closed') });
    expect(corrected.state.phase).toBe('solving');
    expect(corrected.effects.map(effect => effect.type)).toEqual(['cancel', 'run']);
  });
  it('solverの全体矛盾は再試行せず完了する', () => {
    const running = transition(createAppState(createBoard(2, 1, 1, 0)), { type: 'solve' }).state;
    const stopped = transition(running, { type: 'response', response: { kind: 'result', requestId: running.activeRequestId!, revision: running.board.revision, result: { status: 'inconsistent' } } });
    expect(stopped.state.phase).toBe('inconsistent');
    expect(stopped.state.activeRequestId).toBeNull();
    expect(stopped.state.nextRequestId).toBe(running.nextRequestId);
    expect(stopped.effects).toEqual([]);
  });
  it('不確実な盤面は実行せずneeds-reviewになる', () => {
    const board = { ...createBoard(1, 1, 0, 1), cells: [{ value: 'closed' as const, source: 'recognition' as const, uncertain: true }] };
    const changed = transition(createAppState(createBoard(1, 1, 0, 0)), { type: 'board-changed', board });
    expect(changed.state.phase).toBe('needs-review');
    expect(changed.effects).toEqual([{ type: 'cancel' }]);
  });
  it('総地雷数の設定矛盾は解析せずsettingsを保持する', () => {
    const board = { ...createBoard(1, 1, 0, 0), totalMines: 2 };
    const changed = transition(createAppState(board), { type: 'solve' });
    expect(changed.state.validation).toEqual({ status: 'inconsistent', reason: 'settings', cells: [] });
    expect(changed.effects).toEqual([{ type: 'cancel' }]);
  });

  it('有効なsolved応答は提案を保持し、limitとerrorは消す', () => {
    const running = transition(createAppState(createBoard(2, 1, 1, 0)), { type: 'solve' }).state;
    const response = (result: { status: 'solved'; proposal: { safe: number[]; mines: number[]; guesses: number[]; primaryGuess: null } } | { status: 'limit-reached' }) =>
      transition(running, { type: 'response', response: { kind: 'result', requestId: running.activeRequestId!, revision: running.board.revision, result } }).state;
    expect(response({ status: 'solved', proposal: { safe: [0], mines: [1], guesses: [], primaryGuess: null } }).proposal?.safe).toEqual([0]);
    expect(response({ status: 'limit-reached' }).proposal).toBeNull();
    expect(transition(running, { type: 'response', response: { kind: 'error', requestId: running.activeRequestId!, revision: running.board.revision, message: 'bad' } }).state.phase).toBe('error');
  });
});
