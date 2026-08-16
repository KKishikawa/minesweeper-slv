import { luminance } from "./pixels.js";
import type { PixelImage } from "./types.js";

const NORMALIZED_SIZE = 16;
const BLOCK_SIZE = 2;
const BLOCKS_PER_AXIS = NORMALIZED_SIZE / BLOCK_SIZE;
const HUE_BIN_COUNT = 8;
const LUMINANCE_BIN_COUNT = 16;
const CHROMA_THRESHOLD = 0.15;

export const FEATURE_LENGTH = NORMALIZED_SIZE * NORMALIZED_SIZE * 3
  + BLOCKS_PER_AXIS * BLOCKS_PER_AXIS
  + BLOCKS_PER_AXIS * BLOCKS_PER_AXIS
  + HUE_BIN_COUNT
  + LUMINANCE_BIN_COUNT
  + 2;

function assertNormalizedImage(image: PixelImage): void {
  if (image.width !== NORMALIZED_SIZE || image.height !== NORMALIZED_SIZE) {
    throw new RangeError("Features require a normalized 16 by 16 image.");
  }
  if (image.data.length !== NORMALIZED_SIZE * NORMALIZED_SIZE * 4) {
    throw new RangeError("Normalized image must contain RGBA pixels.");
  }
}

function pixelOffset(column: number, row: number): number {
  return (row * NORMALIZED_SIZE + column) * 4;
}

function hueForRgb(red: number, green: number, blue: number, chroma: number, maximum: number): number {
  if (chroma === 0) return 0;
  let hue: number;
  if (maximum === red) {
    hue = (green - blue) / chroma;
  } else if (maximum === green) {
    hue = (blue - red) / chroma + 2;
  } else {
    hue = (red - green) / chroma + 4;
  }
  return ((hue / 6) + 1) % 1;
}

export function extractFeatures(normalized: PixelImage): Float64Array {
  assertNormalizedImage(normalized);
  const features = new Float64Array(FEATURE_LENGTH);
  const luminances = new Float64Array(NORMALIZED_SIZE * NORMALIZED_SIZE);
  let featureIndex = 0;

  for (let row = 0; row < NORMALIZED_SIZE; row += 1) {
    for (let column = 0; column < NORMALIZED_SIZE; column += 1) {
      const offset = pixelOffset(column, row);
      const red = normalized.data[offset]! / 255;
      const green = normalized.data[offset + 1]! / 255;
      const blue = normalized.data[offset + 2]! / 255;
      features[featureIndex] = red;
      features[featureIndex + 1] = green;
      features[featureIndex + 2] = blue;
      featureIndex += 3;
      luminances[row * NORMALIZED_SIZE + column] = luminance(red, green, blue);
    }
  }

  for (let blockRow = 0; blockRow < BLOCKS_PER_AXIS; blockRow += 1) {
    for (let blockColumn = 0; blockColumn < BLOCKS_PER_AXIS; blockColumn += 1) {
      let total = 0;
      for (let row = 0; row < BLOCK_SIZE; row += 1) {
        for (let column = 0; column < BLOCK_SIZE; column += 1) {
          const sourceRow = blockRow * BLOCK_SIZE + row;
          const sourceColumn = blockColumn * BLOCK_SIZE + column;
          total += luminances[sourceRow * NORMALIZED_SIZE + sourceColumn]!;
        }
      }
      features[featureIndex] = total / (BLOCK_SIZE * BLOCK_SIZE);
      featureIndex += 1;
    }
  }

  const hueHistogram = new Float64Array(HUE_BIN_COUNT);
  const luminanceHistogram = new Float64Array(LUMINANCE_BIN_COUNT);
  let horizontalGradientEnergy = 0;
  let verticalGradientEnergy = 0;
  for (let row = 0; row < NORMALIZED_SIZE; row += 1) {
    for (let column = 0; column < NORMALIZED_SIZE; column += 1) {
      const offset = pixelOffset(column, row);
      const red = normalized.data[offset]! / 255;
      const green = normalized.data[offset + 1]! / 255;
      const blue = normalized.data[offset + 2]! / 255;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const chroma = maximum - minimum;
      const luminanceValue = luminances[row * NORMALIZED_SIZE + column]!;

      if (chroma >= CHROMA_THRESHOLD) {
        const hue = hueForRgb(red, green, blue, chroma, maximum);
        const hueBin = Math.min(HUE_BIN_COUNT - 1, Math.floor(hue * HUE_BIN_COUNT));
        hueHistogram[hueBin] = hueHistogram[hueBin]! + 1;
      }
      const luminanceBin = Math.min(LUMINANCE_BIN_COUNT - 1, Math.floor(luminanceValue * LUMINANCE_BIN_COUNT));
      luminanceHistogram[luminanceBin] = luminanceHistogram[luminanceBin]! + 1;

      if (column + 1 < NORMALIZED_SIZE) {
        const difference = luminanceValue - luminances[row * NORMALIZED_SIZE + column + 1]!;
        horizontalGradientEnergy += difference * difference;
      }
      if (row + 1 < NORMALIZED_SIZE) {
        const difference = luminanceValue - luminances[(row + 1) * NORMALIZED_SIZE + column]!;
        verticalGradientEnergy += difference * difference;
      }
    }
  }

  for (let blockRow = 0; blockRow < BLOCKS_PER_AXIS; blockRow += 1) {
    for (let blockColumn = 0; blockColumn < BLOCKS_PER_AXIS; blockColumn += 1) {
      let total = 0;
      for (let row = 0; row < BLOCK_SIZE; row += 1) {
        for (let column = 0; column < BLOCK_SIZE; column += 1) {
          const offset = pixelOffset(blockColumn * BLOCK_SIZE + column, blockRow * BLOCK_SIZE + row);
          const red = normalized.data[offset]! / 255;
          const green = normalized.data[offset + 1]! / 255;
          const blue = normalized.data[offset + 2]! / 255;
          total += Math.max(red, green, blue) - Math.min(red, green, blue);
        }
      }
      features[featureIndex] = total / (BLOCK_SIZE * BLOCK_SIZE);
      featureIndex += 1;
    }
  }

  features.set(hueHistogram, featureIndex);
  featureIndex += HUE_BIN_COUNT;
  features.set(luminanceHistogram, featureIndex);
  featureIndex += LUMINANCE_BIN_COUNT;
  features[featureIndex] = horizontalGradientEnergy;
  features[featureIndex + 1] = verticalGradientEnergy;
  featureIndex += 2;

  if (featureIndex !== FEATURE_LENGTH || features.length !== FEATURE_LENGTH) {
    throw new Error(`Feature extraction produced ${featureIndex} values; expected ${FEATURE_LENGTH}.`);
  }
  return features;
}
