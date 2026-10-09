import type { BoardSnapshot, FlagPolicy } from '../board/types';

export interface Constraint { cells: number[]; mines: number }

const sorted = (values: Iterable<number>): number[] => [...new Set(values)].sort((a, b) => a - b);

export function buildConstraints(board: BoardSnapshot, policy: FlagPolicy): Constraint[] {
  const result: Constraint[] = [];
  board.cells.forEach((cell, index) => {
    if (typeof cell.value !== 'number') return;
    const x = index % board.width;
    const y = Math.floor(index / board.width);
    const cells: number[] = [];
    let mines = cell.value as number;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= board.width || ny >= board.height) continue;
        const neighbor = ny * board.width + nx;
        const value = board.cells[neighbor]!.value;
        if (value === 'flag' && policy === 'trusted') mines--;
        else if (value === 'closed' || value === 'flag') cells.push(neighbor);
      }
    }
    result.push({ cells, mines });
  });
  return result;
}

export function reduceConstraints(input: Constraint[]): {
  constraints: Constraint[]; safe: number[]; mines: number[]; inconsistent: boolean;
} {
  let constraints = input.map(({ cells, mines }) => ({ cells: sorted(cells), mines }));
  const safe = new Set<number>();
  const mines = new Set<number>();
  const failure = () => ({ constraints: [], safe: [], mines: [], inconsistent: true });
  for (;;) {
    const unique = new Map<string, Constraint>();
    let assigned = false;
    for (const constraint of constraints) {
      const remaining = constraint.mines - constraint.cells.filter(cell => mines.has(cell)).length;
      const cells = constraint.cells.filter(cell => !safe.has(cell) && !mines.has(cell));
      if (remaining < 0 || remaining > cells.length) return failure();
      if (!cells.length) continue;
      const key = cells.join(',');
      const existing = unique.get(key);
      if (existing && existing.mines !== remaining) return failure();
      unique.set(key, { cells, mines: remaining });
      if (remaining === 0 || remaining === cells.length) {
        const target = remaining === 0 ? safe : mines;
        for (const cell of cells) target.add(cell);
        assigned = true;
      }
    }
    constraints = [...unique.values()];
    if (assigned) continue;
    // A strict subset equation can be subtracted without losing either original equation.
    const derived: Constraint[] = [];
    for (const smaller of constraints) {
      const members = new Set(smaller.cells);
      for (const larger of constraints) {
        if (smaller.cells.length >= larger.cells.length || !smaller.cells.every(cell => larger.cells.includes(cell))) continue;
        const cells = larger.cells.filter(cell => !members.has(cell));
        const remaining = larger.mines - smaller.mines;
        if (remaining < 0 || remaining > cells.length) return failure();
        const key = cells.join(',');
        const existing = unique.get(key);
        if (existing) {
          if (existing.mines !== remaining) return failure();
        } else {
          const difference = { cells, mines: remaining };
          unique.set(key, difference);
          derived.push(difference);
        }
      }
    }
    if (!derived.length) return { constraints, safe: sorted(safe), mines: sorted(mines), inconsistent: false };
    constraints.push(...derived);
  }
}

export function splitComponents(input: Constraint[]): Constraint[][] {
  const constraints = input.map(({ cells, mines }) => ({ cells: sorted(cells), mines }));
  const byCell = new Map<number, number[]>();
  constraints.forEach((constraint, index) => {
    for (const cell of constraint.cells) {
      const indices = byCell.get(cell) ?? [];
      indices.push(index);
      byCell.set(cell, indices);
    }
  });
  const visited = new Set<number>();
  const components: Constraint[][] = [];
  for (let start = 0; start < constraints.length; start++) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    for (let position = 0; position < queue.length; position++) {
      for (const cell of constraints[queue[position]!]!.cells) {
        for (const next of byCell.get(cell)!) {
          if (!visited.has(next)) { visited.add(next); queue.push(next); }
        }
      }
    }
    components.push(queue.sort((a, b) => a - b).map(index => constraints[index]!));
  }
  return components;
}
