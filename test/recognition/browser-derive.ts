import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, firefox, webkit } from "playwright";

import type { PixelImage } from "../../src/recognition/types.js";

export type BrowserEngine = "chromium" | "firefox" | "webkit";
export type BrowserDerivativeName =
  | "source"
  | "canvas-scale-075"
  | "canvas-scale-125"
  | "canvas-jpeg-q75";

export interface BrowserDerivedImage {
  readonly engine: BrowserEngine;
  readonly browserVersion: string;
  readonly name: BrowserDerivativeName;
  readonly scale: number;
  readonly encoding: "source" | "canvas-rgba" | "canvas-jpeg-075";
  readonly image: PixelImage;
}

interface BrowserPixelImage {
  readonly width: number;
  readonly height: number;
  readonly dataUrl: string;
}

interface BrowserDerivative {
  readonly name: BrowserDerivativeName;
  readonly scale: number;
  readonly encoding: BrowserDerivedImage["encoding"];
  readonly image: BrowserPixelImage;
}

const DERIVE_BROWSER_IMAGES_EXPRESSION = String.raw`async (dataUrl) => {
  async function canvasImage(width, height, drawable) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2D Canvas context is unavailable");
    context.drawImage(drawable, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = new Uint8ClampedArray(imageData.data);
    const encodedDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("RGBA data URL encoding failed"));
      });
      reader.addEventListener("error", () => reject(reader.error ?? new Error("RGBA data URL encoding failed")));
      reader.readAsDataURL(new Blob([pixels]));
    });
    return { width, height, dataUrl: encodedDataUrl };
  }

  const sourceBlob = await (await fetch(dataUrl)).blob();
  const source = await createImageBitmap(sourceBlob);
  try {
    const sourceImage = await canvasImage(source.width, source.height, source);
    const scaled075 = await canvasImage(Math.round(source.width * 0.75), Math.round(source.height * 0.75), source);
    const scaled125 = await canvasImage(Math.round(source.width * 1.25), Math.round(source.height * 1.25), source);

    const jpegCanvas = document.createElement("canvas");
    jpegCanvas.width = source.width;
    jpegCanvas.height = source.height;
    const jpegContext = jpegCanvas.getContext("2d");
    if (jpegContext === null) throw new Error("2D Canvas context is unavailable");
    jpegContext.drawImage(source, 0, 0);
    const jpegBlob = await new Promise((resolve, reject) => {
      jpegCanvas.toBlob((blob) => {
        if (blob === null) reject(new Error("Canvas JPEG encoding failed"));
        else resolve(blob);
      }, "image/jpeg", 0.75);
    });
    const jpeg = await createImageBitmap(jpegBlob);
    try {
      return [
        { name: "source", scale: 1, encoding: "source", image: sourceImage },
        { name: "canvas-scale-075", scale: 0.75, encoding: "canvas-rgba", image: scaled075 },
        { name: "canvas-scale-125", scale: 1.25, encoding: "canvas-rgba", image: scaled125 },
        { name: "canvas-jpeg-q75", scale: 1, encoding: "canvas-jpeg-075", image: await canvasImage(jpeg.width, jpeg.height, jpeg) },
      ];
    } finally {
      jpeg.close();
    }
  } finally {
    source.close();
  }
}`;

function browserType(engine: BrowserEngine): typeof chromium | typeof firefox | typeof webkit {
  switch (engine) {
    case "chromium": return chromium;
    case "firefox": return firefox;
    case "webkit": return webkit;
  }
}

function sourceDataUrl(sourcePath: string, sourceBytes: Buffer): string {
  const mediaType = (() => {
    switch (path.extname(sourcePath).toLowerCase()) {
      case ".jpg":
      case ".jpeg": return "image/jpeg";
      case ".png": return "image/png";
      case ".webp": return "image/webp";
      default: throw new Error(`Unsupported source image type: ${sourcePath}`);
    }
  })();
  return `data:${mediaType};base64,${sourceBytes.toString("base64")}`;
}

function decodeRgbaDataUrl(dataUrl: string): Uint8ClampedArray {
  const encoded = dataUrl.split(",", 2)[1];
  if (encoded === undefined) throw new Error("RGBA data URL is malformed");
  return new Uint8ClampedArray(Buffer.from(encoded, "base64"));
}

export async function deriveBrowserImages(
  engine: BrowserEngine,
  sourcePath: string,
): Promise<readonly BrowserDerivedImage[]> {
  const sourceBytes = await readFile(sourcePath);
  const browser = await browserType(engine).launch();

  try {
    const page = await browser.newPage();
    const dataUrl = sourceDataUrl(sourcePath, sourceBytes);
    const derivatives = await page.evaluate<BrowserDerivative[]>(
      `(${DERIVE_BROWSER_IMAGES_EXPRESSION})(${JSON.stringify(dataUrl)})`,
    );

    return derivatives.map((derivative) => ({
      engine,
      browserVersion: browser.version(),
      name: derivative.name,
      scale: derivative.scale,
      encoding: derivative.encoding,
      image: {
        width: derivative.image.width,
        height: derivative.image.height,
        data: decodeRgbaDataUrl(derivative.image.dataUrl),
      },
    }));
  } finally {
    await browser.close();
  }
}
