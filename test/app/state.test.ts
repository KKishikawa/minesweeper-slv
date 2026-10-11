import { describe, expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board.js';
import { acceptsResponse, createAppState, transition } from '../../src/app/state.js';
import type { AppState } from '../../src/app/state.js';

describe('app state', () => {
  it('同revisionでも古いrequestを受け付けない', () => {
    const state: AppState = { ...createAppState(createBoard(2, 1, 1, 3)), board: createBoard(2, 1, 1, 3),
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

function solveState(state: AppState, status: 'solved' | 'guess-required' = 'solved'): AppState {
  const running = transition(state, { type: 'solve' }).state;
  return transition(running, { type: 'response', response: { kind: 'result',
    requestId: running.activeRequestId!, revision: running.board.revision,
    result: { status, proposal: { safe: [0], mines: [1], guesses: [], primaryGuess: null } } } }).state;
}

describe('board snapshot transitions', () => {
  it('solved A→編集B→limit→UndoでAの結果を復元し、RedoでBのlimitを復元する', () => {
    const solved = solveState(createAppState(createBoard(2, 1, 1, 0)));
    const edited = transition(solved, { type: 'board-changed', board: editCell(solved.board, 0, 1) }).state;
    const limited = transition(edited, { type: 'response', response: { kind: 'result', requestId: edited.activeRequestId!, revision: 1,
      result: { status: 'limit-reached', reason: 'node-budget' } } }).state;
    const undone = transition(limited, { type: 'undo' });
    expect(undone.effects).toEqual([{ type: 'cancel' }]);
    expect(undone.state.board.cells.map(cell => cell.value)).toEqual(['closed', 'closed']);
    expect(undone.state.phase).toBe('solved');
    expect(undone.state.proposal).toEqual({ safe: [0], mines: [1], guesses: [], primaryGuess: null });
    expect(undone.state.restoredResult).toBe(true);
    expect(undone.state.activeRequestId).toBeNull();
    expect(undone.state.board.revision).toBe(2);
    expect(undone.state.nextRequestId).toBe(3);
    const redone = transition(undone.state, { type: 'redo' });
    expect(redone.effects).toEqual([{ type: 'cancel' }]);
    expect(redone.state.board.cells[0]!.value).toBe(1);
    expect(redone.state.phase).toBe('limit-reached');
    expect(redone.state.limitReason).toBe('node-budget');
    expect(redone.state.proposal).toBeNull();
    expect(redone.state.board.revision).toBe(3);
  });

  it.each(['limit-reached', 'inconsistent', 'error'] as const)('同じ盤面の再解析が%sでも離れて戻ると最後の成功結果を復元する', status => {
    const solved = solveState(createAppState(createBoard(2, 1, 1, 0)), 'guess-required');
    const running = transition(solved, { type: 'solve' }).state;
    expect(running.restoredResult).toBe(false);
    expect(running.proposal).toBeNull();
    const response = status === 'error'
      ? { kind: 'error' as const, requestId: running.activeRequestId!, revision: 0, message: 'worker failed' }
      : { kind: 'result' as const, requestId: running.activeRequestId!, revision: 0, result: { status } };
    const failed = transition(running, { type: 'response', response }).state;
    expect(failed.phase).toBe(status);
    expect(failed.proposal).toBeNull();
    expect(failed.history.entries).toHaveLength(1);
    const edited = transition(failed, { type: 'board-changed', board: editCell(failed.board, 0, 1) }).state;
    const restored = transition(edited, { type: 'undo' });
    expect(restored.effects).toEqual([{ type: 'cancel' }]);
    expect(restored.state.phase).toBe('guess-required');
    expect(restored.state.proposal?.mines).toEqual([1]);
  });

  it('結果なしentryへ戻ると新revisionとrequestで解析し古い応答を拒否する', () => {
    const running = transition(createAppState(createBoard(3, 1, 1, 0)), { type: 'solve' }).state;
    const edited = transition(running, { type: 'board-changed', board: editCell(running.board, 0, 1) }).state;
    const undone = transition(edited, { type: 'undo' });
    expect(undone.effects.map(effect => effect.type)).toEqual(['cancel', 'run']);
    expect(undone.state.board.revision).toBe(2);
    expect(undone.state.activeRequestId).toBe(3);
    expect(undone.state.nextRequestId).toBe(4);
    expect(undone.state.restoredResult).toBe(false);
    for (const [requestId, revision] of [[1, 0], [2, 1], [3, 1]]) {
      expect(transition(undone.state, { type: 'response', response: { kind: 'result', requestId: requestId!, revision: revision!, result: { status: 'inconsistent' } } }))
        .toEqual({ state: undone.state, effects: [] });
    }
    const redone = transition(undone.state, { type: 'redo' });
    expect(redone.state.activeRequestId).toBe(4);
    expect(redone.state.board.revision).toBe(3);
  });

  it('結果のないinvalid entryへ戻るとWorkerを実行せずvalidationを復元する', () => {
    const board = { ...createBoard(2, 1, 1, 0), cells: [
      { value: 'closed' as const, source: 'recognition' as const, uncertain: true },
      { value: 'closed' as const, source: 'manual' as const, uncertain: false }] };
    const initial = createAppState(board);
    const confirmed = transition(initial, { type: 'board-changed', board: editCell(board, 0, 'closed') }).state;
    const restored = transition(confirmed, { type: 'undo' });
    expect(restored.effects).toEqual([{ type: 'cancel' }]);
    expect(restored.state.phase).toBe('needs-review');
    expect(restored.state.validation).toEqual({ status: 'needs-review', reason: 'uncertain', cells: [0] });
  });

  it('同じ観測の入力はno-opで、source/uncertainの手動確認は履歴に記録する', () => {
    const state = createAppState(createBoard(2, 1, 1, 0));
    expect(transition(state, { type: 'board-changed', board: editCell(state.board, 0, 'closed') }))
      .toEqual({ state, effects: [] });
    const recognition = createAppState({ ...state.board, cells: [
      { value: 'closed', source: 'recognition', uncertain: true }, state.board.cells[1]!] });
    const confirmed = transition(recognition, { type: 'board-changed', board: editCell(recognition.board, 0, 'closed') });
    expect(confirmed.state.history.entries).toHaveLength(2);
    expect(confirmed.state.board.cells[0]).toEqual({ value: 'closed', source: 'manual', uncertain: false });
  });

  it('Undo/Redo両端ではstate・revision・副作用を変えない', () => {
    const state = createAppState(createBoard(2, 1, 1, 0));
    expect(transition(state, { type: 'undo' })).toEqual({ state, effects: [] });
    expect(transition(state, { type: 'redo' })).toEqual({ state, effects: [] });
  });

  it('Undo後の再解析はRedoを保持し、新編集で破棄する', () => {
    const initial = createAppState(createBoard(3, 1, 1, 0));
    const edited = transition(initial, { type: 'board-changed', board: editCell(initial.board, 0, 1) }).state;
    const undone = transition(edited, { type: 'undo' }).state;
    const solved = solveState(undone);
    expect(solved.history.entries).toHaveLength(2);
    expect(solved.history.cursor).toBe(0);
    expect(transition(solved, { type: 'redo' }).state.board.cells[0]!.value).toBe(1);
    const branched = transition(solved, { type: 'board-changed', board: editCell(solved.board, 2, 'flag') }).state;
    expect(branched.history.entries).toHaveLength(2);
    expect(transition(branched, { type: 'redo' })).toEqual({ state: branched, effects: [] });
  });

  it('リセットと寸法・総地雷数変更を各1entryで記録し復元する', () => {
    const board = editCell(createBoard(3, 1, 1, 0), 0, 1);
    const initial = createAppState(board);
    const reset = transition(initial, { type: 'board-changed', board: createBoard(3, 1, 1, 2) }).state;
    const resized = transition(reset, { type: 'board-changed', board: createBoard(2, 2, 2, 3) }).state;
    expect(resized.history.entries).toHaveLength(3);
    const back = transition(resized, { type: 'undo' }).state;
    expect([back.board.width, back.board.height, back.board.totalMines]).toEqual([3, 1, 1]);
    expect(back.board.cells.map(cell => cell.value)).toEqual(['closed', 'closed', 'closed']);
    const original = transition(back, { type: 'undo' }).state;
    expect(original.board.cells[0]!.value).toBe(1);
    expect(original.board.revision).toBe(5);
  });

  it('高速編集は直近100entryに制限し、復元時もrevision/requestを増加させる', () => {
    let state = createAppState(createBoard(2, 1, 1, 0));
    for (let index = 1; index <= 105; index++) state = transition(state,
      { type: 'board-changed', board: editCell(state.board, 0, index % 2 ? 1 : 'closed') }).state;
    expect(state.history.entries).toHaveLength(100);
    expect(state.history.entries[0]!.board.revision).toBe(6);
    for (let index = 0; index < 99; index++) state = transition(state, { type: 'undo' }).state;
    expect(state.history.cursor).toBe(0);
    expect(state.board.revision).toBe(204);
    expect(state.activeRequestId).toBe(204);
    expect(transition(state, { type: 'undo' })).toEqual({ state, effects: [] });
  });

  it('revisionがMAX_SAFE_INTEGERなら復元を拒否する', () => {
    const state = createAppState(createBoard(2, 1, 1, Number.MAX_SAFE_INTEGER - 1));
    const edited = transition(state, { type: 'board-changed', board: editCell(state.board, 0, 1) }).state;
    expect(() => transition(edited, { type: 'undo' })).toThrow(RangeError);
    expect(edited.history.cursor).toBe(1);
  });

  it('受理した応答とlive提案配列の変更が保存結果へ漏れない', () => {
    const running = transition(createAppState(createBoard(2, 1, 1, 0)), { type: 'solve' }).state;
    const proposal = { safe: [0], mines: [1], guesses: [], primaryGuess: null };
    const solved = transition(running, { type: 'response', response: { kind: 'result', requestId: 1, revision: 0, result: { status: 'solved', proposal } } }).state;
    proposal.safe.push(9);
    solved.proposal!.mines.push(9);
    const edited = transition(solved, { type: 'board-changed', board: editCell(solved.board, 0, 1) }).state;
    const restored = transition(edited, { type: 'undo' }).state;
    expect(restored.proposal).toEqual({ safe: [0], mines: [1], guesses: [], primaryGuess: null });
  });
});
