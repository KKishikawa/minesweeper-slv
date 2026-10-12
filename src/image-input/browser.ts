import type { PixelImage } from "../recognition/types.js";
import { assertImageDimensions, MAX_IMAGE_BYTES } from "./limits.js";
import { ImageInputError, type ImageInputAdapter } from "./types.js";
import { startDisplaySession } from "./display.js";

export interface BrowserBindings {
  createBitmap: ((blob: Blob, options: ImageBitmapOptions) => Promise<ImageBitmap>) | null;
  createCanvas(): HTMLCanvasElement;
  createVideo(): HTMLVideoElement;
  getDisplayMedia: ((constraints: DisplayMediaStreamOptions) => Promise<MediaStream>) | null;
  secureContext: boolean;
}

export function readPixels(
  source: CanvasImageSource, width: number, height: number,
  createCanvas: () => HTMLCanvasElement,
): PixelImage {
  assertImageDimensions(width, height);
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new ImageInputError("unsupported");
    context.drawImage(source, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8ClampedArray(data) };
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("read-failed");
  } finally {
    if (canvas !== undefined) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function decodeBlob(
  blob: Blob, bindings: Pick<BrowserBindings, "createBitmap" | "createCanvas">,
): Promise<PixelImage> {
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageInputError("too-large");
  if (bindings.createBitmap === null) throw new ImageInputError("unsupported");
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await bindings.createBitmap(blob, {
      imageOrientation: "from-image",
      premultiplyAlpha: "default",
      colorSpaceConversion: "default",
    });
    return readPixels(bitmap, bitmap.width, bitmap.height, bindings.createCanvas);
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("read-failed");
  } finally {
    bitmap?.close();
  }
}

export function createBrowserImageAdapter(overrides: Partial<BrowserBindings> = {}): ImageInputAdapter {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  const bindings: BrowserBindings = {
    createBitmap: typeof globalThis.createImageBitmap === "function"
      ? globalThis.createImageBitmap.bind(globalThis) : null,
    createCanvas: () => document.createElement("canvas"),
    createVideo: () => document.createElement("video"),
    getDisplayMedia: typeof mediaDevices?.getDisplayMedia === "function"
      ? mediaDevices.getDisplayMedia.bind(mediaDevices) : null,
    secureContext: globalThis.isSecureContext === true,
    ...overrides,
  };
  return {
    supportsFiles: bindings.createBitmap !== null,
    supportsDisplay: bindings.secureContext && bindings.getDisplayMedia !== null,
    decode: (blob) => decodeBlob(blob, bindings),
    startDisplay: (signal) => startDisplaySession(signal, bindings),
  };
}
