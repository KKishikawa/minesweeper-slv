import type { BoardSnapshot, ValidationResult } from './types';

export function validateBoard(board: BoardSnapshot): ValidationResult {
  const { width, height, cells, totalMines } = board;
  const inconsistent = (reason: 'settings' | 'local' | 'total', cells: number[] = []): ValidationResult =>
    ({ status: 'inconsistent', reason, cells });
  if (![width, height].every(size => Number.isInteger(size) && size >= 1 && size <= 30)) {
    return inconsistent('settings');
  }
  if (cells.length !== width * height) return { status: 'needs-review', reason: 'dimensions', cells: [] };
  const uncertain = cells.flatMap((cell, index) => cell.uncertain ? [index] : []);
  if (uncertain.length) return { status: 'needs-review', reason: 'uncertain', cells: uncertain };
  if (!Number.isInteger(totalMines) || totalMines < 0 || totalMines > width * height) return inconsistent('settings');
  const isFlag = (index: number) => cells[index]?.value === 'flag';
  const isCandidate = (index: number) => cells[index]?.value === 'closed';
  const invalid: number[] = [];
  cells.forEach((cell, index) => {
    if (typeof cell.value !== 'number') return;
    const x = index % width;
    const y = Math.floor(index / width);
    let flags = 0;
    let candidates = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const neighbor = (y + dy) * width + x + dx;
        if (isFlag(neighbor)) flags++;
        if (isCandidate(neighbor)) candidates++;
      }
    }
    const remaining = cell.value - flags;
    if (remaining < 0 || remaining > candidates) invalid.push(index);
  });
  if (invalid.length) return inconsistent('local', invalid);
  const flags = cells.reduce((count, _, index) => count + Number(isFlag(index)), 0);
  const candidates = cells.reduce((count, _, index) => count + Number(isCandidate(index)), 0);
  if (totalMines - flags < 0 || totalMines - flags > candidates) return inconsistent('total');
  return { status: 'valid' };
}
