import type { PixelImage, Rect } from "./types.js";

function assertRectInBounds(image: PixelImage, rect: Rect): void {
  const { x, y, width, height } = rect;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("Rectangle coordinates must be integers.");
  }
  if (x < 0 || y < 0 || width < 0 || height < 0 || x + width > image.width || y + height > image.height) {
    throw new RangeError("Rectangle is outside the image bounds.");
  }
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

export function cropImage(image: PixelImage, rect: Rect): PixelImage {
  assertRectInBounds(image, rect);
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);

  for (let row = 0; row < rect.height; row += 1) {
    for (let col = 0; col < rect.width; col += 1) {
      const srcOffset = pixelOffset(image.width, rect.x + col, rect.y + row);
      const dstOffset = pixelOffset(rect.width, col, row);
      data.set(image.data.subarray(srcOffset, srcOffset + 4), dstOffset);
    }
  }

  return { width: rect.width, height: rect.height, data };
}

export function resizeArea(image: PixelImage, width: number, height: number): PixelImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Target size must be a positive integer.");
  }

  const data = new Uint8ClampedArray(width * height * 4);
  const xScale = image.width / width;
  const yScale = image.height / height;

  for (let dy = 0; dy < height; dy += 1) {
    const yStart = dy * yScale;
    const yEnd = (dy + 1) * yScale;
    for (let dx = 0; dx < width; dx += 1) {
      const xStart = dx * xScale;
      const xEnd = (dx + 1) * xScale;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;

      for (let sy = 0; sy < image.height; sy += 1) {
        const overlapY = Math.max(0, Math.min(yEnd, sy + 1) - Math.max(yStart, sy));
        if (overlapY === 0) continue;
        for (let sx = 0; sx < image.width; sx += 1) {
          const overlapX = Math.max(0, Math.min(xEnd, sx + 1) - Math.max(xStart, sx));
          const overlap = overlapX * overlapY;
          if (overlap === 0) continue;
          const srcOffset = pixelOffset(image.width, sx, sy);
          r += image.data[srcOffset]! * overlap;
          g += image.data[srcOffset + 1]! * overlap;
          b += image.data[srcOffset + 2]! * overlap;
          a += image.data[srcOffset + 3]! * overlap;
          area += overlap;
        }
      }

      const dstOffset = pixelOffset(width, dx, dy);
      data[dstOffset] = Math.round(r / area);
      data[dstOffset + 1] = Math.round(g / area);
      data[dstOffset + 2] = Math.round(b / area);
      data[dstOffset + 3] = Math.round(a / area);
    }
  }

  return { width, height, data };
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgbDistanceSquared(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
