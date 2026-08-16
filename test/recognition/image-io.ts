import sharp from "sharp";

import type { PixelImage } from "../../src/recognition/types.js";

export async function decodeImage(path: string): Promise<PixelImage> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };
}
