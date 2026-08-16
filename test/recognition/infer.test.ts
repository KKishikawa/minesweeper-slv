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

  it("keeps only exact left-counter readings as observed successes", async () => {
    let correctCases = 0;
    let evaluatedCases = 0;
    for (const fixture of await loadFixtureCases()) {
      const [source] = await deriveImages(fixture.imagePath);
      if (!source) throw new Error(`source derivative missing for ${fixture.id}`);
      const grid = detectGrid(source.image, fixture);
      if (!grid) throw new Error(`grid missing for ${fixture.id}`);
      const result = readRemainingMineCounter(source.image, grid);
      evaluatedCases += 1;
      if (!result) continue;
      expect(result.value, fixture.id).toBe(fixture.expectedRemainingMines);
      expect(result.digits).toHaveLength(3);
      correctCases += 1;
    }
    expect({ correctCases, evaluatedCases }).toEqual({ correctCases: 3, evaluatedCases: 4 });
  });
});
