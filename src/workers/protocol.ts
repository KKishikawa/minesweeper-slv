import type { BoardSnapshot } from '../board/types.js';
import type { SolveOptions, SolveResult, SolverStatistics } from '../solver/types.js';

export type SolverRequest = { kind: 'solve'; requestId: number; revision: number; board: BoardSnapshot; options: SolveOptions; diagnostics?: boolean };
export type SolverResponse =
  | { kind: 'result'; requestId: number; revision: number; result: SolveResult; statistics?: SolverStatistics }
  | { kind: 'error'; requestId: number; revision: number; message: string; statistics?: SolverStatistics };
export type SolverProgress = { kind: 'progress'; requestId: number; revision: number; statistics: SolverStatistics };
export type RecognitionRequest = { kind: 'recognize'; requestId: number; revision: number; width: number; height: number; rgba: Uint8ClampedArray };
export type RecognitionResponse =
  | { kind: 'recognized'; requestId: number; revision: number; board: BoardSnapshot | null }
  | { kind: 'recognition-error'; requestId: number; revision: number; message: string };
