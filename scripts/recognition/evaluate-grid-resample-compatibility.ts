import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright";
import { transformWithOxc, version as viteVersion } from "vite";

import {
  canonicalScale,
  resampleCanonicalGridImage,
} from "../../src/recognition/grid-resample.js";
import type { PixelImage } from "../../src/recognition/types.js";
import {
  deriveBrowserImages,
  type BrowserEngine,
} from "../../test/recognition/browser-derive.js";
import { loadFixtureCases } from "../../test/recognition/fixture-manifest.js";

export interface GridResampleCompatibilityRow {
  readonly engine: BrowserEngine;
  readonly browserVersion: string | null;
  readonly caseId: "unit-2x2-scale-150" | "formal-30-pixel-pitch" | "formal-50-pixel-pitch";
  readonly expectedHash: string;
  readonly actualHash: string | null;
  readonly returnedBytesEqual: boolean | null;
  readonly dimensions: {
    readonly expected: { readonly width: number; readonly height: number };
    readonly actual: { readonly width: number; readonly height: number } | null;
  };
  readonly equal: boolean;
  readonly error: string | null;
}

export interface GridResampleCompatibilitySummary {
  readonly transformer: { readonly name: "vite-oxc"; readonly version: string };
  readonly rows: readonly GridResampleCompatibilityRow[];
}

interface ResampleCase {
  readonly caseId: GridResampleCompatibilityRow["caseId"];
  readonly image: PixelImage;
  readonly scale: number;
}

interface BrowserResampleResult {
  readonly width: number;
  readonly height: number;
  readonly hash: string;
  readonly data: readonly number[] | null;
}

const engines: readonly BrowserEngine[] = ["chromium", "firefox", "webkit"];
export const BROWSER_RESAMPLE_CHUNK_BYTES = 64 * 1024;

function browserFor(engine: BrowserEngine): typeof chromium | typeof firefox | typeof webkit {
  switch (engine) {
    case "chromium": return chromium;
    case "firefox": return firefox;
    case "webkit": return webkit;
  }
}

function rgbaHash(data: Uint8ClampedArray): string {
  return createHash("sha256").update(data).digest("hex");
}

function byteArraysEqual(first: readonly number[], second: Uint8ClampedArray): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

export async function hashBrowserOutputBytes(
  byteLength: number,
  readChunk: (offset: number, length: number) => Promise<readonly number[]>,
  chunkBytes = BROWSER_RESAMPLE_CHUNK_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new RangeError("Browser output byte length must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new RangeError("Browser output chunk length must be a positive safe integer.");
  }

  const hash = createHash("sha256");
  for (let offset = 0; offset < byteLength; offset += chunkBytes) {
    const length = Math.min(chunkBytes, byteLength - offset);
    const chunk = await readChunk(offset, length);
    if (chunk.length !== length) {
      throw new Error(`Browser output chunk length mismatch at offset ${offset}.`);
    }
    hash.update(Uint8Array.from(chunk));
  }
  return hash.digest("hex");
}

async function transpiledResampleModule(): Promise<string> {
  const sourcePath = fileURLToPath(new URL("../../src/recognition/grid-resample.ts", import.meta.url));
  const source = await readFile(sourcePath, "utf8");
  const transformed = await transformWithOxc(source, sourcePath, { lang: "ts", target: "es2022" });
  return transformed.code;
}

async function formalResampleCases(): Promise<readonly ResampleCase[]> {
  const [fixture] = await loadFixtureCases();
  if (fixture === undefined) throw new Error("Fixture manifest is empty.");
  const derivatives = await deriveBrowserImages("chromium", fixture.imagePath);
  const derivative30 = derivatives.find((derivative) => derivative.name === "canvas-scale-075");
  const derivative50 = derivatives.find((derivative) => derivative.name === "canvas-scale-125");
  if (derivative30 === undefined || derivative50 === undefined) {
    throw new Error("Chromium did not generate both formal canonical-pitch derivatives.");
  }

  return [
    {
      caseId: "unit-2x2-scale-150",
      image: {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          0, 0, 0, 255, 60, 60, 60, 255,
          120, 120, 120, 255, 180, 180, 180, 255,
        ]),
      },
      scale: 1.5,
    },
    {
      caseId: "formal-30-pixel-pitch",
      image: derivative30.image,
      scale: canonicalScale(30),
    },
    {
      caseId: "formal-50-pixel-pitch",
      image: derivative50.image,
      scale: canonicalScale(50),
    },
  ];
}

async function browserResample(
  engine: BrowserEngine,
  moduleSource: string,
  image: PixelImage,
  scale: number,
  includeBytes: boolean,
): Promise<{ readonly browserVersion: string; readonly output: BrowserResampleResult }> {
  const browser = await browserFor(engine).launch();
  try {
    const page = await browser.newPage();
    const outputKey = `__gridResampleOutput_${randomUUID()}`;
    try {
      const output = await page.evaluate(async ({ moduleSource: source, input, inputScale, includeBytes: returnBytes, key }) => {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          const importModule = new Function("moduleUrl", "return import(moduleUrl)") as (moduleUrl: string) => Promise<{
            resampleCanonicalGridImage(value: {
              readonly width: number;
              readonly height: number;
              readonly data: Uint8ClampedArray;
            }, valueScale: number): {
              readonly width: number;
              readonly height: number;
              readonly data: Uint8ClampedArray;
            };
          }>;
          const module = await importModule(url);
          const decoded = atob(input.dataBase64);
          const sourceBytes = new Uint8ClampedArray(new ArrayBuffer(decoded.length));
          for (let index = 0; index < decoded.length; index += 1) {
            sourceBytes[index] = decoded.charCodeAt(index);
          }
          const result = module.resampleCanonicalGridImage({
            width: input.width,
            height: input.height,
            data: sourceBytes,
          }, inputScale);
          Reflect.set(globalThis, key, result);
          return {
            width: result.width,
            height: result.height,
            data: returnBytes ? [...result.data] : null,
          };
        } finally {
          URL.revokeObjectURL(url);
        }
      }, {
        moduleSource,
        input: {
          width: image.width,
          height: image.height,
          dataBase64: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength).toString("base64"),
        },
        inputScale: scale,
        includeBytes,
        key: outputKey,
      });
      const hash = await hashBrowserOutputBytes(
        output.width * output.height * 4,
        async (offset, length) => page.evaluate(({ key, start, end }) => {
          const stored = Reflect.get(globalThis, key) as { readonly data: Uint8ClampedArray } | undefined;
          if (stored === undefined) throw new Error("Browser resample output is unavailable.");
          return Array.from(stored.data.subarray(start, end));
        }, { key: outputKey, start: offset, end: offset + length }),
      );
      return { browserVersion: browser.version(), output: { ...output, hash } };
    } finally {
      await page.evaluate((key) => Reflect.deleteProperty(globalThis, key), outputKey).catch(() => undefined);
    }
  } finally {
    await browser.close();
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function evaluateGridResampleCompatibility(options?: {
  readonly engines?: readonly BrowserEngine[];
}): Promise<GridResampleCompatibilitySummary> {
  const [moduleSource, cases] = await Promise.all([transpiledResampleModule(), formalResampleCases()]);
  const rows: GridResampleCompatibilityRow[] = [];

  for (const engine of options?.engines ?? engines) {
    for (const caseValue of cases) {
      const expected = resampleCanonicalGridImage(caseValue.image, caseValue.scale);
      const expectedHash = rgbaHash(expected.data);
      try {
        const result = await browserResample(
          engine,
          moduleSource,
          caseValue.image,
          caseValue.scale,
          caseValue.caseId === "unit-2x2-scale-150",
        );
        const actualHash = result.output.hash;
        const returnedBytesEqual = result.output.data === null
          ? null
          : byteArraysEqual(result.output.data, expected.data);
        const equal = result.output.width === expected.width
          && result.output.height === expected.height
          && actualHash === expectedHash
          && (returnedBytesEqual ?? true);
        rows.push({
          engine,
          browserVersion: result.browserVersion,
          caseId: caseValue.caseId,
          expectedHash,
          actualHash,
          returnedBytesEqual,
          dimensions: {
            expected: { width: expected.width, height: expected.height },
            actual: { width: result.output.width, height: result.output.height },
          },
          equal,
          error: null,
        });
      } catch (error) {
        rows.push({
          engine,
          browserVersion: null,
          caseId: caseValue.caseId,
          expectedHash,
          actualHash: null,
          returnedBytesEqual: null,
          dimensions: {
            expected: { width: expected.width, height: expected.height },
            actual: null,
          },
          equal: false,
          error: errorText(error),
        });
      }
    }
  }
  return { transformer: { name: "vite-oxc", version: viteVersion }, rows };
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === path.resolve(invokedPath)) {
  process.stdout.write(`${JSON.stringify(await evaluateGridResampleCompatibility(), null, 2)}\n`);
}
