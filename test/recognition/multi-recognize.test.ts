import { describe, expect, it } from "vitest";

import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import { recognizeBoardWithBank } from "../../src/recognition/multi-recognize.js";
import type { PrototypeBank } from "../../src/recognition/prototype-bank.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { syntheticGridImage } from "./synthetic-grid.js";

function feature(value: number): Float64Array {
  return new Float64Array(FEATURE_LENGTH).fill(value);
}

function bankWithAbsoluteGateFailure(): PrototypeBank {
  return {
    formatVersion: 1,
    featureVersion: "features-v1",
    scaler: { center: feature(0), scale: feature(1) },
    prototypes: [
      { label: 1, vector: feature(-100_000) },
      { label: 2, vector: feature(-200_000) },
    ],
    thresholds: { relativeMargin: 0.5, absoluteDistance: 0 },
  };
}

describe("recognizeBoardWithBank", () => {
  const blankImage: PixelImage = {
    width: 16,
    height: 16,
    data: new Uint8ClampedArray(16 * 16 * 4),
  };

  it("marks every row-major cell for review when the absolute confidence gate fails", () => {
    const boundaries = [20, 60, 100, 140, 180];
    const result = recognizeBoardWithBank({
      image: syntheticGridImage(220, 220, boundaries, boundaries, false),
      columns: 4,
      rows: 4,
    }, bankWithAbsoluteGateFailure());

    expect(result.status).toBe("needs-review");
    expect(result.cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(result.cells.every((cell) => cell.confidence >= 0.5)).toBe(true);
    expect(result.uncertainCellIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it.each([
    { columns: 0, rows: 1 },
    { columns: -1, rows: 1 },
    { columns: 1.5, rows: 1 },
    { columns: 1, rows: 0 },
    { columns: 1, rows: -1 },
    { columns: 1, rows: 1.5 },
  ])("rejects non-positive or non-integer dimensions: $columns x $rows", ({ columns, rows }) => {
    expect(() => recognizeBoardWithBank({ image: blankImage, columns, rows }, bankWithAbsoluteGateFailure())).toThrow(RangeError);
  });

  it("returns the empty grid-not-found result when detection fails", () => {
    const result = recognizeBoardWithBank({ image: blankImage, columns: 1, rows: 1 }, bankWithAbsoluteGateFailure());

    expect(result.status).toBe("grid-not-found");
    expect(result.geometry).toBeNull();
    expect(result.cells).toEqual([]);
    expect(result.uncertainCellIndices).toEqual([]);
    expect(Number.isFinite(result.elapsedMs)).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    { name: "zero width", image: { width: 0, height: 16, data: new Uint8ClampedArray() } },
    { name: "fractional height", image: { width: 16, height: 1.5, data: new Uint8ClampedArray(16 * 6) } },
    { name: "non-RGBA data length", image: { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 3) } },
  ])("rejects a gridless image with $name", ({ image }) => {
    expect(() => recognizeBoardWithBank({
      image,
      columns: 1,
      rows: 1,
    }, bankWithAbsoluteGateFailure())).toThrow(RangeError);
  });

  it("rejects an unsupported bank before returning grid-not-found", () => {
    const unsupportedBank = {
      ...bankWithAbsoluteGateFailure(),
      formatVersion: 2,
    } as unknown as PrototypeBank;

    expect(() => recognizeBoardWithBank({
      image: blankImage,
      columns: 1,
      rows: 1,
    }, unsupportedBank)).toThrow(RangeError);
  });
});
