import type { BoardSnapshot, CellValue } from './types';

export function createBoard(width: number, height: number, totalMines: number, revision: number): BoardSnapshot {
  if (![width, height].every(size => Number.isInteger(size) && size >= 1 && size <= 30)
    || !Number.isInteger(totalMines) || totalMines < 0 || totalMines > width * height
    || !Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Invalid board settings');
  }
  return {
    width, height, totalMines, revision,
    cells: Array.from({ length: width * height }, () => ({
      value: 'closed', source: 'manual', uncertain: false,
    })),
  };
}

export function editCell(board: BoardSnapshot, index: number, value: CellValue): BoardSnapshot {
  if (!Number.isSafeInteger(board.revision) || board.revision < 0 || board.revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Revision cannot advance');
  }
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) {
    throw new RangeError('Invalid cell index');
  }
  const cells = [...board.cells];
  cells[index] = { value, source: 'manual', uncertain: false };
  return { ...board, revision: board.revision + 1, cells };
}
