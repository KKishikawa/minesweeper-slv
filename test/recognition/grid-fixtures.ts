import type { PixelImage } from "../../src/recognition/types.js";

export function syntheticSparseIntersectionImage(
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): PixelImage {
  const width = 340;
  const height = 200;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const verticalPhase = verticalBoundaries.filter((boundary) => x >= boundary).length % 2;
      const horizontalPhase = horizontalBoundaries.filter((boundary) => y >= boundary).length % 2;
      const value = 20
        + (y >= 10 && y <= 90 ? verticalPhase * 100 : 0)
        + (x >= 200 && x <= 310 ? horizontalPhase * 100 : 0)
        + ((x * 3 + y * 5) % 7);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

export function syntheticTwoContrastGridImage(
  firstVerticalBoundaries: readonly number[],
  secondVerticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
  firstContrast: number,
  secondContrast: number,
): PixelImage {
  const width = 700;
  const height = 200;
  const split = Math.floor(
    (firstVerticalBoundaries[firstVerticalBoundaries.length - 1]! + secondVerticalBoundaries[0]!) / 2,
  );
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const usesFirstGrid = x < split;
      const verticalBoundaries = usesFirstGrid ? firstVerticalBoundaries : secondVerticalBoundaries;
      const contrast = usesFirstGrid ? firstContrast : secondContrast;
      const verticalPhase = verticalBoundaries.filter((boundary) => x >= boundary).length;
      const horizontalPhase = horizontalBoundaries.filter((boundary) => y >= boundary).length;
      const value = 30 + ((verticalPhase + horizontalPhase) % 2) * contrast + ((x * 3 + y * 5) % 7);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

export function syntheticCandidateOverflowImage(): PixelImage {
  const width = 3_340;
  const height = 200;
  const firstGrid = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
  const decoyLattice = Array.from({ length: 221 }, (_, index) => 400 + index * 10);
  const secondGrid = Array.from({ length: 31 }, (_, index) => 3_030 + index * 10);
  const verticalBoundaries = [...firstGrid, ...decoyLattice, ...secondGrid];
  const horizontalBoundaries = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
  const verticalPhases = new Uint8Array(width);
  let verticalPhase = 0;
  let verticalIndex = 0;
  for (let x = 0; x < width; x += 1) {
    while (verticalBoundaries[verticalIndex] === x) {
      verticalPhase = 1 - verticalPhase;
      verticalIndex += 1;
    }
    verticalPhases[x] = verticalPhase;
  }
  const horizontalPhases = new Uint8Array(height);
  let horizontalPhase = 0;
  let horizontalIndex = 0;
  for (let y = 0; y < height; y += 1) {
    while (horizontalBoundaries[horizontalIndex] === y) {
      horizontalPhase = 1 - horizontalPhase;
      horizontalIndex += 1;
    }
    horizontalPhases[y] = horizontalPhase;
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const hasHorizontalGrid = (x >= 10 && x <= 310) || (x >= 3_030 && x <= 3_330);
      const verticalContrast = x <= 310 ? (y > 174 ? 150 : 95) : x >= 3_030 ? 95 : 100;
      const value = 30 + verticalPhases[x]! * verticalContrast + (hasHorizontalGrid ? horizontalPhases[y]! * 80 : 0);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

export function syntheticDeterministicNoiseImage(): PixelImage {
  const width = 400;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  let state = 0x5eed1234;
  for (let offset = 0; offset < data.length; offset += 4) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const value = state & 0xff;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

export function eraseIntersection(image: PixelImage, x: number, y: number): PixelImage {
  const data = new Uint8ClampedArray(image.data);
  for (let row = y - 4; row <= y + 4; row += 1) {
    for (let column = x - 4; column <= x + 4; column += 1) {
      const offset = (row * image.width + column) * 4;
      data[offset] = 30;
      data[offset + 1] = 30;
      data[offset + 2] = 30;
    }
  }
  return { ...image, data };
}
