import { describe, expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board';
import { buildConstraints, reduceConstraints, splitComponents } from '../../src/solver/constraints';

describe('constraint derivation', () => {
  it('derives edge and corner neighbors without wrapping rows', () => {
    let board = createBoard(3, 2, 1, 0);
    board = editCell(board, 0, 1);
    expect(buildConstraints(board, 'trusted')).toEqual([{ cells: [1, 3, 4], mines: 1 }]);
  });

  it('subtracts trusted flags but includes reconsidered flags as candidates', () => {
    let board = createBoard(2, 2, 1, 0);
    board = editCell(board, 0, 1);
    board = editCell(board, 1, 'flag');
    expect(buildConstraints(board, 'trusted')).toEqual([{ cells: [2, 3], mines: 0 }]);
    expect(buildConstraints(board, 'reconsidered')).toEqual([{ cells: [1, 2, 3], mines: 1 }]);
  });
});

describe('fixed point reduction', () => {
  it('包含制約の差分から安全セルを得る', () => {
    const result = reduceConstraints([
      { cells: [0, 1], mines: 1 }, { cells: [0, 1, 2], mines: 1 },
    ]);
    expect(result.safe).toContain(2);
    expect(result.inconsistent).toBe(false);
  });

  it('propagates assignments and subset differences until no more cells resolve', () => {
    const result = reduceConstraints([
      { cells: [0, 1], mines: 1 },
      { cells: [0, 1, 2], mines: 2 },
      { cells: [2, 3], mines: 1 },
      { cells: [3, 4], mines: 1 },
    ]);
    expect(result.safe).toEqual([3]);
    expect(result.mines).toEqual([2, 4]);
    expect(result.constraints).toEqual([{ cells: [0, 1], mines: 1 }]);
  });

  it('deduplicates equivalent constraints and resolves zero and full sets', () => {
    const result = reduceConstraints([
      { cells: [2, 1], mines: 0 },
      { cells: [1, 2], mines: 0 },
      { cells: [3], mines: 1 },
    ]);
    expect(result).toEqual({ constraints: [], safe: [1, 2], mines: [3], inconsistent: false });
  });

  it.each([
    [[{ cells: [], mines: 1 }]],
    [[{ cells: [0], mines: -1 }]],
    [[{ cells: [0], mines: 2 }]],
    [[{ cells: [0, 1], mines: 0 }, { cells: [1, 0], mines: 1 }]],
    [[{ cells: [0], mines: 1 }, { cells: [0], mines: 0 }]],
  ])('detects impossible residual or conflicting assignments: %j', (constraints) => {
    expect(reduceConstraints(constraints).inconsistent).toBe(true);
  });

  it('retains overlapping non-subset equations and their mine counts', () => {
    const result = reduceConstraints([
      { cells: [0, 1], mines: 1 }, { cells: [1, 2], mines: 1 },
    ]);
    expect(result.constraints).toEqual([
      { cells: [0, 1], mines: 1 }, { cells: [1, 2], mines: 1 },
    ]);
  });
});

describe('component partitioning', () => {
  it('joins constraints sharing candidate cells transitively', () => {
    expect(splitComponents([
      { cells: [0, 1], mines: 1 },
      { cells: [5], mines: 1 },
      { cells: [1, 2], mines: 1 },
      { cells: [2, 3], mines: 2 },
    ])).toEqual([
      [{ cells: [0, 1], mines: 1 }, { cells: [1, 2], mines: 1 }, { cells: [2, 3], mines: 2 }],
      [{ cells: [5], mines: 1 }],
    ]);
  });

  it('keeps duplicate constraints in the same component', () => {
    expect(splitComponents([
      { cells: [2, 1], mines: 1 }, { cells: [1, 2], mines: 1 },
    ])).toEqual([[{ cells: [1, 2], mines: 1 }, { cells: [1, 2], mines: 1 }]]);
  });
});
