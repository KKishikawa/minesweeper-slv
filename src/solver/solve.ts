import { validateBoard } from '../board/validate';
import { buildConstraints, reduceConstraints, splitComponents } from './constraints';
import { enumerateComponent } from './enumerate';
import { choose, convolve } from './combine';
import type { Solver } from './types';

export const solve: Solver = (board, policy, options) => {
  if (validateBoard(board, policy).status !== 'valid') return { status: 'inconsistent' };
  if (!Number.isSafeInteger(options.maxNodes) || options.maxNodes <= 0) return { status: 'limit-reached' };
  const reduced = reduceConstraints(buildConstraints(board, policy));
  if (reduced.inconsistent) return { status: 'inconsistent' };
  const candidates = board.cells.flatMap((cell, index) =>
    cell.value === 'closed' || (cell.value === 'flag' && policy === 'reconsidered') ? [index] : []);
  const flags = policy === 'trusted' ? board.cells.filter(cell => cell.value === 'flag').length : 0;
  const remaining = board.totalMines - flags - reduced.mines.length;
  const fixed = new Set([...reduced.safe, ...reduced.mines]);
  const budget = { visited: 0, maxNodes: options.maxNodes };
  const components = [];
  for (const constraints of splitComponents(reduced.constraints)) {
    const component = enumerateComponent(constraints, budget);
    if (component.limited) return { status: 'limit-reached' };
    components.push(component);
  }
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
  if (total === 0n) return { status: 'inconsistent' };
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
  if (safe.length || mines.length || !candidates.length) return { status: 'solved', proposal: { safe, mines, guesses: [], primaryGuess: null } };
  // All candidates share the same denominator (total), so numerator comparison is exact.
  let minimum = total;
  for (const count of mineCounts.values()) if (count < minimum) minimum = count;
  const guesses = candidates.filter(cell => mineCounts.get(cell) === minimum);
  return { status: 'guess-required', proposal: { safe: [], mines: [], guesses, primaryGuess: guesses[0]! } };
};
