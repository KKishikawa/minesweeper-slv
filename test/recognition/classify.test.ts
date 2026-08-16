import { describe, expect, it } from "vitest";

import { classifyCell } from "../../src/recognition/classify.js";
import { extractFeatures } from "../../src/recognition/features.js";
import { cellRect, detectGrid } from "../../src/recognition/grid.js";
import { normalizeCell } from "../../src/recognition/normalize.js";
import { buildPrototypeSet } from "../../src/recognition/prototypes.js";
import { cropImage } from "../../src/recognition/pixels.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { decodeImage } from "./image-io.js";
import { buildFixtureSamples } from "./samples.js";

describe("cell normalization", () => {
  it("produces a stable 16 by 16 RGBA image", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");
    const image = await decodeImage(fixture.imagePath);
    const grid = detectGrid(image, fixture);
    if (!grid) throw new Error("grid was not detected");
    const normalized = normalizeCell(cropImage(image, cellRect(grid, 0, 0)));
    expect(normalized.width).toBe(16);
    expect(normalized.height).toBe(16);
    expect(normalized.data).toHaveLength(16 * 16 * 4);
  });
});

describe("cell classification", () => {
  it("classifies every source cell with the correct top candidate", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    for (const fixture of fixtures) {
      const image = await decodeImage(fixture.imagePath);
      const grid = detectGrid(image, fixture);
      if (!grid) throw new Error(`grid missing for ${fixture.id}`);
      for (let index = 0; index < fixture.expectedCells.length; index += 1) {
        const column = index % fixture.columns;
        const row = Math.floor(index / fixture.columns);
        const normalized = normalizeCell(cropImage(image, cellRect(grid, column, row)));
        const result = classifyCell(extractFeatures(normalized), prototypes);
        expect(result.label, `${fixture.id} cell ${index}`).toBe(fixture.expectedCells[index]);
      }
    }
  });
});
