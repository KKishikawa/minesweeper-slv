import { describe, expect, it } from "vitest";

import { cellRect, countCompatibleGridCandidatePairs, detectGrid } from "../../src/recognition/grid.js";
import { GridRefinementBudget } from "../../src/recognition/grid-budget.js";
import { detectStrictGridAttempt } from "../../src/recognition/grid-strict.js";
import type { GridGeometry, PixelImage, Rect } from "../../src/recognition/types.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { decodeImage } from "./image-io.js";
import { syntheticGridImage } from "./synthetic-grid.js";
import {
  eraseIntersection,
  syntheticCandidateOverflowImage,
  syntheticDeterministicNoiseImage,
  syntheticSparseIntersectionImage,
  syntheticTwoContrastGridImage,
} from "./grid-fixtures.js";

describe("detectGrid", () => {
  it("exposes source evidence for a direct strict detection", () => {
    const verticalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const horizontalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const attempt = detectStrictGridAttempt(
      syntheticGridImage(140, 140, verticalBoundaries, horizontalBoundaries, false),
      { columns: 4, rows: 4 },
      new GridRefinementBudget(20_000),
    );

    expect(attempt.status).toBe("found");
    if (attempt.status !== "found") return;
    expect(attempt.geometry.bounds).toEqual({ x: 20, y: 20, width: 80, height: 80 });
    expect(attempt.coarseEvidence.vertical).not.toHaveLength(0);
    expect(attempt.coarseEvidence.horizontal).not.toHaveLength(0);
    expect(attempt.sourceContext.refinedCandidates).not.toHaveLength(0);
    expect(attempt.refinedPairCount).toBeGreaterThan(0);
  });

  it("counts only pitch-compatible pairs and rejects over-budget refinement work", () => {
    const verticalBuckets = [
      { pitch: 10, candidateCount: 150 },
      { pitch: 30, candidateCount: 1_000 },
    ];
    const horizontalBuckets = [
      { pitch: 10, candidateCount: 150 },
      { pitch: 20, candidateCount: 1_000 },
    ];

    expect(countCompatibleGridCandidatePairs(verticalBuckets, horizontalBuckets, 30_000)).toBe(22_500);
    expect(countCompatibleGridCandidatePairs(verticalBuckets, horizontalBuckets, 20_000)).toBeNull();
  });

  it("stops a later attempt once the shared refinement budget is exhausted", () => {
    const verticalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const horizontalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const image = syntheticGridImage(140, 140, verticalBoundaries, horizontalBoundaries, false);
    const probe = detectStrictGridAttempt(image, { columns: 4, rows: 4 }, new GridRefinementBudget(20_000));
    if (probe.status !== "found") throw new Error("probe grid was not found");
    const budget = new GridRefinementBudget(probe.refinedPairCount);

    const first = detectStrictGridAttempt(image, { columns: 4, rows: 4 }, budget);
    const second = detectStrictGridAttempt(image, { columns: 4, rows: 4 }, budget);

    expect(first.status).toBe("found");
    expect(first.refinedPairCount).toBe(probe.refinedPairCount);
    expect(second.status).toBe("budget-exhausted");
    expect(budget.consumed).toBe(probe.refinedPairCount);
  });

  it("finds every source board without file-specific coordinates", async () => {
    for (const fixture of await loadFixtureCases()) {
      const image = await decodeImage(fixture.imagePath);
      const result = detectGrid(image, { columns: fixture.columns, rows: fixture.rows });
      const tolerance = Math.max(1, (fixture.expectedBoardBounds.width / fixture.columns) * 0.02);

      expect(result).not.toBeNull();
      expect(Math.abs((result?.bounds.x ?? 0) - fixture.expectedBoardBounds.x)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs((result?.bounds.y ?? 0) - fixture.expectedBoardBounds.y)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs((result?.bounds.width ?? 0) - fixture.expectedBoardBounds.width)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs((result?.bounds.height ?? 0) - fixture.expectedBoardBounds.height)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs((result?.pitchX ?? 0) - (result?.pitchY ?? 0)) / Math.max(result?.pitchX ?? 0, result?.pitchY ?? 0)).toBeLessThanOrEqual(0.05);
    }
  });

  it("tiles exactly 480 non-overlapping cells", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");
    const image = await decodeImage(fixture.imagePath);
    const grid = detectGrid(image, fixture);
    if (!grid) throw new Error("grid was not detected");

    const first = cellRect(grid, 0, 0);
    const last = cellRect(grid, 29, 15);

    expect(first.x).toBeGreaterThanOrEqual(grid.bounds.x);
    expect(last.x + last.width).toBeLessThanOrEqual(grid.bounds.x + grid.bounds.width + 1);
    expect(last.y + last.height).toBeLessThanOrEqual(grid.bounds.y + grid.bounds.height + 1);

    const cells = Array.from({ length: grid.columns * grid.rows }, (_, index) => (
      cellRect(grid, index % grid.columns, Math.floor(index / grid.columns))
    ));
    expect(cells).toHaveLength(480);
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const cell = cells[row * grid.columns + column]!;
        if (column + 1 < grid.columns) {
          const rightNeighbor = cells[row * grid.columns + column + 1]!;
          expect(cell.x + cell.width).toBe(rightNeighbor.x);
        }
        if (row + 1 < grid.rows) {
          const belowNeighbor = cells[(row + 1) * grid.columns + column]!;
          expect(cell.y + cell.height).toBe(belowNeighbor.y);
        }
      }
    }
  });

  it("detects every deterministic derivative", async () => {
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveImages(fixture.imagePath)) {
        const result = detectGrid(derived.image, fixture);
        const expected = fixture.expectedBoardBounds;
        const tolerance = ((expected.width / fixture.columns) * derived.scale) * 0.02;
        const caseName = `${fixture.id}/${derived.name}`;

        expect(result, caseName).not.toBeNull();
        expect(Math.abs((result?.bounds.x ?? 0) - expected.x * derived.scale), caseName).toBeLessThanOrEqual(Math.max(1, tolerance));
        expect(Math.abs((result?.bounds.y ?? 0) - expected.y * derived.scale), caseName).toBeLessThanOrEqual(Math.max(1, tolerance));
        expect(Math.abs((result?.bounds.width ?? 0) - expected.width * derived.scale), caseName).toBeLessThanOrEqual(Math.max(1, tolerance));
        expect(Math.abs((result?.bounds.height ?? 0) - expected.height * derived.scale), caseName).toBeLessThanOrEqual(Math.max(1, tolerance));
        expect(Math.abs((result?.pitchX ?? 0) - (result?.pitchY ?? 0)) / Math.max(result?.pitchX ?? 0, result?.pitchY ?? 0)).toBeLessThanOrEqual(0.05);
      }
    }
  }, 10_000);

  it("reconciles the refined final boundary with the sequence pitch", () => {
    const verticalBoundaries = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    verticalBoundaries[30] = 311;
    const image = syntheticGridImage(340, 200, verticalBoundaries, horizontalBoundaries);

    const result = detectGrid(image, { columns: 30, rows: 16 });

    expect(result).not.toBeNull();
    expect(result?.bounds.x).toBe(10);
    expect(result?.bounds.width).toBe(301);
    expect((result?.bounds.x ?? 0) + (result?.bounds.width ?? 0)).toBe(311);
    expect(result?.bounds.height).toBe(160);
    expect(result?.pitchX).toBeCloseTo(301 / 30, 10);
    expect(result?.pitchY).toBeCloseTo(160 / 16, 10);
  });

  it("starts the bounds at the refined first boundary", () => {
    const verticalBoundaries = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    verticalBoundaries[0] = 11;
    const image = syntheticGridImage(340, 200, verticalBoundaries, horizontalBoundaries);

    const result = detectGrid(image, { columns: 30, rows: 16 });

    expect(result).not.toBeNull();
    expect(result?.bounds.x).toBe(11);
    expect(result?.bounds.width).toBe(299);
    expect((result?.bounds.x ?? 0) + (result?.bounds.width ?? 0)).toBe(310);
    expect(result?.pitchX).toBeCloseTo(299 / 30, 10);
  });

  it("uses pitch-20 refined X endpoints for bounds, pitch, and cells", () => {
    const verticalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const horizontalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const image = syntheticGridImage(140, 140, verticalBoundaries, horizontalBoundaries, false);

    const result = detectGrid(image, { columns: 4, rows: 4 });

    expect(result).not.toBeNull();
    expect(result?.bounds.x).toBe(20);
    expect(result?.bounds.x).toBe(verticalBoundaries[0]);
    expect((result?.bounds.x ?? 0) + (result?.bounds.width ?? 0)).toBe(100);
    expect(result?.pitchX).toBe(20);
    expect(result && cellRect(result, 0, 0).x).toBe(20);
    expect(result && cellRect(result, 3, 0).x + cellRect(result, 3, 0).width).toBe(100);
  });

  it("uses refined Y endpoints when every leading intersection is supported", () => {
    const verticalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const horizontalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 20);
    const image = syntheticGridImage(140, 140, verticalBoundaries, horizontalBoundaries, false);

    const result = detectGrid(image, { columns: 4, rows: 4 });

    expect(result).not.toBeNull();
    expect(result?.bounds.y).toBe(20);
    expect((result?.bounds.y ?? 0) + (result?.bounds.height ?? 0)).toBe(100);
    expect(result?.pitchY).toBe(20);
    expect(result && cellRect(result, 0, 0).y).toBe(20);
    expect(result && cellRect(result, 0, 3).y + cellRect(result, 0, 3).height).toBe(100);
  });

  it("uses refined Y endpoints when a leading intersection is unsupported", () => {
    const verticalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 40);
    const horizontalBoundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 40);
    const complete = syntheticGridImage(220, 220, verticalBoundaries, horizontalBoundaries, false);
    const image = eraseIntersection(complete, 20, 20);

    const result = detectGrid(image, { columns: 4, rows: 4 });

    expect(result).not.toBeNull();
    expect(result?.bounds.y).toBe(20);
    expect((result?.bounds.y ?? 0) + (result?.bounds.height ?? 0)).toBe(180);
    expect(result?.pitchY).toBe(40);
    expect(result && cellRect(result, 0, 0).y).toBe(20);
    expect(result && cellRect(result, 0, 3).y + cellRect(result, 0, 3).height).toBe(180);
  });

  it("ignores an isolated adjacent edge outside the established boundary phase", () => {
    const verticalBoundaries = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    verticalBoundaries[30] = 312;
    const image = syntheticGridImage(340, 200, verticalBoundaries, horizontalBoundaries, false);

    const result = detectGrid(image, { columns: 30, rows: 16 });

    expect(result).not.toBeNull();
    expect(result?.bounds.x).toBe(10);
    expect(result?.bounds.width).toBe(300);
    expect((result?.bounds.x ?? 0) + (result?.bounds.width ?? 0)).toBe(310);
  });

  it("detects a noise-free grid whose median background gradient is zero", () => {
    const verticalBoundaries = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    const image = syntheticGridImage(340, 200, verticalBoundaries, horizontalBoundaries, false);

    expect(detectGrid(image, { columns: 30, rows: 16 })).not.toBeNull();
  });

  it("rejects projected lines when fewer than 90% of intersections have local support", () => {
    const verticalBoundaries = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    const image = syntheticSparseIntersectionImage(verticalBoundaries, horizontalBoundaries);

    expect(detectGrid(image, { columns: 30, rows: 16 })).toBeNull();
  });

  it("accepts exactly 90% local intersection support without a leading-edge gate", () => {
    const verticalBoundaries = Array.from({ length: 10 }, (_, index) => 20 + index * 20);
    const horizontalBoundaries = Array.from({ length: 10 }, (_, index) => 20 + index * 20);
    let image = syntheticGridImage(220, 220, verticalBoundaries, horizontalBoundaries, false);
    for (const x of verticalBoundaries) image = eraseIntersection(image, x, horizontalBoundaries[0]!);

    const result = detectGrid(image, { columns: 9, rows: 9 });

    expect(result).not.toBeNull();
    expect(result?.bounds).toEqual({ x: 20, y: 20, width: 180, height: 180 });
  });

  it("rejects same-pitch grids whose runner-up is within 5% of the best score", () => {
    const firstGrid = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const secondGrid = Array.from({ length: 31 }, (_, index) => 380 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    const image = syntheticGridImage(700, 200, [...firstGrid, ...secondGrid], horizontalBoundaries);

    expect(detectGrid(image, { columns: 30, rows: 16 })).toBeNull();
  });

  it("does not amplify a normalized score difference below 5%", () => {
    const firstGrid = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const secondGrid = Array.from({ length: 31 }, (_, index) => 380 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    const image = syntheticTwoContrastGridImage(firstGrid, secondGrid, horizontalBoundaries, 180, 179);

    expect(detectGrid(image, { columns: 30, rows: 16 })).toBeNull();
  });

  it("keeps a one-cell-shifted extent as a distinct runner-up", () => {
    const verticalBoundaries = Array.from({ length: 32 }, (_, index) => 10 + index * 10);
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    const image = syntheticGridImage(350, 210, verticalBoundaries, horizontalBoundaries, false);

    expect(detectGrid(image, { columns: 30, rows: 16 })).toBeNull();
  });

  it("keeps grids displaced by two through four pixels as physical runner-ups", () => {
    const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    for (const displacement of [2, 3, 4]) {
      const firstGrid = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
      const displacedGrid = firstGrid.map((boundary) => boundary + displacement);
      const image = syntheticGridImage(340, 200, [...firstGrid, ...displacedGrid], horizontalBoundaries, false);

      expect(detectGrid(image, { columns: 30, rows: 16 }), `displacement ${displacement}`).toBeNull();
    }
  });

  it("keeps a valid runner-up beyond the first 64 coarse axis candidates", () => {
    const image = syntheticCandidateOverflowImage();

    expect(detectGrid(image, { columns: 30, rows: 16 })).toBeNull();
  });

  it("rejects deterministic non-board noise within the candidate work budget", () => {
    expect(detectGrid(syntheticDeterministicNoiseImage(), { columns: 30, rows: 16 })).toBeNull();
  }, 1_000);

  it("shares borders when a geometry has fractional pitches", () => {
    const grid: GridGeometry = {
      bounds: { x: 7, y: 11, width: 1201, height: 641 },
      columns: 30,
      rows: 16,
      pitchX: 1201 / 30,
      pitchY: 641 / 16,
      score: 1,
    };

    const cells: Rect[] = [];
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const cell = cellRect(grid, column, row);
        cells.push(cell);
        expect(cell.width).toBeGreaterThan(0);
        expect(cell.height).toBeGreaterThan(0);
        if (column + 1 < grid.columns) expect(cell.x + cell.width).toBe(cellRect(grid, column + 1, row).x);
        if (row + 1 < grid.rows) expect(cell.y + cell.height).toBe(cellRect(grid, column, row + 1).y);
      }
    }
    expect(cells).toHaveLength(480);
    const last = cellRect(grid, grid.columns - 1, grid.rows - 1);
    expect(last.x + last.width).toBe(grid.bounds.x + grid.bounds.width);
    expect(last.y + last.height).toBe(grid.bounds.y + grid.bounds.height);
  });
});
