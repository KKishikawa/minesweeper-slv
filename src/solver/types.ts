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
  | { status: 'limit-reached'; reason?: 'node-budget' | 'timeout' };
export interface SolveOptions { maxNodes: number }
export interface ComponentStatistics {
  cells: number;
  constraints: number;
  visitedNodes: number;
  status: 'pending' | 'exploring' | 'completed' | 'limit-reached';
}
export interface SolverStatistics {
  stage: 'validation' | 'reduction' | 'enumeration' | 'combination' | 'complete';
  visitedNodes: number;
  elapsedMs: number;
  components: ComponentStatistics[] | null;
}
export type Solver = (board: BoardSnapshot, policy: FlagPolicy, options: SolveOptions,
  observe?: (statistics: SolverStatistics) => void) => SolveResult;
