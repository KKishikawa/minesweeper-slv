import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { estimateCanonicalPitch } from "../../src/recognition/grid-evidence.js";
import { GridRefinementBudget } from "../../src/recognition/grid-budget.js";
import { detectStrictGridAttempt } from "../../src/recognition/grid-strict.js";
import type { GridGeometry, PixelImage } from "../../src/recognition/types.js";
import { deriveBrowserImages } from "../../test/recognition/browser-derive.js";
import { loadFixtureCases, type FixtureCase } from "../../test/recognition/fixture-manifest.js";

export interface GridEvidenceEvaluationCase {
  readonly caseId: string;
  readonly pixelHash: string;
  readonly directStatus: "found" | "rejected" | "ambiguous" | "budget-exhausted";
  readonly pitchHint: number | null;
  readonly geometry: GridGeometry | null;
  readonly refinedPairCount: number;
  readonly samplesMilliseconds: readonly number[];
}

export interface GridEvidenceEvaluationSummary {
  readonly engine: "chromium";
  readonly warmupPasses: number;
  readonly measuredPasses: number;
  readonly cases: readonly GridEvidenceEvaluationCase[];
  readonly medianMilliseconds: number;
  readonly worstMilliseconds: number;
}

interface DecodedEvaluationCase {
  readonly caseId: string;
  readonly fixture: FixtureCase;
  readonly image: PixelImage;
  readonly pixelHash: string;
}

interface StrictMeasurement {
  readonly directStatus: GridEvidenceEvaluationCase["directStatus"];
  readonly pitchHint: number | null;
  readonly geometry: GridGeometry | null;
  readonly refinedPairCount: number;
  readonly pixelHash: string;
  readonly elapsedMilliseconds: number;
}

function nonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function hashRgbaPixels(image: PixelImage): string {
  return createHash("sha256").update(image.data).digest("hex");
}

export function assertStablePixelHash(
  caseId: string,
  image: PixelImage,
  expectedHash: string,
): string {
  const actualHash = hashRgbaPixels(image);
  if (actualHash !== expectedHash) {
    throw new Error(`Measured-pass drift for ${caseId} field pixelHash.`);
  }
  return actualHash;
}

async function decodeEvaluationCases(): Promise<readonly DecodedEvaluationCase[]> {
  const cases: DecodedEvaluationCase[] = [];
  for (const fixture of await loadFixtureCases()) {
    for (const derived of await deriveBrowserImages("chromium", fixture.imagePath)) {
      cases.push({
        caseId: `${fixture.id}:${derived.name}`,
        fixture,
        image: derived.image,
        pixelHash: hashRgbaPixels(derived.image),
      });
    }
  }
  return cases;
}

function measureStrictAttempt(caseValue: DecodedEvaluationCase): StrictMeasurement {
  assertStablePixelHash(caseValue.caseId, caseValue.image, caseValue.pixelHash);
  const budget = new GridRefinementBudget(20_000);
  const startedAt = performance.now();
  const attempt = detectStrictGridAttempt(caseValue.image, caseValue.fixture, budget);
  const pitchHint = attempt.coarseEvidence === null ? null : estimateCanonicalPitch(attempt.coarseEvidence);
  const elapsedMilliseconds = performance.now() - startedAt;
  const pixelHash = assertStablePixelHash(caseValue.caseId, caseValue.image, caseValue.pixelHash);

  return {
    directStatus: attempt.status,
    pitchHint,
    geometry: attempt.status === "found" ? attempt.geometry : null,
    refinedPairCount: attempt.refinedPairCount,
    pixelHash,
    elapsedMilliseconds,
  };
}

function assertNoMeasuredDrift(
  caseId: string,
  expected: StrictMeasurement,
  actual: StrictMeasurement,
): void {
  const fields: readonly (keyof Omit<StrictMeasurement, "elapsedMilliseconds">)[] = [
    "directStatus",
    "geometry",
    "pitchHint",
    "refinedPairCount",
    "pixelHash",
  ];
  for (const field of fields) {
    if (JSON.stringify(expected[field]) !== JSON.stringify(actual[field])) {
      throw new Error(`Measured-pass drift for ${caseId} field ${field}.`);
    }
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export async function evaluateGridEvidence(options?: {
  readonly warmupPasses?: number;
  readonly measuredPasses?: number;
}): Promise<GridEvidenceEvaluationSummary> {
  const warmupPasses = options?.warmupPasses ?? 1;
  const measuredPasses = options?.measuredPasses ?? 3;
  nonNegativeSafeInteger(warmupPasses, "warmupPasses");
  nonNegativeSafeInteger(measuredPasses, "measuredPasses");
  if (measuredPasses < 1) throw new RangeError("measuredPasses must be at least 1.");

  const decodedCases = await decodeEvaluationCases();
  for (let pass = 0; pass < warmupPasses; pass += 1) {
    for (const caseValue of decodedCases) measureStrictAttempt(caseValue);
  }

  const cases = decodedCases.map((caseValue) => {
    const first = measureStrictAttempt(caseValue);
    const samplesMilliseconds = [first.elapsedMilliseconds];
    for (let pass = 1; pass < measuredPasses; pass += 1) {
      const next = measureStrictAttempt(caseValue);
      assertNoMeasuredDrift(caseValue.caseId, first, next);
      samplesMilliseconds.push(next.elapsedMilliseconds);
    }
    return {
      caseId: caseValue.caseId,
      pixelHash: first.pixelHash,
      directStatus: first.directStatus,
      pitchHint: first.pitchHint,
      geometry: first.geometry,
      refinedPairCount: first.refinedPairCount,
      samplesMilliseconds,
    };
  });
  const allSamples = cases.flatMap((caseValue) => caseValue.samplesMilliseconds);

  return {
    engine: "chromium",
    warmupPasses,
    measuredPasses,
    cases,
    medianMilliseconds: median(allSamples),
    worstMilliseconds: Math.max(...allSamples),
  };
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === path.resolve(invokedPath)) {
  process.stdout.write(`${JSON.stringify(await evaluateGridEvidence(), null, 2)}\n`);
}
