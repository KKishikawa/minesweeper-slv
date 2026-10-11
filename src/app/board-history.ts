import type { BoardSnapshot, ValidationResult } from '../board/types.js';
import type { SolverProposal } from '../solver/types.js';
import type { Phase } from './state.js';

export interface HistoryResult {
  phase: Exclude<Phase, 'editing' | 'solving'>;
  validation: ValidationResult;
  proposal: SolverProposal | null;
  message: string | null;
  limitReason?: 'node-budget' | 'timeout' | undefined;
}
export interface HistoryEntry {
  readonly board: BoardSnapshot;
  readonly result: HistoryResult | null;
  readonly lastSuccess: HistoryResult | null;
}
export interface BoardHistory {
  readonly entries: readonly HistoryEntry[];
  readonly cursor: number;
}

function entryFor(board: BoardSnapshot): HistoryEntry {
  return { board: structuredClone(board), result: null, lastSuccess: null };
}

export function createBoardHistory(board: BoardSnapshot): BoardHistory {
  return { entries: [entryFor(board)], cursor: 0 };
}

export function appendBoardHistory(history: BoardHistory, board: BoardSnapshot): BoardHistory {
  const entries = [...history.entries.slice(0, history.cursor + 1), entryFor(board)].slice(-100);
  return { entries, cursor: entries.length - 1 };
}

export function recordHistoryResult(history: BoardHistory, result: HistoryResult): BoardHistory {
  const saved = structuredClone(result);
  const current = history.entries[history.cursor]!;
  const entry = { ...current, result: saved,
    lastSuccess: saved.phase === 'solved' || saved.phase === 'guess-required' ? saved : current.lastSuccess };
  return { ...history, entries: history.entries.map((item, index) => index === history.cursor ? entry : item) };
}

export function moveBoardHistory(history: BoardHistory, offset: -1 | 1): BoardHistory {
  const cursor = history.cursor + offset;
  return cursor < 0 || cursor >= history.entries.length ? history : { ...history, cursor };
}

export function restorableHistoryResult(entry: HistoryEntry): HistoryResult | null {
  return structuredClone(entry.lastSuccess ?? entry.result);
}
