import { describe, expect, it } from 'vitest';
import { createBoard, editCell } from '../../src/board/board';

describe('manual board', () => {
  it('creates closed observations and preserves requested revision', () => {
    expect(createBoard(1, 1, 0, 4)).toEqual({ width: 1, height: 1, totalMines: 0, revision: 4,
      cells: [{ value: 'closed', source: 'manual', uncertain: false }] });
    expect(createBoard(30, 30, 900, 0).cells).toHaveLength(900);
  });
  it.each([0, 1, 8, 'flag', 'closed'] as const)('edits %s without mutating input', value => {
    const before = createBoard(3, 1, 1, 4);
    const after = editCell(before, 1, value);
    expect(before.cells[1]?.value).toBe('closed');
    expect(after.revision).toBe(5);
    expect(after.cells[1]).toEqual({ value, source: 'manual', uncertain: false });
    expect(after.cells[0]).toEqual(before.cells[0]);
    expect(after.cells[2]).toEqual(before.cells[2]);
  });
  it.each([0, -1, 31, 1.5, NaN, Infinity])('rejects invalid dimension %s', size => {
    expect(() => createBoard(size, 1, 0, 0)).toThrow(RangeError);
    expect(() => createBoard(1, size, 0, 0)).toThrow(RangeError);
  });
  it.each([-1, 2, 0.5, NaN, Infinity])('rejects invalid mine count %s', mines => {
    expect(() => createBoard(1, 1, mines, 0)).toThrow(RangeError);
  });
  it.each([-1, 3, 0.5, NaN, Infinity])('rejects invalid index %s', index => {
    expect(() => editCell(createBoard(3, 1, 1, 0), index, 0)).toThrow(RangeError);
  });
  it('replaces recognition uncertainty with a manual observation', () => {
    const before = { ...createBoard(1, 1, 0, 7), cells: [{ value: 0 as const, source: 'recognition' as const, uncertain: true }] };
    expect(editCell(before, 0, 0).cells[0]).toEqual({ value: 0, source: 'manual', uncertain: false });
    expect(before.cells[0]?.uncertain).toBe(true);
  });
  it('recreates a board with the next revision and retained settings', () => {
    const before = editCell(createBoard(2, 1, 1, 8), 0, 'flag');
    const reset = createBoard(before.width, before.height, before.totalMines, before.revision + 1);
    expect(reset.revision).toBe(10);
    expect(reset.cells.map(cell => cell.value)).toEqual(['closed', 'closed']);
    expect(reset.totalMines).toBe(1);
  });
});
