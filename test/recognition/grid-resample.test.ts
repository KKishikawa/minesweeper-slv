import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalOutputSize,
  canonicalScale,
  mapCanonicalCoordinateToSource,
  mapSourceCoordinateToCanonical,
  resampleCanonicalGridImage,
} from "../../src/recognition/grid-resample.js";
import type { PixelImage } from "../../src/recognition/types.js";

const image: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 0, 0, 255, 60, 60, 60, 255,
    120, 120, 120, 255, 180, 180, 180, 255,
  ]),
};

const alphaImage: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    10, 20, 30, 0, 10, 20, 30, 60,
    10, 20, 30, 120, 10, 20, 30, 180,
  ]),
};

function syntheticRgbaGrid(pitch: 30 | 50): PixelImage {
  const width = (pitch * 3) + 7;
  const height = (pitch * 2) + 5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4;
      const onGridLine = x % pitch === 0 || y % pitch === 0;
      data[offset] = onGridLine ? 240 : (x * 17 + y * 29 + pitch) % 256;
      data[offset + 1] = onGridLine ? 30 : (x * 37 + y * 11 + pitch) % 256;
      data[offset + 2] = onGridLine ? 90 : (x * 7 + y * 43 + pitch) % 256;
      data[offset + 3] = (x * 31 + y * 13 + pitch * 3) % 256;
    }
  }
  return { width, height, data };
}

function rgbaHash(image: PixelImage): string {
  return createHash("sha256").update(image.data).digest("hex");
}

describe("canonical grid resampling", () => {
  it("preserves hand-authored 2 by 2 bytes at identity scale", () => {
    expect([...resampleCanonicalGridImage(image, 1).data]).toEqual([...image.data]);
  });

  it("bilinearly samples hand-authored 2 by 2 pixels at centers", () => {
    const output = resampleCanonicalGridImage(image, 1.5);

    expect([output.width, output.height]).toEqual([3, 3]);
    expect([...output.data]).toEqual([
      0, 0, 0, 255, 30, 30, 30, 255, 60, 60, 60, 255,
      60, 60, 60, 255, 90, 90, 90, 255, 120, 120, 120, 255,
      120, 120, 120, 255, 150, 150, 150, 255, 180, 180, 180, 255,
    ]);
  });

  it("interpolates alpha and clamps samples that map outside source edges", () => {
    const output = resampleCanonicalGridImage(alphaImage, 1.5);

    expect([...output.data]).toEqual([
      10, 20, 30, 0, 10, 20, 30, 30, 10, 20, 30, 60,
      10, 20, 30, 60, 10, 20, 30, 90, 10, 20, 30, 120,
      10, 20, 30, 120, 10, 20, 30, 150, 10, 20, 30, 180,
    ]);
  });

  it("maps center coordinates between canonical and source space inversely", () => {
    expect(mapCanonicalCoordinateToSource(0, 1.5)).toBeCloseTo(-1 / 6, 12);
    expect(mapCanonicalCoordinateToSource(2, 1.5)).toBeCloseTo(7 / 6, 12);
    expect(mapSourceCoordinateToCanonical(0, 1.5)).toBeCloseTo(0.25, 12);
    expect(mapSourceCoordinateToCanonical(
      mapCanonicalCoordinateToSource(2, 1.5),
      1.5,
    )).toBeCloseTo(2, 12);
  });

  it("normalizes only supported observed pitches to the canonical pitch", () => {
    expect(() => canonicalScale(29.999)).toThrow(RangeError);
    expect(canonicalScale(30)).toBeCloseTo(4 / 3, 12);
    expect(canonicalScale(40)).toBe(1);
    expect(canonicalScale(50)).toBe(0.8);
    expect(() => canonicalScale(50.001)).toThrow(RangeError);
  });

  it("rejects malformed source images and invalid output size inputs", () => {
    expect(() => resampleCanonicalGridImage({ ...image, data: new Uint8ClampedArray(15) }, 1)).toThrow(RangeError);
    expect(() => canonicalOutputSize(0, 2, 1)).toThrow(RangeError);
    expect(() => canonicalOutputSize(2, -1, 1)).toThrow(RangeError);
    expect(() => canonicalOutputSize(2, 2, Number.NaN)).toThrow(RangeError);
    expect(() => canonicalOutputSize(1, 1, 0.1)).toThrow(RangeError);
  });

  it("rejects unsafe and oversized output allocation dimensions without allocating", () => {
    expect(() => canonicalOutputSize(Number.MAX_SAFE_INTEGER, 1, 2)).toThrow(RangeError);
    expect(() => canonicalOutputSize(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
    expect(canonicalOutputSize(2000, 2000, 1)).toEqual({ width: 2000, height: 2000 });
    expect(() => canonicalOutputSize(2001, 2000, 1)).toThrow(RangeError);
  });

  it.each([
    { pitch: 30 as const, expectedSize: [129, 87], expectedHash: "baa44fda75b839c3ac0262d0ea8a9e909976a4876c73e6e6fd28d0e86c8f3862" },
    { pitch: 50 as const, expectedSize: [126, 84], expectedHash: "19888b0a715a288a8074eaba92bfb52426c041271313ee3c316be24d51848634" },
  ])("resamples the deterministic $pitch-pixel-pitch RGBA grid identically three times", ({ pitch, expectedSize, expectedHash }) => {
    const input = syntheticRgbaGrid(pitch);
    const outputs = Array.from({ length: 3 }, () => resampleCanonicalGridImage(input, canonicalScale(pitch)));
    const hashes = outputs.map(rgbaHash);

    expect(outputs.map((output) => [output.width, output.height])).toEqual([expectedSize, expectedSize, expectedSize]);
    expect(hashes).toEqual([expectedHash, expectedHash, expectedHash]);
  });
});
