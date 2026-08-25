import { describe, expect, it } from "vitest";

import { buildPrototypeSet } from "../../src/recognition/prototypes.js";
import {
  RECOGNITION_CONFIDENCE_THRESHOLD,
  recognizeBoard,
  selectSharedConfidenceThreshold,
} from "../../src/recognition/recognize.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { buildFixtureSamples } from "./samples.js";

describe("recognizeBoard spike evidence", () => {
  it("never accepts a wrong derivative cell with high confidence", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    for (const fixture of fixtures) {
      for (const derived of (await deriveImages(fixture.imagePath)).slice(1)) {
        const result = recognizeBoard({ image: derived.image, columns: 30, rows: 16 }, prototypes);
        expect(result.status, `${fixture.id}/${derived.name}`).not.toBe("grid-not-found");
        expect(result.status, `${fixture.id}/${derived.name}`).toBe(
          result.uncertainCellIndices.length === 0 ? "recognized" : "needs-review",
        );
        expect(result.uncertainCellIndices, `${fixture.id}/${derived.name}`).toEqual(
          result.cells
            .filter((cell) => cell.confidence < RECOGNITION_CONFIDENCE_THRESHOLD)
            .map((cell) => cell.index),
        );
        const wrongCertain = result.cells.filter((cell, index) =>
          cell.label !== fixture.expectedCells[index] && !result.uncertainCellIndices.includes(index),
        );
        expect(wrongCertain, `${fixture.id}/${derived.name}`).toEqual([]);
        expect(result.uncertainCellIndices.length).toBeLessThanOrEqual(4);
      }
    }
  }, 30_000);

  it("uses the lowest shared threshold calibrated across all fixture variants", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    const calibrationCases = [];
    for (const fixture of fixtures) {
      for (const derived of await deriveImages(fixture.imagePath)) {
        const result = recognizeBoard({ image: derived.image, columns: 30, rows: 16 }, prototypes);
        expect(result.status, `${fixture.id}/${derived.name}`).not.toBe("grid-not-found");
        calibrationCases.push({
          kind: derived.name === "source" ? "source" as const : "derivative" as const,
          cells: result.cells.map((cell, index) => ({
            confidence: cell.confidence,
            correct: cell.label === fixture.expectedCells[index],
          })),
        });
      }
    }

    expect(selectSharedConfidenceThreshold(calibrationCases)).toBe(RECOGNITION_CONFIDENCE_THRESHOLD);
  }, 30_000);
});
