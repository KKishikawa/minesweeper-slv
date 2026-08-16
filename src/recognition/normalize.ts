import { cropImage, resizeArea } from "./pixels.js";
import type { PixelImage } from "./types.js";

const NORMALIZED_WIDTH = 16;
const NORMALIZED_HEIGHT = 16;
const EDGE_TRIM_RATIO = 0.125;

function assertRgbaImage(image: PixelImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
    throw new RangeError("Cell image dimensions must be positive integers.");
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError("Cell image must contain RGBA pixels.");
  }
}

function medianOfThree(first: number, second: number, third: number): number {
  return first + second + third - Math.min(first, second, third) - Math.max(first, second, third);
}

function verticalMedian(image: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let row = 0; row < image.height; row += 1) {
    const previousRow = Math.max(0, row - 1);
    const nextRow = Math.min(image.height - 1, row + 1);
    for (let column = 0; column < image.width; column += 1) {
      const previousOffset = (previousRow * image.width + column) * 4;
      const currentOffset = (row * image.width + column) * 4;
      const nextOffset = (nextRow * image.width + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        data[currentOffset + channel] = medianOfThree(
          image.data[previousOffset + channel]!,
          image.data[currentOffset + channel]!,
          image.data[nextOffset + channel]!,
        );
      }
      data[currentOffset + 3] = 255;
    }
  }
  return { width: image.width, height: image.height, data };
}

export function normalizeCell(cell: PixelImage): PixelImage {
  assertRgbaImage(cell);

  const trimX = Math.floor(cell.width * EDGE_TRIM_RATIO);
  const trimY = Math.floor(cell.height * EDGE_TRIM_RATIO);
  const interior = cropImage(cell, {
    x: trimX,
    y: trimY,
    width: cell.width - trimX * 2,
    height: cell.height - trimY * 2,
  });
  const resized = resizeArea(verticalMedian(interior), NORMALIZED_WIDTH, NORMALIZED_HEIGHT);

  for (let offset = 3; offset < resized.data.length; offset += 4) resized.data[offset] = 255;
  return resized;
}
