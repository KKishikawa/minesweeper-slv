import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CANVAS_PARAMETERS, deriveBrowserImages, type BrowserEngine, type BrowserDerivativeName } from "../../test/recognition/browser-derive.js";
import { CASE_NAMES, containedPath, sha256, type DatasetFixture, type ExpectedStage } from "./dataset.js";

export interface CaseEvidence {
  id: string;
  engine: BrowserEngine;
  role: "formal" | "reference";
  name: BrowserDerivativeName;
  width: number;
  height: number;
  scale: number;
  encoding: string;
  parameters: typeof CANVAS_PARAMETERS;
  expectedStage: ExpectedStage;
  recognition: "not-run";
  rgbaSha256: string;
  pngSha256: string;
  file: string;
  reproducible: boolean;
  runs: { browserVersion: string; width: number; height: number; rgbaSha256: string }[];
}

export class FixtureEvidenceError extends Error {
  constructor(message: string, readonly cases: CaseEvidence[]) {
    super(message);
    this.name = "FixtureEvidenceError";
  }
}

export async function deriveFixtureEvidence(root: string, fixture: Pick<DatasetFixture, "id" | "source" | "expectedStages">, engine: BrowserEngine, directory: string, prefix: string): Promise<CaseEvidence[]> {
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error("Unsafe evidence file prefix.");
  const sourcePath = await containedPath(root, fixture.source.path);
  if (sha256(await readFile(sourcePath)) !== fixture.source.sha256) throw new Error(`Source hash mismatch: ${fixture.id}`);
  const cases: CaseEvidence[] = [];
  try {
    // Each call launches a fresh browser, not merely a reused page.
    for (let run = 0; run < 3; run++) {
      const images = await deriveBrowserImages(engine, sourcePath);
      if (images.length !== 4 || images.some((image, i) => image.name !== CASE_NAMES[i])) throw new Error("Incomplete browser derivative matrix.");
      for (const [index, image] of images.entries()) {
        const snapshot = { browserVersion: image.browserVersion, width: image.image.width, height: image.image.height, rgbaSha256: sha256(Buffer.from(image.image.data)) };
        if (run === 0) {
          const file = `${prefix}-${image.name}.png`;
          // Lossless PNG transports Canvas RGBA; it is not a substitute JPEG encoder.
          const png = await sharp(Buffer.from(image.image.data), { raw: { width: image.image.width, height: image.image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
          await writeFile(path.join(directory, file), png, { flag: "wx" });
          cases.push({
            id: `${fixture.id}:${image.name}`, engine, role: engine === "chromium" ? "formal" : "reference", name: image.name,
            width: image.image.width, height: image.image.height, scale: image.scale, encoding: image.encoding,
            parameters: CANVAS_PARAMETERS, expectedStage: fixture.expectedStages[image.name], recognition: "not-run",
            rgbaSha256: snapshot.rgbaSha256, pngSha256: sha256(png), file, reproducible: false, runs: [],
          });
        }
        const entry = cases[index]!;
        entry.runs.push(snapshot);
        entry.reproducible = entry.runs.length === 3 && entry.runs.every((item) => JSON.stringify(item) === JSON.stringify(entry.runs[0]));
        await writeFile(path.join(directory, `${prefix}-progress.json`), `${JSON.stringify({ cases }, null, 2)}\n`);
      }
    }
    if (sha256(await readFile(sourcePath)) !== fixture.source.sha256) throw new Error(`Source hash mismatch after transformation: ${fixture.id}`);
  } catch (error) {
    throw new FixtureEvidenceError(error instanceof Error ? error.message : String(error), cases);
  }
  return cases;
}
