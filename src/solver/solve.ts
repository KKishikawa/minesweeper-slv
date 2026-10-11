import { validateBoard } from '../board/validate';
import { buildConstraints, reduceConstraints, splitComponents } from './constraints';
import { enumerateComponent } from './enumerate';
import { choose, convolve } from './combine';
import type { Solver, SolveResult, SolverStatistics } from './types';

export const solve: Solver = (board, options, observe) => {
  const started = observe ? performance.now() : 0;
  const budget = { visited: 0, maxNodes: options.maxNodes };
  const statistics: SolverStatistics = { stage: 'validation', visitedNodes: 0, elapsedMs: 0, components: null };
  const sample = () => observe?.({ ...statistics, visitedNodes: budget.visited,
    elapsedMs: performance.now() - started, components: statistics.components?.map(component => ({ ...component })) ?? null });
  const finish = (result: SolveResult): SolveResult => { sample(); return result; };
  sample();
  if (validateBoard(board).status !== 'valid') return finish({ status: 'inconsistent' });
  if (!Number.isSafeInteger(options.maxNodes) || options.maxNodes <= 0) return finish({ status: 'limit-reached', reason: 'node-budget' });
  statistics.stage = 'reduction';
  sample();
  const reduced = reduceConstraints(buildConstraints(board));
  if (reduced.inconsistent) return finish({ status: 'inconsistent' });
  const candidates = board.cells.flatMap((cell, index) =>
    cell.value === 'closed' ? [index] : []);
  const flags = board.cells.filter(cell => cell.value === 'flag').length;
  const remaining = board.totalMines - flags - reduced.mines.length;
  const fixed = new Set([...reduced.safe, ...reduced.mines]);
  const components = [];
  const groups = splitComponents(reduced.constraints);
  if (observe) statistics.components = groups.map(constraints => ({
    cells: new Set(constraints.flatMap(constraint => constraint.cells)).size,
    constraints: constraints.length, visitedNodes: 0, status: 'pending',
  }));
  statistics.stage = 'enumeration';
  sample();
  for (const [index, constraints] of groups.entries()) {
    const stats = statistics.components?.[index];
    const before = budget.visited;
    if (stats) stats.status = 'exploring';
    sample();
    const component = enumerateComponent(constraints, budget, observe ? () => {
      if (stats) stats.visitedNodes = budget.visited - before;
      sample();
    } : undefined);
    if (stats) { stats.visitedNodes = budget.visited - before; stats.status = component.limited ? 'limit-reached' : 'completed'; }
    if (component.limited) return finish({ status: 'limit-reached', reason: 'node-budget' });
    components.push(component);
  }
  statistics.stage = 'combination';
  sample();
  const frontier = new Set(components.flatMap(component => [...component.mineWays.keys()]));
  const free = candidates.filter(cell => !fixed.has(cell) && !frontier.has(cell));
  const unit = () => new Map([[0, 1n]]);
  const prefix = [unit()];
  for (const component of components) prefix.push(convolve(prefix.at(-1)!, component.ways));
  const suffix: Map<number, bigint>[] = new Array(components.length + 1);
  suffix[components.length] = unit();
  for (let index = components.length - 1; index >= 0; index--) suffix[index] = convolve(components[index]!.ways, suffix[index + 1]!);
  const weight = (distribution: Map<number, bigint>, freeCount: number, target: number) => {
    let result = 0n;
    for (const [count, ways] of distribution) result += ways * choose(freeCount, target - count);
    return result;
  };
  const total = weight(prefix.at(-1)!, free.length, remaining);
  if (total === 0n) return finish({ status: 'inconsistent' });
  const mineCounts = new Map<number, bigint>();
  reduced.safe.forEach(cell => mineCounts.set(cell, 0n));
  reduced.mines.forEach(cell => mineCounts.set(cell, total));
  components.forEach((component, index) => {
    const others = convolve(prefix[index]!, suffix[index + 1]!);
    for (const [cell, counts] of component.mineWays) mineCounts.set(cell, weight(convolve(others, counts), free.length, remaining));
  });
  if (free.length) {
    const count = weight(prefix.at(-1)!, free.length - 1, remaining - 1);
    free.forEach(cell => mineCounts.set(cell, count));
  }
  const safe = candidates.filter(cell => mineCounts.get(cell) === 0n);
  const mines = candidates.filter(cell => mineCounts.get(cell) === total);
  statistics.stage = 'complete';
  if (safe.length || mines.length || !candidates.length) return finish({ status: 'solved', proposal: { safe, mines, guesses: [], primaryGuess: null } });
  // All candidates share the same denominator (total), so numerator comparison is exact.
  let minimum = total;
  for (const count of mineCounts.values()) if (count < minimum) minimum = count;
  const guesses = candidates.filter(cell => mineCounts.get(cell) === minimum);
  return finish({ status: 'guess-required', proposal: { safe: [], mines: [], guesses, primaryGuess: guesses[0]! } });
};
