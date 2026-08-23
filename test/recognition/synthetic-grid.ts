import type { PixelImage } from "../../src/recognition/types.js";

export function syntheticGridImage(
  width: number,
  height: number,
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
  includeNoise = true,
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const verticalPhase = verticalBoundaries.filter((boundary) => x >= boundary).length;
      const horizontalPhase = horizontalBoundaries.filter((boundary) => y >= boundary).length;
      const value = 30 + ((verticalPhase + horizontalPhase) % 2) * 180 + (includeNoise ? (x * 3 + y * 5) % 7 : 0);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}
