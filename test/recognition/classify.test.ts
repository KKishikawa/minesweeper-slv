import { describe, expect, it } from "vitest";

import { classifyCell } from "../../src/recognition/classify.js";
import { extractFeatures } from "../../src/recognition/features.js";
import { cellRect, detectGrid } from "../../src/recognition/grid.js";
import { normalizeCell } from "../../src/recognition/normalize.js";
import { buildPrototypeSet } from "../../src/recognition/prototypes.js";
import { cropImage } from "../../src/recognition/pixels.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { decodeImage } from "./image-io.js";
import { buildFixtureSamples } from "./samples.js";

function syntheticCell(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number, number],
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function normalizedPixel(image: PixelImage, x: number, y: number): readonly number[] {
  const offset = (y * image.width + x) * 4;
  return [...image.data.slice(offset, offset + 4)];
}

describe("cell normalization", () => {
  it("trims exactly 12.5 percent from every edge and forces opaque output", () => {
    const cell = syntheticCell(16, 16, (x, y) => {
      const distanceFromEdge = Math.min(x, y, 15 - x, 15 - y);
      let value = distanceFromEdge < 2 ? 240 : 100;
      if (x === 2) value = 20;
      if (x === 13) value = 30;
      if (y === 2) value = 40;
      if (y === 13) value = 50;
      return [value, value, value, (x * 17 + y * 11) & 0xff];
    });

    const normalized = normalizeCell(cell);

    expect(normalizedPixel(normalized, 0, 8)).toEqual([20, 20, 20, 255]);
    expect(normalizedPixel(normalized, 15, 8)).toEqual([30, 30, 30, 255]);
    expect(normalizedPixel(normalized, 8, 0)).toEqual([40, 40, 40, 255]);
    expect(normalizedPixel(normalized, 8, 15)).toEqual([50, 50, 50, 255]);
    expect([...normalized.data].filter((_, offset) => offset % 4 === 3)).toEqual(Array(256).fill(255));
  });

  it("takes the vertical three-row median independently for each RGB channel", () => {
    const rows: Readonly<Record<number, readonly [number, number, number]>> = {
      1: [200, 0, 50],
      2: [0, 200, 100],
      3: [100, 100, 0],
    };
    const cell = syntheticCell(8, 8, (_x, y) => [...(rows[y] ?? [0, 0, 0]), 12]);

    expect(normalizedPixel(normalizeCell(cell), 8, 3)).toEqual([100, 100, 50, 255]);
  });

  it("applies the vertical median before area resizing", () => {
    const cell = syntheticCell(8, 8, (_x, y) => [y === 3 ? 255 : 0, 0, 0, 91]);

    const normalized = normalizeCell(cell);

    expect(new Set([...normalized.data].filter((_, offset) => offset % 4 !== 3))).toEqual(new Set([0]));
  });

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
