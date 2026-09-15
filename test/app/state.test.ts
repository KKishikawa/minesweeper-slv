import { describe, expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board.js';
import { acceptsResponse, createAppState, transition } from '../../src/app/state.js';
import type { AppState } from '../../src/app/state.js';

describe('app state', () => {
  it('同revisionでも古いrequestを受け付けない', () => {
    const state: AppState = { board: createBoard(2, 1, 1, 3), policy: 'trusted', autoReconsider: false,
      phase: 'solving', validation: { status: 'valid' }, proposal: null, activeRequestId: 9,
      nextRequestId: 10, effectivePolicy: 'trusted', message: null };
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

  it('設定変更は盤面の観測を保ちrevisionを進める', () => {
    const state = createAppState(createBoard(2, 1, 1, 0));
    const changed = transition(state, { type: 'settings-changed', policy: 'reconsidered', autoReconsider: true });
    expect(changed.state.board.cells).toBe(state.board.cells);
    expect(changed.state.board.revision).toBe(1);
    expect(changed.state.policy).toBe('reconsidered');
    expect(changed.effects.map(effect => effect.type)).toEqual(['cancel', 'run']);
  });
  it('安全な整数の最大revisionから設定を変更できない', () => {
    const state = createAppState(createBoard(1, 1, 0, Number.MAX_SAFE_INTEGER));
    expect(() => transition(state, { type: 'settings-changed', policy: 'trusted', autoReconsider: false })).toThrow(RangeError);
  });

  it('trusted矛盾は自動再検討を一度だけ実行する', () => {
    let board = createBoard(3, 1, 1, 0);
    board = editCell(editCell(board, 0, 0), 1, 'flag');
    const state = transition(createAppState(board), { type: 'settings-changed', policy: 'trusted', autoReconsider: true });
    expect(state.state.phase).toBe('solving');
    expect(state.state.effectivePolicy).toBe('reconsidered');
    expect(state.effects.at(-1)).toMatchObject({ type: 'run', request: { policy: 'reconsidered' } });
    const response = transition(state.state, { type: 'response', response: { kind: 'result', requestId: state.state.activeRequestId!, revision: state.state.board.revision, result: { status: 'inconsistent' } } });
    expect(response.state.phase).toBe('inconsistent');
    expect(response.effects).toEqual([]);
  });
  it('solverがtrustedの全体矛盾を返したら同revisionで新IDに再検討する', () => {
    const running = transition(createAppState(createBoard(2, 1, 1, 0)), { type: 'settings-changed', policy: 'trusted', autoReconsider: true }).state;
    const fallback = transition(running, { type: 'response', response: { kind: 'result', requestId: running.activeRequestId!, revision: running.board.revision, result: { status: 'inconsistent' } } });
    expect(fallback.state.board.revision).toBe(running.board.revision);
    expect(fallback.state.activeRequestId).toBe(running.nextRequestId);
    expect(fallback.state.effectivePolicy).toBe('reconsidered');
    expect(fallback.effects).toMatchObject([{ type: 'cancel' }, { type: 'run', request: { policy: 'reconsidered' } }]);
  });
  it('不確実な盤面は実行せずneeds-reviewになる', () => {
    const board = { ...createBoard(1, 1, 0, 1), cells: [{ value: 'closed' as const, source: 'recognition' as const, uncertain: true }] };
    const changed = transition(createAppState(createBoard(1, 1, 0, 0)), { type: 'board-changed', board });
    expect(changed.state.phase).toBe('needs-review');
    expect(changed.effects).toEqual([{ type: 'cancel' }]);
  });
  it('総地雷数の設定矛盾は自動再検討してもsettingsを保持する', () => {
    const board = { ...createBoard(1, 1, 0, 0), totalMines: 2 };
    const changed = transition(createAppState(board), { type: 'settings-changed', policy: 'trusted', autoReconsider: true });
    expect(changed.state.effectivePolicy).toBe('trusted');
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
