import { expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board';
import { validateBoard } from '../../src/board/validate';

it('treats input flags as fixed mines', () => {
  const board = editCell(editCell(createBoard(3, 1, 1, 0), 0, 0), 1, 'flag');
  expect(validateBoard(board)).toEqual({ status: 'inconsistent', reason: 'local', cells: [0] });
});
it('reports all impossible number cells in order', () => {
  const board = editCell(editCell(createBoard(3, 1, 1, 0), 0, 8), 2, 8);
  expect(validateBoard(board)).toEqual({ status: 'inconsistent', reason: 'local', cells: [0, 2] });
});
it('checks dimensions before uncertainty and numeric constraints', () => {
  const board = { ...createBoard(2, 1, 1, 0), cells: [{ value: 8 as const, source: 'recognition' as const, uncertain: true }] };
  expect(validateBoard(board)).toEqual({ status: 'needs-review', reason: 'dimensions', cells: [] });
  expect(validateBoard({ ...board, width: 1 })).toEqual({ status: 'needs-review', reason: 'uncertain', cells: [0] });
  expect(validateBoard({ ...board, width: NaN })).toEqual({ status: 'inconsistent', reason: 'settings', cells: [] });
});
it.each([-1, 2, NaN, 0.5])('rejects mine settings %s', totalMines => {
  expect(validateBoard({ ...createBoard(1, 1, 0, 0), totalMines })).toEqual({ status: 'inconsistent', reason: 'settings', cells: [] });
});
it('rejects too many flags or too few mine candidates', () => {
  expect(validateBoard(editCell(createBoard(1, 1, 0, 0), 0, 'flag'))).toEqual({ status: 'inconsistent', reason: 'total', cells: [] });
  expect(validateBoard(editCell(createBoard(1, 1, 1, 0), 0, 0))).toEqual({ status: 'inconsistent', reason: 'total', cells: [] });
});
it('does not mistake local validity for global satisfiability', () => {
  expect(validateBoard(editCell(createBoard(3, 1, 2, 0), 1, 1))).toEqual({ status: 'valid' });
});
it('does not wrap adjacency across row boundaries', () => {
  const board = editCell(editCell(createBoard(3, 2, 1, 0), 2, 0), 3, 'flag');
  expect(validateBoard(board)).toEqual({ status: 'valid' });
});
