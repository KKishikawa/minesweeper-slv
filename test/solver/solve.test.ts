import { expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board';
import type { CellValue, FlagPolicy } from '../../src/board/types';
import { solve } from '../../src/solver/solve';
import { choose } from '../../src/solver/combine';
import { enumerateComponent } from '../../src/solver/enumerate';
import { oracle } from './oracle';
const options = { maxNodes: 200_000 };
it('selects tied guesses deterministically', () => {
  expect(solve(createBoard(2, 1, 1, 0), 'trusted', options)).toEqual({ status: 'guess-required',
    proposal: { safe: [], mines: [], guesses: [0, 1], primaryGuess: 0 } });
});
it('finds globally safe cells, all mines, and a completed board', () => {
  expect(solve(createBoard(2, 1, 0, 0), 'trusted', options)).toEqual({ status: 'solved', proposal: { safe: [0, 1], mines: [], guesses: [], primaryGuess: null } });
  expect(solve(createBoard(2, 1, 2, 0), 'trusted', options)).toEqual({ status: 'solved', proposal: { safe: [], mines: [0, 1], guesses: [], primaryGuess: null } });
  expect(solve(editCell(createBoard(1, 1, 0, 0), 0, 0), 'trusted', options)).toEqual({ status: 'solved', proposal: { safe: [], mines: [], guesses: [], primaryGuess: null } });
});
it('detects globally impossible but locally valid observations', () => {
  expect(solve(editCell(createBoard(3, 1, 2, 0), 1, 1), 'trusted', options)).toEqual({ status: 'inconsistent' });
});
it('combines independent components with unconstrained cells', () => {
  const board = editCell(editCell(createBoard(7, 1, 3, 0), 1, 1), 5, 1);
  expect(solve(board, 'trusted', options)).toEqual(oracle(board, 'trusted'));
  expect(solve(board, 'trusted', options)).toEqual({ status: 'solved', proposal: { safe: [], mines: [3], guesses: [], primaryGuess: null } });
});
it('reconsiders flags without modifying observations', () => {
  const board = editCell(editCell(createBoard(3, 1, 1, 0), 0, 0), 1, 'flag');
  expect(solve(board, 'trusted', options)).toEqual({ status: 'inconsistent' });
  expect(solve(board, 'reconsidered', options)).toEqual({ status: 'solved', proposal: { safe: [1], mines: [2], guesses: [], primaryGuess: null } });
  expect(board.cells[1]!.value).toBe('flag');
});
it('discards partial results when the shared budget is exhausted', () => {
  expect(solve(createBoard(2, 1, 1, 0), 'trusted', { maxNodes: 0 })).toEqual({ status: 'limit-reached', reason: 'node-budget' });
  const budget = { visited: 0, maxNodes: 4 };
  expect(enumerateComponent([{ cells: [0, 1], mines: 1 }], budget).limited).toBe(true);
  expect(budget.visited).toBeLessThanOrEqual(4);
  expect(enumerateComponent([{ cells: [2, 3], mines: 1 }], budget).limited).toBe(true);
});
it('counts component arrangements by mine count', () => {
  const result = enumerateComponent([{ cells: [0, 1], mines: 1 }, { cells: [1, 2], mines: 1 }], { visited: 0, maxNodes: 100 });
  expect(result.ways).toEqual(new Map([[1, 1n], [2, 1n]]));
  expect(result.mineWays.get(1)).toEqual(new Map([[1, 1n]]));
});
it('uses exact large combinations', () => {
  expect(choose(100, 50)).toBe(100891344545564193334812497256n);
  expect(choose(4, -1)).toBe(0n);
  expect(choose(4, 5)).toBe(0n);
  expect(choose(0, 0)).toBe(1n);
});
it('matches an independent oracle for every 2x2 observation pattern and both flag policies', () => {
  const values: CellValue[] = ['closed', 'flag', 0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let code = 0; code < values.length ** 4; code++) {
    let remainder = code;
    const cells = Array.from({ length: 4 }, () => {
      const value = values[remainder % values.length]!;
      remainder = Math.floor(remainder / values.length);
      return { value, source: 'manual' as const, uncertain: false };
    });
    for (let totalMines = 0; totalMines <= 4; totalMines++) for (const policy of ['trusted', 'reconsidered'] as FlagPolicy[]) {
      const board = { width: 2, height: 2, totalMines, revision: 0, cells };
      expect(solve(board, policy, options), `${code}/${totalMines}/${policy}`).toEqual(oracle(board, policy));
    }
  }
}, 30_000);
it('matches seeded 3x3 truth-derived boards including wrong flags and totals', () => {
  let seed = 823;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let trial = 0; trial < 400; trial++) {
    const mask = random() % 512;
    const bits = Array.from({ length: 9 }, (_, index) => (mask >>> index) & 1);
    const cells = bits.map((mine, index) => {
      let value: CellValue = 'closed';
      const mode = random() % 4;
      if (mode === 0) value = 'flag';
      else if (!mine && mode !== 1) {
        value = bits.reduce((sum, bit, other) => sum + (other !== index && Math.abs(other % 3 - index % 3) <= 1 && Math.abs(Math.floor(other / 3) - Math.floor(index / 3)) <= 1 ? bit : 0), 0) as CellValue;
      }
      return { value, source: 'manual' as const, uncertain: false };
    });
    const board = { width: 3, height: 3, revision: 0, totalMines: trial % 3 ? bits.reduce((a, b) => a + b, 0) : random() % 10, cells };
    for (const policy of ['trusted', 'reconsidered'] as FlagPolicy[]) expect(solve(board, policy, options)).toEqual(oracle(board, policy));
  }
});
