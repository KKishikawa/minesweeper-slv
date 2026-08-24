import type { PixelImage } from "./types.js";

export const CANONICAL_GRID_PITCH = 40;
export const MIN_FALLBACK_PITCH = 30;
export const MAX_FALLBACK_PITCH = 50;
export const MAX_CANONICAL_PIXELS = 4_000_000;

function positiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function validScale(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("Scale must be a finite positive number.");
  }
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, value));
}

function sourceOffset(width: number, x: number, y: number): number {
  return ((y * width) + x) * 4;
}

function validatePixelImage(image: PixelImage): void {
  positiveSafeInteger(image.width, "Image width");
  positiveSafeInteger(image.height, "Image height");
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new RangeError("Image data must be a Uint8ClampedArray.");
  }

  const pixels = image.width * image.height;
  if (!Number.isSafeInteger(pixels)) {
    throw new RangeError("Image dimensions overflow safe pixel arithmetic.");
  }
  const expectedLength = pixels * 4;
  if (!Number.isSafeInteger(expectedLength) || image.data.length !== expectedLength) {
    throw new RangeError("Image data length must equal width times height times four.");
  }
}

export function canonicalScale(observedPitch: number): number {
  if (!Number.isFinite(observedPitch) || observedPitch < MIN_FALLBACK_PITCH || observedPitch > MAX_FALLBACK_PITCH) {
    throw new RangeError(`Observed pitch must be within ${MIN_FALLBACK_PITCH} through ${MAX_FALLBACK_PITCH}.`);
  }
  return CANONICAL_GRID_PITCH / observedPitch;
}

export function canonicalOutputSize(
  width: number,
  height: number,
  scale: number,
): { readonly width: number; readonly height: number } {
  positiveSafeInteger(width, "Source width");
  positiveSafeInteger(height, "Source height");
  validScale(scale);

  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  positiveSafeInteger(outputWidth, "Canonical width");
  positiveSafeInteger(outputHeight, "Canonical height");

  const outputPixels = outputWidth * outputHeight;
  if (!Number.isSafeInteger(outputPixels)) {
    throw new RangeError("Canonical dimensions overflow safe pixel arithmetic.");
  }
  if (outputPixels > MAX_CANONICAL_PIXELS) {
    throw new RangeError(`Canonical output exceeds ${MAX_CANONICAL_PIXELS} pixels.`);
  }
  return { width: outputWidth, height: outputHeight };
}

export function mapCanonicalCoordinateToSource(
  coordinate: number,
  scale: number,
): number {
  return ((coordinate + 0.5) / scale) - 0.5;
}

export function mapSourceCoordinateToCanonical(
  coordinate: number,
  scale: number,
): number {
  return ((coordinate + 0.5) * scale) - 0.5;
}

export function resampleCanonicalGridImage(
  image: PixelImage,
  scale: number,
): PixelImage {
  validatePixelImage(image);
  const outputSize = canonicalOutputSize(image.width, image.height, scale);
  const data = new Uint8ClampedArray(outputSize.width * outputSize.height * 4);

  for (let outputY = 0; outputY < outputSize.height; outputY += 1) {
    const sourceY = Math.min(image.height - 1, Math.max(0, mapCanonicalCoordinateToSource(outputY, scale)));
    const top = Math.floor(sourceY);
    const bottom = Math.min(image.height - 1, top + 1);
    const yWeight = sourceY - top;

    for (let outputX = 0; outputX < outputSize.width; outputX += 1) {
      const sourceX = Math.min(image.width - 1, Math.max(0, mapCanonicalCoordinateToSource(outputX, scale)));
      const left = Math.floor(sourceX);
      const right = Math.min(image.width - 1, left + 1);
      const xWeight = sourceX - left;
      const topLeft = sourceOffset(image.width, left, top);
      const topRight = sourceOffset(image.width, right, top);
      const bottomLeft = sourceOffset(image.width, left, bottom);
      const bottomRight = sourceOffset(image.width, right, bottom);
      const outputOffset = sourceOffset(outputSize.width, outputX, outputY);

      for (let channel = 0; channel < 4; channel += 1) {
        const topValue = (image.data[topLeft + channel]! * (1 - xWeight)) + (image.data[topRight + channel]! * xWeight);
        const bottomValue = (image.data[bottomLeft + channel]! * (1 - xWeight)) + (image.data[bottomRight + channel]! * xWeight);
        data[outputOffset + channel] = clampByte(Math.round((topValue * (1 - yWeight)) + (bottomValue * yWeight)));
      }
    }
  }

  return { width: outputSize.width, height: outputSize.height, data };
}
