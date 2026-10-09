import type { BoardSnapshot, FlagPolicy } from '../board/types.js';

export interface SolverProposal {
  safe: number[];
  mines: number[];
  guesses: number[];
  primaryGuess: number | null;
}
export type SolveResult =
  | { status: 'solved' | 'guess-required'; proposal: SolverProposal }
  | { status: 'inconsistent' }
  | { status: 'limit-reached' };
export interface SolveOptions { maxNodes: number }
export type Solver = (board: BoardSnapshot, policy: FlagPolicy, options: SolveOptions) => SolveResult;
