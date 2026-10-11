import type { BoardSnapshot } from '../../src/board/types';
import type { SolveResult } from '../../src/solver/types';

// Independent whole-board truth table; deliberately does not import solver helpers.
export function oracle(board: BoardSnapshot): SolveResult {
  if (board.cells.length > 9) throw new RangeError('Oracle is limited to nine cells');
  const candidates = board.cells.flatMap((cell, index) =>
    cell.value === 'closed' ? [index] : []);
  const counts = new Array<number>(board.cells.length).fill(0);
  let total = 0;
  for (let mask = 0; mask < 2 ** board.cells.length; mask++) {
    const mine = (index: number) => (mask >>> index) & 1;
    if (board.cells.reduce((sum, _, index) => sum + mine(index), 0) !== board.totalMines) continue;
    let valid = true;
    for (let index = 0; index < board.cells.length; index++) {
      const cell = board.cells[index]!;
      if (cell.uncertain) { valid = false; break; }
      if (cell.value === 'flag' && !mine(index)) { valid = false; break; }
      if (typeof cell.value !== 'number') continue;
      if (mine(index)) { valid = false; break; }
      let adjacent = 0;
      for (let other = 0; other < board.cells.length; other++) {
        if (other !== index && Math.abs(other % board.width - index % board.width) <= 1
          && Math.abs(Math.floor(other / board.width) - Math.floor(index / board.width)) <= 1) adjacent += mine(other);
      }
      if (adjacent !== cell.value) { valid = false; break; }
    }
    if (!valid) continue;
    total++;
    candidates.forEach(index => { counts[index]! += mine(index); });
  }
  if (!total) return { status: 'inconsistent' };
  const safe = candidates.filter(index => counts[index] === 0);
  const mines = candidates.filter(index => counts[index] === total);
  if (safe.length || mines.length || !candidates.length) {
    return { status: 'solved', proposal: { safe, mines, guesses: [], primaryGuess: null } };
  }
  const least = Math.min(...candidates.map(index => counts[index]!));
  const guesses = candidates.filter(index => counts[index] === least);
  return { status: 'guess-required', proposal: { safe: [], mines: [], guesses, primaryGuess: guesses[0]! } };
}
