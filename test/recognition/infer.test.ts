import { describe, expect, it } from "vitest";

import { detectGrid } from "../../src/recognition/grid.js";
import { inferDimensions, readRemainingMineCounter } from "../../src/recognition/infer.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("optional image hints", () => {
  it("returns no dimension hint when the full edge-profile matrix is ambiguous", async () => {
    let evaluatedCases = 0;
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveImages(fixture.imagePath)) {
        evaluatedCases += 1;
        expect(inferDimensions(derived.image), `${fixture.id}/${derived.name}`).toBeNull();
      }
    }
    expect(evaluatedCases).toBe(16);
  }, 10_000);

  it("keeps each observed left-counter outcome fixed", async () => {
    const expected = [
      { value: 99, digits: [0, 9, 9] },
      null,
      { value: 80, digits: [0, 8, 0] },
      { value: 2, digits: [0, 0, 2] },
    ] as const;
    let evaluatedCases = 0;
    for (const fixture of await loadFixtureCases()) {
      const [source] = await deriveImages(fixture.imagePath);
      if (!source) throw new Error(`source derivative missing for ${fixture.id}`);
      const grid = detectGrid(source.image, fixture);
      if (!grid) throw new Error(`grid missing for ${fixture.id}`);
      const result = readRemainingMineCounter(source.image, grid);
      evaluatedCases += 1;
      const expectedResult = expected[Number(fixture.id)];
      if (!expectedResult) {
        expect(result, fixture.id).toBeNull();
        continue;
      }
      expect(result?.value, fixture.id).toBe(expectedResult.value);
      expect(result?.digits, fixture.id).toEqual(expectedResult.digits);
      expect(result?.confidence, fixture.id).toBeGreaterThan(0);
      expect(result?.confidence, fixture.id).toBeLessThanOrEqual(1);
    }
    expect(evaluatedCases).toBe(4);
  });
});
