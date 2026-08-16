import sharp from "sharp";

import type { PixelImage } from "../../src/recognition/types.js";
import { decodeImage } from "./image-io.js";

export type DerivativeName = "source" | "scale-075" | "scale-125" | "jpeg-q75";

export interface DerivedImage {
  readonly name: DerivativeName;
  readonly image: PixelImage;
  readonly scale: number;
}

async function decodeBuffer(data: Buffer): Promise<PixelImage> {
  const { data: pixels, info } = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(pixels) };
}

async function resizeImage(sourcePath: string, scale: number): Promise<PixelImage> {
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new Error(`Image has no dimensions: ${sourcePath}`);
  }

  const width = Math.round(metadata.width * scale);
  const height = Math.round(metadata.height * scale);
  const data = await sharp(sourcePath).resize(width, height).ensureAlpha().raw().toBuffer();
  return { width, height, data: new Uint8ClampedArray(data) };
}

export async function deriveImages(sourcePath: string): Promise<readonly DerivedImage[]> {
  const source = await decodeImage(sourcePath);
  const jpeg = await sharp(sourcePath).jpeg({ quality: 75, chromaSubsampling: "4:2:0" }).toBuffer();

  return [
    { name: "source", image: source, scale: 1 },
    { name: "scale-075", image: await resizeImage(sourcePath, 0.75), scale: 0.75 },
    { name: "scale-125", image: await resizeImage(sourcePath, 1.25), scale: 1.25 },
    { name: "jpeg-q75", image: await decodeBuffer(jpeg), scale: 1 },
  ];
}
