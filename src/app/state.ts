import type { BoardSnapshot, ValidationResult } from '../board/types.js';
import { validateBoard } from '../board/validate.js';
import type { SolverProposal } from '../solver/types.js';
import type { SolverRequest, SolverResponse } from '../workers/protocol.js';
import { appendBoardHistory, createBoardHistory, moveBoardHistory, recordHistoryResult, restorableHistoryResult } from './board-history.js';
import type { BoardHistory } from './board-history.js';

export type Phase = 'editing' | 'needs-review' | 'inconsistent' | 'solving' | 'solved' | 'guess-required' | 'limit-reached' | 'error';
export interface AppState {
  board: BoardSnapshot;
  phase: Phase;
  validation: ValidationResult;
  proposal: SolverProposal | null;
  activeRequestId: number | null;
  nextRequestId: number;
  message: string | null;
  limitReason?: 'node-budget' | 'timeout' | undefined;
  history: BoardHistory;
  restoredResult: boolean;
}
export type AppAction =
  | { type: 'board-changed'; board: BoardSnapshot }
  | { type: 'solve' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'response'; response: SolverResponse };
export type AppEffect = { type: 'cancel' } | { type: 'run'; request: SolverRequest };
export interface Transition { state: AppState; effects: AppEffect[] }

function phaseFor(validation: ValidationResult): Phase {
  return validation.status === 'valid' ? 'editing' : validation.status;
}

export function createAppState(board: BoardSnapshot): AppState {
  const validation = validateBoard(board);
  return saveResult({ board: structuredClone(board), phase: phaseFor(validation), validation,
    proposal: null, activeRequestId: null, nextRequestId: 1, message: null,
    history: createBoardHistory(board), restoredResult: false });
}

function saveResult(state: AppState): AppState {
  if (state.phase === 'editing' || state.phase === 'solving') return state;
  const { phase, validation, proposal, message, limitReason } = state;
  return { ...state, history: recordHistoryResult(state.history, { phase, validation, proposal, message, limitReason }) };
}

function sameObservations(left: BoardSnapshot, right: BoardSnapshot): boolean {
  return left.width === right.width && left.height === right.height && left.totalMines === right.totalMines
    && left.cells.length === right.cells.length && left.cells.every((cell, index) => {
      const other = right.cells[index]!;
      return cell.value === other.value && cell.source === other.source && cell.uncertain === other.uncertain;
    });
}

export function acceptsResponse(state: AppState, response: SolverResponse): boolean {
  return state.phase === 'solving' && state.activeRequestId === response.requestId && state.board.revision === response.revision;
}

function start(state: AppState, prefix: AppEffect[]): Transition {
  const validation = validateBoard(state.board);
  const base: AppState = { ...state, validation,
    phase: phaseFor(validation), proposal: null, activeRequestId: null, message: null, limitReason: undefined, restoredResult: false };
  if (validation.status !== 'valid') return { state: saveResult(base), effects: prefix };
  const requestId = state.nextRequestId;
  const request: SolverRequest = { kind: 'solve', requestId, revision: state.board.revision,
    board: state.board, options: { maxNodes: 200_000 } };
  return { state: { ...base, phase: 'solving', activeRequestId: requestId, nextRequestId: requestId + 1 },
    effects: [...prefix, { type: 'run', request }] };
}

export function transition(state: AppState, action: AppAction): Transition {
  if (action.type === 'board-changed') {
    if (action.board.revision <= state.board.revision || sameObservations(state.board, action.board)) return { state, effects: [] };
    return start({ ...state, board: structuredClone(action.board), history: appendBoardHistory(state.history, action.board) }, [{ type: 'cancel' }]);
  }
  if (action.type === 'undo' || action.type === 'redo') {
    const history = moveBoardHistory(state.history, action.type === 'undo' ? -1 : 1);
    if (history === state.history) return { state, effects: [] };
    if (!Number.isSafeInteger(state.board.revision) || state.board.revision < 0 || state.board.revision === Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Revision cannot advance');
    }
    const entry = history.entries[history.cursor]!;
    const board = { ...structuredClone(entry.board), revision: state.board.revision + 1 };
    const result = restorableHistoryResult(entry);
    const base = { ...state, board, history };
    if (!result) return start(base, [{ type: 'cancel' }]);
    return { state: { ...base, ...result, activeRequestId: null, restoredResult: true }, effects: [{ type: 'cancel' }] };
  }
  if (action.type === 'solve') return start(state, [{ type: 'cancel' }]);
  const response = action.response;
  if (!acceptsResponse(state, response)) return { state, effects: [] };
  if (response.kind === 'error') return { state: saveResult({ ...state, phase: 'error', proposal: null,
    activeRequestId: null, message: response.message, limitReason: undefined, restoredResult: false }), effects: [] };
  return { state: saveResult({ ...state, phase: response.result.status, activeRequestId: null,
    proposal: 'proposal' in response.result ? structuredClone(response.result.proposal) : null, message: null,
    limitReason: response.result.status === 'limit-reached' ? response.result.reason : undefined, restoredResult: false }), effects: [] };
}
