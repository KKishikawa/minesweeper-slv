import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GridRefinementBudget } from "../../src/recognition/grid-budget.js";
import { estimateCanonicalPitch } from "../../src/recognition/grid-evidence.js";
import {
  detectGridWithDiagnostics,
  type GridDetectionDiagnosticResult,
} from "../../src/recognition/grid-fallback.js";
import { detectStrictGridAttempt } from "../../src/recognition/grid-strict.js";
import type { GridGeometry, PixelImage } from "../../src/recognition/types.js";
import { deriveBrowserImages } from "../../test/recognition/browser-derive.js";
import { loadFixtureCases, type FixtureCase } from "../../test/recognition/fixture-manifest.js";

type DirectStatus = "found" | "rejected" | "ambiguous" | "budget-exhausted";
type MeasuredExecutionOrder = "strict-first" | "complete-first";

export interface GridEvidenceEvaluationCase {
  readonly caseId: string;
  readonly inputHash: string;
  readonly normalizedHash: string | null;
  readonly directStatus: DirectStatus;
  readonly pitchHint: number | null;
  readonly geometry: GridGeometry | null;
  readonly stage: GridDetectionDiagnosticResult["stage"];
  readonly canonicalCandidateCount: number;
  readonly sourceSurvivorCount: number;
  readonly directRefinedPairCount: number;
  readonly canonicalRefinedPairCount: number;
  readonly totalRefinedPairCount: number;
  readonly strictSamplesMilliseconds: readonly number[];
  readonly completeSamplesMilliseconds: readonly number[];
}

export interface GridEvidenceEvaluationSummary {
  readonly engine: "chromium";
  readonly retainedInputCount: number;
  readonly inputAcquisitionPasses: number;
  readonly warmupPasses: number;
  readonly measuredPasses: number;
  readonly measuredExecutionOrder: readonly MeasuredExecutionOrder[];
  readonly measuredExecutionTrace: readonly string[];
  readonly cases: readonly GridEvidenceEvaluationCase[];
  readonly strictMedianMilliseconds: number;
  readonly completeMedianMilliseconds: number;
  readonly strictWorstMilliseconds: number;
  readonly completeWorstMilliseconds: number;
  readonly medianRatio: number;
  readonly worstRatio: number;
}

export interface GridEvidenceInputCase {
  readonly caseId: string;
  readonly fixture: FixtureCase;
  readonly image: PixelImage;
  readonly inputHash: string;
}

export interface GridEvidenceMeasurementObservation {
  readonly caseId: string;
  readonly image: PixelImage;
  readonly phase: "warmup" | "measured";
  readonly path: "strict" | "complete";
  readonly pass: number;
}

export interface GridEvidenceEvaluationDependencies {
  readonly acquireCases?: (
    loadDefault: () => Promise<readonly GridEvidenceInputCase[]>,
  ) => Promise<readonly GridEvidenceInputCase[]>;
  readonly observeMeasurement?: (measurement: GridEvidenceMeasurementObservation) => void;
}

interface StrictMeasurement {
  readonly directStatus: DirectStatus;
  readonly pitchHint: number | null;
  readonly geometry: GridGeometry | null;
  readonly refinedPairCount: number;
  readonly inputHash: string;
  readonly elapsedMilliseconds: number;
}

interface CompleteMeasurement {
  readonly inputHash: string;
  readonly normalizedHash: string | null;
  readonly geometry: GridGeometry | null;
  readonly stage: GridDetectionDiagnosticResult["stage"];
  readonly canonicalCandidateCount: number;
  readonly sourceSurvivorCount: number;
  readonly directRefinedPairCount: number;
  readonly canonicalRefinedPairCount: number;
  readonly totalRefinedPairCount: number;
  readonly elapsedMilliseconds: number;
}

interface AccumulatedMeasurements {
  strict: StrictMeasurement | null;
  complete: CompleteMeasurement | null;
  readonly strictSamplesMilliseconds: number[];
  readonly completeSamplesMilliseconds: number[];
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
    throw new Error(`Measured-pass drift for ${caseId} field inputHash.`);
  }
  return actualHash;
}

async function decodeEvaluationCases(): Promise<readonly GridEvidenceInputCase[]> {
  const cases: GridEvidenceInputCase[] = [];
  for (const fixture of await loadFixtureCases()) {
    for (const derived of await deriveBrowserImages("chromium", fixture.imagePath)) {
      cases.push({
        caseId: `${fixture.id}:${derived.name}`,
        fixture,
        image: derived.image,
        inputHash: hashRgbaPixels(derived.image),
      });
    }
  }
  return cases;
}

function measureStrictAttempt(caseValue: GridEvidenceInputCase): StrictMeasurement {
  assertStablePixelHash(caseValue.caseId, caseValue.image, caseValue.inputHash);
  const budget = new GridRefinementBudget(20_000);
  const startedAt = performance.now();
  const attempt = detectStrictGridAttempt(caseValue.image, caseValue.fixture, budget);
  const pitchHint = attempt.coarseEvidence === null ? null : estimateCanonicalPitch(attempt.coarseEvidence);
  const elapsedMilliseconds = performance.now() - startedAt;
  const inputHash = assertStablePixelHash(caseValue.caseId, caseValue.image, caseValue.inputHash);

  return {
    directStatus: attempt.status,
    pitchHint,
    geometry: attempt.status === "found" ? attempt.geometry : null,
    refinedPairCount: attempt.refinedPairCount,
    inputHash,
    elapsedMilliseconds,
  };
}

function measureCompleteAttempt(caseValue: GridEvidenceInputCase): CompleteMeasurement {
  assertStablePixelHash(caseValue.caseId, caseValue.image, caseValue.inputHash);
  const startedAt = performance.now();
  const result = detectGridWithDiagnostics(caseValue.image, caseValue.fixture);
  const elapsedMilliseconds = performance.now() - startedAt;
  const inputHash = assertStablePixelHash(caseValue.caseId, caseValue.image, caseValue.inputHash);
  const normalizedHash = result.normalizedImage === null ? null : hashRgbaPixels(result.normalizedImage);
  const totalRefinedPairCount = result.directRefinedPairCount + result.canonicalRefinedPairCount;

  return {
    inputHash,
    normalizedHash,
    geometry: result.geometry,
    stage: result.stage,
    canonicalCandidateCount: result.canonicalCandidateCount,
    sourceSurvivorCount: result.sourceSurvivorCount,
    directRefinedPairCount: result.directRefinedPairCount,
    canonicalRefinedPairCount: result.canonicalRefinedPairCount,
    totalRefinedPairCount,
    elapsedMilliseconds,
  };
}

function assertNoMeasuredDrift<T extends object>(
  caseId: string,
  expected: T,
  actual: T,
  fields: readonly (keyof T)[],
): void {
  for (const field of fields) {
    if (JSON.stringify(expected[field]) !== JSON.stringify(actual[field])) {
      throw new Error(`Measured-pass drift for ${caseId} field ${String(field)}.`);
    }
  }
}

const strictDeterministicFields: readonly (keyof StrictMeasurement)[] = [
  "directStatus",
  "geometry",
  "pitchHint",
  "refinedPairCount",
  "inputHash",
];

const completeDeterministicFields: readonly (keyof CompleteMeasurement)[] = [
  "inputHash",
  "normalizedHash",
  "geometry",
  "stage",
  "canonicalCandidateCount",
  "sourceSurvivorCount",
  "directRefinedPairCount",
  "canonicalRefinedPairCount",
  "totalRefinedPairCount",
];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function measuredOrder(pass: number): MeasuredExecutionOrder {
  return pass % 2 === 0 ? "strict-first" : "complete-first";
}

export async function evaluateGridEvidence(options?: {
  readonly warmupPasses?: number;
  readonly measuredPasses?: number;
}, dependencies?: GridEvidenceEvaluationDependencies): Promise<GridEvidenceEvaluationSummary> {
  const warmupPasses = options?.warmupPasses ?? 1;
  const measuredPasses = options?.measuredPasses ?? 3;
  nonNegativeSafeInteger(warmupPasses, "warmupPasses");
  nonNegativeSafeInteger(measuredPasses, "measuredPasses");
  if (measuredPasses < 1) throw new RangeError("measuredPasses must be at least 1.");

  let inputAcquisitionPasses = 0;
  const acquireCases = dependencies?.acquireCases ?? ((loadDefault) => loadDefault());
  inputAcquisitionPasses += 1;
  const decodedCases = await acquireCases(decodeEvaluationCases);
  const observeMeasurement = (
    caseValue: GridEvidenceInputCase,
    phase: GridEvidenceMeasurementObservation["phase"],
    pathValue: GridEvidenceMeasurementObservation["path"],
    pass: number,
  ): void => {
    dependencies?.observeMeasurement?.({
      caseId: caseValue.caseId,
      image: caseValue.image,
      phase,
      path: pathValue,
      pass,
    });
  };
  for (let pass = 0; pass < warmupPasses; pass += 1) {
    for (const caseValue of decodedCases) {
      observeMeasurement(caseValue, "warmup", "strict", pass);
      measureStrictAttempt(caseValue);
    }
    for (const caseValue of decodedCases) {
      observeMeasurement(caseValue, "warmup", "complete", pass);
      measureCompleteAttempt(caseValue);
    }
  }

  const accumulated = new Map<string, AccumulatedMeasurements>(decodedCases.map((caseValue) => [
    caseValue.caseId,
    {
      strict: null,
      complete: null,
      strictSamplesMilliseconds: [],
      completeSamplesMilliseconds: [],
    },
  ]));

  const measureStrictCase = (caseValue: GridEvidenceInputCase, pass: number): void => {
    observeMeasurement(caseValue, "measured", "strict", pass);
    const next = measureStrictAttempt(caseValue);
    const values = accumulated.get(caseValue.caseId)!;
    if (values.strict === null) values.strict = next;
    else assertNoMeasuredDrift(caseValue.caseId, values.strict, next, strictDeterministicFields);
    values.strictSamplesMilliseconds.push(next.elapsedMilliseconds);
  };
  const measureCompleteCase = (caseValue: GridEvidenceInputCase, pass: number): void => {
    observeMeasurement(caseValue, "measured", "complete", pass);
    const next = measureCompleteAttempt(caseValue);
    const values = accumulated.get(caseValue.caseId)!;
    if (values.complete === null) values.complete = next;
    else assertNoMeasuredDrift(caseValue.caseId, values.complete, next, completeDeterministicFields);
    values.completeSamplesMilliseconds.push(next.elapsedMilliseconds);
  };

  const measuredExecutionOrder = Array.from({ length: measuredPasses }, (_, pass) => measuredOrder(pass));
  const measuredExecutionTrace: string[] = [];
  for (let pass = 0; pass < measuredExecutionOrder.length; pass += 1) {
    const order = measuredExecutionOrder[pass]!;
    for (const caseValue of decodedCases) {
      if (order === "strict-first") {
        measuredExecutionTrace.push(`strict:${caseValue.caseId}`);
        measureStrictCase(caseValue, pass);
        measuredExecutionTrace.push(`complete:${caseValue.caseId}`);
        measureCompleteCase(caseValue, pass);
      } else {
        measuredExecutionTrace.push(`complete:${caseValue.caseId}`);
        measureCompleteCase(caseValue, pass);
        measuredExecutionTrace.push(`strict:${caseValue.caseId}`);
        measureStrictCase(caseValue, pass);
      }
    }
  }

  const cases = decodedCases.map((caseValue): GridEvidenceEvaluationCase => {
    const values = accumulated.get(caseValue.caseId)!;
    const strict = values.strict!;
    const complete = values.complete!;
    return {
      caseId: caseValue.caseId,
      inputHash: complete.inputHash,
      normalizedHash: complete.normalizedHash,
      directStatus: strict.directStatus,
      pitchHint: strict.pitchHint,
      geometry: complete.geometry,
      stage: complete.stage,
      canonicalCandidateCount: complete.canonicalCandidateCount,
      sourceSurvivorCount: complete.sourceSurvivorCount,
      directRefinedPairCount: complete.directRefinedPairCount,
      canonicalRefinedPairCount: complete.canonicalRefinedPairCount,
      totalRefinedPairCount: complete.totalRefinedPairCount,
      strictSamplesMilliseconds: values.strictSamplesMilliseconds,
      completeSamplesMilliseconds: values.completeSamplesMilliseconds,
    };
  });
  const strictSamples = cases.flatMap((caseValue) => caseValue.strictSamplesMilliseconds);
  const completeSamples = cases.flatMap((caseValue) => caseValue.completeSamplesMilliseconds);
  const strictMedianMilliseconds = median(strictSamples);
  const completeMedianMilliseconds = median(completeSamples);
  const strictWorstMilliseconds = Math.max(...strictSamples);
  const completeWorstMilliseconds = Math.max(...completeSamples);

  return {
    engine: "chromium",
    retainedInputCount: decodedCases.length,
    inputAcquisitionPasses,
    warmupPasses,
    measuredPasses,
    measuredExecutionOrder,
    measuredExecutionTrace,
    cases,
    strictMedianMilliseconds,
    completeMedianMilliseconds,
    strictWorstMilliseconds,
    completeWorstMilliseconds,
    medianRatio: completeMedianMilliseconds / strictMedianMilliseconds,
    worstRatio: completeWorstMilliseconds / strictWorstMilliseconds,
  };
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === path.resolve(invokedPath)) {
  process.stdout.write(`${JSON.stringify(await evaluateGridEvidence(), null, 2)}\n`);
}
