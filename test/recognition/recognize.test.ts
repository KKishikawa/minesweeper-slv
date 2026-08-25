import { describe, expect, it } from "vitest";

import { buildPrototypeSet } from "../../src/recognition/prototypes.js";
import {
  evaluateConfidenceThresholds,
  recognizeBoard,
  selectSharedConfidenceThreshold,
} from "../../src/recognition/recognize.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { buildFixtureSamples } from "./samples.js";

describe("recognizeBoard acceptance", () => {
  it("accepts every source fixture without uncertain cells", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    for (const fixture of fixtures) {
      const [source] = await deriveImages(fixture.imagePath);
      if (!source) throw new Error(`source derivative missing for ${fixture.id}`);
      const result = recognizeBoard({ image: source.image, columns: 30, rows: 16 }, prototypes);
      expect(result.status, fixture.id).toBe("recognized");
      expect(result.cells.map((cell) => cell.label)).toEqual(fixture.expectedCells);
      expect(result.cells.map((cell) => cell.index)).toEqual(
        Array.from({ length: fixture.expectedCells.length }, (_, index) => index),
      );
      expect(result.cells.every((cell) => (
        cell.candidates.every((candidate, index, candidates) => (
          index === 0 || candidates[index - 1]!.distance <= candidate.distance
        ))
      ))).toBe(true);
      expect(result.uncertainCellIndices).toEqual([]);
    }
  }, 30_000);
});

describe("recognizeBoard contract", () => {
  const blankImage: PixelImage = {
    width: 16,
    height: 16,
    data: new Uint8ClampedArray(16 * 16 * 4),
  };

  it.each([
    { columns: 0, rows: 1 },
    { columns: -1, rows: 1 },
    { columns: 1.5, rows: 1 },
    { columns: 1, rows: 0 },
    { columns: 1, rows: -1 },
    { columns: 1, rows: 1.5 },
  ])("rejects non-positive or non-integer dimensions: $columns x $rows", ({ columns, rows }) => {
    expect(() => recognizeBoard({ image: blankImage, columns, rows }, { prototypes: [] })).toThrow(RangeError);
  });

  it("returns the empty grid-not-found result when detection fails", () => {
    const result = recognizeBoard({ image: blankImage, columns: 1, rows: 1 }, { prototypes: [] });

    expect(result.status).toBe("grid-not-found");
    expect(result.geometry).toBeNull();
    expect(result.cells).toEqual([]);
    expect(result.uncertainCellIndices).toEqual([]);
    expect(Number.isFinite(result.elapsedMs)).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe("shared confidence calibration", () => {
  const calibrationCases = [
    {
      kind: "source" as const,
      cells: [
        { confidence: 0.47, correct: true },
        { confidence: 0.90, correct: true },
      ],
    },
    {
      kind: "derivative" as const,
      cells: [
        { confidence: 0.32, correct: false },
        { confidence: 0.31, correct: true },
        { confidence: 0.80, correct: true },
      ],
    },
  ];

  it("selects the lowest candidate that satisfies every mandatory gate", () => {
    expect(selectSharedConfidenceThreshold(calibrationCases)).toBe(0.35);
  });

  it("reports every fixed candidate without hiding certain errors as review cells", () => {
    expect(evaluateConfidenceThresholds(calibrationCases)).toEqual([
      {
        threshold: 0.25,
        sourceHighConfidenceErrors: 0,
        sourceUncertainCells: 0,
        derivativeHighConfidenceErrors: 1,
        maximumDerivativeUncertainCells: 0,
        derivativeUncertainCells: 0,
        passesMandatory: false,
      },
      {
        threshold: 0.30,
        sourceHighConfidenceErrors: 0,
        sourceUncertainCells: 0,
        derivativeHighConfidenceErrors: 1,
        maximumDerivativeUncertainCells: 0,
        derivativeUncertainCells: 0,
        passesMandatory: false,
      },
      {
        threshold: 0.35,
        sourceHighConfidenceErrors: 0,
        sourceUncertainCells: 0,
        derivativeHighConfidenceErrors: 0,
        maximumDerivativeUncertainCells: 2,
        derivativeUncertainCells: 2,
        passesMandatory: true,
      },
      {
        threshold: 0.40,
        sourceHighConfidenceErrors: 0,
        sourceUncertainCells: 0,
        derivativeHighConfidenceErrors: 0,
        maximumDerivativeUncertainCells: 2,
        derivativeUncertainCells: 2,
        passesMandatory: true,
      },
      {
        threshold: 0.45,
        sourceHighConfidenceErrors: 0,
        sourceUncertainCells: 0,
        derivativeHighConfidenceErrors: 0,
        maximumDerivativeUncertainCells: 2,
        derivativeUncertainCells: 2,
        passesMandatory: true,
      },
      {
        threshold: 0.50,
        sourceHighConfidenceErrors: 0,
        sourceUncertainCells: 1,
        derivativeHighConfidenceErrors: 0,
        maximumDerivativeUncertainCells: 2,
        derivativeUncertainCells: 2,
        passesMandatory: false,
      },
    ]);
  });

  it("returns null when no shared candidate satisfies the mandatory gates", () => {
    expect(selectSharedConfidenceThreshold([
      { kind: "source", cells: [{ confidence: 0.20, correct: true }] },
    ])).toBeNull();
  });
});
