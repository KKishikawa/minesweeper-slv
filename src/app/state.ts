import type { BoardSnapshot, FlagPolicy, ValidationResult } from '../board/types.js';
import { validateBoard } from '../board/validate.js';
import type { SolverProposal } from '../solver/types.js';
import type { SolverRequest, SolverResponse } from '../workers/protocol.js';

export type Phase = 'editing' | 'needs-review' | 'inconsistent' | 'solving' | 'solved' | 'guess-required' | 'limit-reached' | 'error';
export interface AppState {
  board: BoardSnapshot;
  policy: FlagPolicy;
  autoReconsider: boolean;
  phase: Phase;
  validation: ValidationResult;
  proposal: SolverProposal | null;
  activeRequestId: number | null;
  nextRequestId: number;
  effectivePolicy: FlagPolicy;
  message: string | null;
}
export type AppAction =
  | { type: 'board-changed'; board: BoardSnapshot }
  | { type: 'settings-changed'; policy: FlagPolicy; autoReconsider: boolean }
  | { type: 'solve' }
  | { type: 'response'; response: SolverResponse };
export type AppEffect = { type: 'cancel' } | { type: 'run'; request: SolverRequest };
export interface Transition { state: AppState; effects: AppEffect[] }

function phaseFor(validation: ValidationResult): Phase {
  return validation.status === 'valid' ? 'editing' : validation.status;
}

export function createAppState(board: BoardSnapshot): AppState {
  const validation = validateBoard(board, 'trusted');
  return { board, policy: 'trusted', autoReconsider: false, phase: phaseFor(validation), validation,
    proposal: null, activeRequestId: null, nextRequestId: 1, effectivePolicy: 'trusted', message: null };
}

export function acceptsResponse(state: AppState, response: SolverResponse): boolean {
  return state.phase === 'solving' && state.activeRequestId === response.requestId && state.board.revision === response.revision;
}

function start(state: AppState, policy: FlagPolicy, prefix: AppEffect[]): Transition {
  const validation = validateBoard(state.board, policy);
  const effectivePolicy = validation.status === 'inconsistent' && validation.reason !== 'settings'
    && policy === 'trusted' && state.autoReconsider
    ? 'reconsidered' : policy;
  const effectiveValidation = effectivePolicy === policy ? validation : validateBoard(state.board, effectivePolicy);
  const base: AppState = { ...state, validation: effectiveValidation, effectivePolicy,
    phase: phaseFor(effectiveValidation), proposal: null, activeRequestId: null, message: null };
  if (effectiveValidation.status !== 'valid') return { state: base, effects: prefix };
  const requestId = state.nextRequestId;
  const request: SolverRequest = { kind: 'solve', requestId, revision: state.board.revision,
    board: state.board, policy: effectivePolicy, options: { maxNodes: 200_000 } };
  return { state: { ...base, phase: 'solving', activeRequestId: requestId, nextRequestId: requestId + 1 },
    effects: [...prefix, { type: 'run', request }] };
}

export function transition(state: AppState, action: AppAction): Transition {
  if (action.type === 'board-changed') {
    if (action.board.revision <= state.board.revision) return { state, effects: [] };
    return start({ ...state, board: action.board }, state.policy, [{ type: 'cancel' }]);
  }
  if (action.type === 'settings-changed') {
    if (!Number.isSafeInteger(state.board.revision) || state.board.revision < 0
      || state.board.revision === Number.MAX_SAFE_INTEGER) throw new RangeError('Revision cannot advance');
    const board = { ...state.board, revision: state.board.revision + 1 };
    const updated = { ...state, board, policy: action.policy, autoReconsider: action.autoReconsider };
    return start(updated, action.policy, [{ type: 'cancel' }]);
  }
  if (action.type === 'solve') return start(state, state.policy, [{ type: 'cancel' }]);
  const response = action.response;
  if (!acceptsResponse(state, response)) return { state, effects: [] };
  if (response.kind === 'error') return { state: { ...state, phase: 'error', proposal: null,
    activeRequestId: null, message: response.message }, effects: [] };
  if (response.result.status === 'inconsistent' && state.policy === 'trusted' && state.autoReconsider && state.effectivePolicy === 'trusted') {
    return start(state, 'reconsidered', [{ type: 'cancel' }]);
  }
  return { state: { ...state, phase: response.result.status, activeRequestId: null,
    proposal: 'proposal' in response.result ? response.result.proposal : null, message: null }, effects: [] };
}
