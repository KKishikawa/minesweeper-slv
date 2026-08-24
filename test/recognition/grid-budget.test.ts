import { expect, it } from "vitest";

import { GridRefinementBudget } from "../../src/recognition/grid-budget.js";

it("shares one limit across reservations", () => {
  const budget = new GridRefinementBudget(20_000);
  expect(budget.reserve(3_251)).toBe(true);
  expect(budget.reserve(16_749)).toBe(true);
  expect(budget.remaining).toBe(0);
  expect(budget.reserve(1)).toBe(false);
  expect(budget.consumed).toBe(20_000);
});

it("rejects invalid reservations without changing state", () => {
  const budget = new GridRefinementBudget(10);

  expect(() => budget.reserve(-1)).toThrow(RangeError);
  expect(() => budget.reserve(1.5)).toThrow(RangeError);
  expect(() => budget.reserve(Number.NaN)).toThrow(RangeError);
  expect(() => budget.reserve(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  expect(budget.consumed).toBe(0);
  expect(budget.remaining).toBe(10);
});

it("rejects invalid constructor limits", () => {
  expect(() => new GridRefinementBudget(-1)).toThrow(RangeError);
  expect(() => new GridRefinementBudget(1.5)).toThrow(RangeError);
  expect(() => new GridRefinementBudget(Number.NaN)).toThrow(RangeError);
  expect(() => new GridRefinementBudget(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  expect(() => new GridRefinementBudget(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
});
