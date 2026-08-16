import { describe, expect, it } from "vitest";
import { cropImage, luminance, resizeArea, rgbDistanceSquared } from "../../src/recognition/pixels.js";
import type { PixelImage } from "../../src/recognition/types.js";

const image: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 0, 0, 255,       255, 0, 0, 255,
    0, 255, 0, 255,     0, 0, 255, 255,
  ]),
};

describe("pixel utilities", () => {
  it("crops without sharing the source buffer", () => {
    const cropped = cropImage(image, { x: 1, y: 0, width: 1, height: 2 });
    expect([...cropped.data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    cropped.data[0] = 12;
    expect(image.data[4]).toBe(255);
  });

  it("area-averages a 2 by 2 image", () => {
    const resized = resizeArea(image, 1, 1);
    expect([...resized.data]).toEqual([64, 64, 64, 255]);
  });

  it("provides deterministic color metrics", () => {
    expect(luminance(255, 255, 255)).toBeGreaterThan(luminance(0, 0, 0));
    expect(rgbDistanceSquared([1, 2, 3], [4, 6, 3])).toBe(25);
  });
});
