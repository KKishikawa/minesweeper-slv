import { ImageInputError } from "./types.js";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 16_777_216;

export function assertImageDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_IMAGE_PIXELS
  ) {
    throw new ImageInputError("too-large");
  }
}
