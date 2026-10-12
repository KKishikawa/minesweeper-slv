import { describe, expect, it } from "vitest";
import { assertImageDimensions } from "../../src/image-input/limits.js";
import { ImageInputError } from "../../src/image-input/types.js";

describe("image dimension limits", () => {
  it("accepts_dimension_limits", () => {
    for (const [width, height] of [[8192, 2048], [2048, 8192], [4096, 4096], [1, 1]]) {
      expect(() => assertImageDimensions(width!, height!)).not.toThrow();
    }
    for (const [width, height] of [
      [8193, 1], [1, 8193], [8192, 2049], [2049, 8192], [0, 1], [1, 0],
      [-1, 1], [NaN, 1], [1, NaN], [Infinity, 1], [1, Infinity],
      [1.5, 1], [1, 1.5], [Number.MAX_SAFE_INTEGER + 1, 1],
    ]) {
      expect(() => assertImageDimensions(width!, height!)).toThrow(ImageInputError);
      expect(() => assertImageDimensions(width!, height!)).toThrow(expect.objectContaining({ code: "too-large" }));
    }
  });
});
