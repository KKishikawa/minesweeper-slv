import { expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board';
import { solve } from '../../src/solver/solve';
import type { SolverStatistics } from '../../src/solver/types';
import { oracle } from './oracle';

it('reports the shared node budget and component sizes without exposing partial proposals', () => {
  const board = editCell(editCell(createBoard(7, 1, 2, 0), 1, 1), 5, 1);
  const samples: SolverStatistics[] = [];
  const result = solve(board, 'trusted', { maxNodes: 4 }, stats => samples.push(stats));
  expect(result).toEqual({ status: 'limit-reached', reason: 'node-budget' });
  expect(samples.at(-1)).toMatchObject({ stage: 'enumeration', visitedNodes: 4,
    components: [
      { cells: 2, constraints: 1, visitedNodes: 4, status: 'limit-reached' },
      { cells: 2, constraints: 1, visitedNodes: 0, status: 'pending' },
    ] });
  expect(samples.at(-1)!.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(samples[0]!.stage).toBe('validation');
});

it('diagnostic observation preserves independently verified solver results and immutable samples', () => {
  const board = editCell(editCell(createBoard(7, 1, 3, 0), 1, 1), 5, 1);
  const samples: SolverStatistics[] = [];
  expect(solve(board, 'trusted', { maxNodes: 200_000 }, stats => samples.push(stats))).toEqual(oracle(board, 'trusted'));
  expect(samples.at(-1)).toMatchObject({ stage: 'complete', visitedNodes: 14,
    components: [{ visitedNodes: 7, status: 'completed' }, { visitedNodes: 7, status: 'completed' }] });
  expect(samples[0]!.components).toBeNull();
  expect(samples.find(sample => sample.components)?.components?.[0]?.status).toBe('pending');
});
