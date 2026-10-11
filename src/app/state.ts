import type { BoardSnapshot, ValidationResult } from '../board/types.js';
import { validateBoard } from '../board/validate.js';
import type { SolverProposal } from '../solver/types.js';
import type { SolverRequest, SolverResponse } from '../workers/protocol.js';

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
}
export type AppAction =
  | { type: 'board-changed'; board: BoardSnapshot }
  | { type: 'solve' }
  | { type: 'response'; response: SolverResponse };
export type AppEffect = { type: 'cancel' } | { type: 'run'; request: SolverRequest };
export interface Transition { state: AppState; effects: AppEffect[] }

function phaseFor(validation: ValidationResult): Phase {
  return validation.status === 'valid' ? 'editing' : validation.status;
}

export function createAppState(board: BoardSnapshot): AppState {
  const validation = validateBoard(board);
  return { board, phase: phaseFor(validation), validation,
    proposal: null, activeRequestId: null, nextRequestId: 1, message: null };
}

export function acceptsResponse(state: AppState, response: SolverResponse): boolean {
  return state.phase === 'solving' && state.activeRequestId === response.requestId && state.board.revision === response.revision;
}

function start(state: AppState, prefix: AppEffect[]): Transition {
  const validation = validateBoard(state.board);
  const base: AppState = { ...state, validation,
    phase: phaseFor(validation), proposal: null, activeRequestId: null, message: null, limitReason: undefined };
  if (validation.status !== 'valid') return { state: base, effects: prefix };
  const requestId = state.nextRequestId;
  const request: SolverRequest = { kind: 'solve', requestId, revision: state.board.revision,
    board: state.board, options: { maxNodes: 200_000 } };
  return { state: { ...base, phase: 'solving', activeRequestId: requestId, nextRequestId: requestId + 1 },
    effects: [...prefix, { type: 'run', request }] };
}

export function transition(state: AppState, action: AppAction): Transition {
  if (action.type === 'board-changed') {
    if (action.board.revision <= state.board.revision) return { state, effects: [] };
    return start({ ...state, board: action.board }, [{ type: 'cancel' }]);
  }
  if (action.type === 'solve') return start(state, [{ type: 'cancel' }]);
  const response = action.response;
  if (!acceptsResponse(state, response)) return { state, effects: [] };
  if (response.kind === 'error') return { state: { ...state, phase: 'error', proposal: null,
    activeRequestId: null, message: response.message }, effects: [] };
  return { state: { ...state, phase: response.result.status, activeRequestId: null,
    proposal: 'proposal' in response.result ? response.result.proposal : null, message: null,
    limitReason: response.result.status === 'limit-reached' ? response.result.reason : undefined }, effects: [] };
}
