import type { Constraint } from './constraints';

export interface Enumeration {
  ways: Map<number, bigint>;
  mineWays: Map<number, Map<number, bigint>>;
  limited: boolean;
}
export function enumerateComponent(constraints: Constraint[], budget: { visited: number; maxNodes: number }): Enumeration {
  const cells = [...new Set(constraints.flatMap(constraint => constraint.cells))].sort((a, b) => a - b);
  const assignment = new Map<number, number>();
  const ways = new Map<number, bigint>();
  const mineWays = new Map(cells.map(cell => [cell, new Map<number, bigint>()]));
  let limited = false;
  function visit(position: number, count: number): void {
    if (limited) return;
    if (budget.visited >= budget.maxNodes) { limited = true; return; }
    budget.visited++;
    for (const constraint of constraints) {
      let assigned = 0;
      let open = 0;
      for (const cell of constraint.cells) {
        const value = assignment.get(cell);
        if (value === undefined) open++;
        else assigned += value;
      }
      if (assigned > constraint.mines || assigned + open < constraint.mines) return;
    }
    if (position === cells.length) {
      ways.set(count, (ways.get(count) ?? 0n) + 1n);
      for (const cell of cells) if (assignment.get(cell) === 1) {
        const counts = mineWays.get(cell)!;
        counts.set(count, (counts.get(count) ?? 0n) + 1n);
      }
      return;
    }
    const cell = cells[position]!;
    assignment.set(cell, 0);
    visit(position + 1, count);
    assignment.set(cell, 1);
    visit(position + 1, count + 1);
    assignment.delete(cell);
  }
  visit(0, 0);
  return limited ? { ways: new Map(), mineWays: new Map(), limited: true } : { ways, mineWays, limited: false };
}
