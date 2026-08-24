export class GridRefinementBudget {
  #consumed = 0;

  constructor(readonly limit: number = 20_000) {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new RangeError("Grid refinement limit must be a non-negative safe integer.");
    }
  }

  get consumed(): number {
    return this.#consumed;
  }

  get remaining(): number {
    return this.limit - this.#consumed;
  }

  reserve(count: number): boolean {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Grid refinement reservation must be a non-negative safe integer.");
    }
    if (count > this.remaining) return false;
    this.#consumed += count;
    return true;
  }
}
