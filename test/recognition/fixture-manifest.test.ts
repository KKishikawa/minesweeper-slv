import { describe, expect, it } from "vitest";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("recognition fixture manifest", () => {
  it("contains four independently labeled 30 by 16 boards", async () => {
    const fixtures = await loadFixtureCases();
    expect(fixtures).toHaveLength(4);

    for (const fixture of fixtures) {
      expect(fixture.columns).toBe(30);
      expect(fixture.rows).toBe(16);
      expect(fixture.totalMines).toBe(99);
      expect(fixture.expectedCells).toHaveLength(480);
      expect(fixture.expectedBoardBounds.width).toBeGreaterThan(0);
      expect(fixture.expectedBoardBounds.height).toBeGreaterThan(0);
    }
  });

  it("covers every currently observed label", async () => {
    const fixtures = await loadFixtureCases();
    const labels = new Set(fixtures.flatMap((fixture) => fixture.expectedCells));
    expect(labels).toEqual(new Set(["closed", "empty", "flag", 1, 2, 3, 4, 5, 6]));
  });
});
