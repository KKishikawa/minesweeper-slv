import type { BoardSnapshot, FlagPolicy } from '../board/types.js';
import type { SolveOptions, SolveResult } from '../solver/types.js';

export type SolverRequest = { kind: 'solve'; requestId: number; revision: number; board: BoardSnapshot; policy: FlagPolicy; options: SolveOptions };
export type SolverResponse =
  | { kind: 'result'; requestId: number; revision: number; result: SolveResult }
  | { kind: 'error'; requestId: number; revision: number; message: string };
export type RecognitionRequest = { kind: 'recognize'; requestId: number; revision: number; width: number; height: number; rgba: Uint8ClampedArray };
export type RecognitionResponse =
  | { kind: 'recognized'; requestId: number; revision: number; board: BoardSnapshot | null }
  | { kind: 'recognition-error'; requestId: number; revision: number; message: string };
