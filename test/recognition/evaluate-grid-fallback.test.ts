import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertStablePixelHash,
  evaluateGridEvidence,
  evaluateGridFallbackUxPerformance,
  evaluateGridFallbackPartialAdoption,
  type GridEvidenceInputCase,
  type GridEvidenceMeasurementObservation,
} from "../../scripts/recognition/evaluate-grid-fallback.js";
import type { PixelImage } from "../../src/recognition/types.js";

const expectedCases = new Map<string, {
  readonly stage: "direct" | "fallback" | "source-revalidation-rejected";
  readonly geometry: "present" | "null";
  readonly normalizedHash: "present" | "null";
  readonly canonicalCandidateCount: number;
  readonly sourceSurvivorCount: number;
  readonly directRefinedPairCount: number;
  readonly canonicalRefinedPairCount: number;
  readonly totalRefinedPairCount: number;
}>([
  ["0:source", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_240, canonicalRefinedPairCount: 0, totalRefinedPairCount: 2_240 }],
  ["0:canvas-scale-075", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 1_392, canonicalRefinedPairCount: 0, totalRefinedPairCount: 1_392 }],
  ["0:canvas-scale-125", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 1_640, canonicalRefinedPairCount: 0, totalRefinedPairCount: 1_640 }],
  ["0:canvas-jpeg-q75", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_325, canonicalRefinedPairCount: 0, totalRefinedPairCount: 2_325 }],
  ["1:source", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_718, canonicalRefinedPairCount: 0, totalRefinedPairCount: 2_718 }],
  ["1:canvas-scale-075", { stage: "source-revalidation-rejected", geometry: "null", normalizedHash: "present", canonicalCandidateCount: 3, sourceSurvivorCount: 3, directRefinedPairCount: 2_155, canonicalRefinedPairCount: 1_449, totalRefinedPairCount: 3_604 }],
  ["1:canvas-scale-125", { stage: "fallback", geometry: "present", normalizedHash: "present", canonicalCandidateCount: 1, sourceSurvivorCount: 1, directRefinedPairCount: 1_296, canonicalRefinedPairCount: 1_632, totalRefinedPairCount: 2_928 }],
  ["1:canvas-jpeg-q75", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_791, canonicalRefinedPairCount: 0, totalRefinedPairCount: 2_791 }],
  ["2:source", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 3_251, canonicalRefinedPairCount: 0, totalRefinedPairCount: 3_251 }],
  ["2:canvas-scale-075", { stage: "source-revalidation-rejected", geometry: "null", normalizedHash: "present", canonicalCandidateCount: 1, sourceSurvivorCount: 0, directRefinedPairCount: 2_207, canonicalRefinedPairCount: 1_753, totalRefinedPairCount: 3_960 }],
  ["2:canvas-scale-125", { stage: "fallback", geometry: "present", normalizedHash: "present", canonicalCandidateCount: 1, sourceSurvivorCount: 1, directRefinedPairCount: 1_825, canonicalRefinedPairCount: 1_950, totalRefinedPairCount: 3_775 }],
  ["2:canvas-jpeg-q75", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 3_212, canonicalRefinedPairCount: 0, totalRefinedPairCount: 3_212 }],
  ["3:source", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 750, canonicalRefinedPairCount: 0, totalRefinedPairCount: 750 }],
  ["3:canvas-scale-075", { stage: "fallback", geometry: "present", normalizedHash: "present", canonicalCandidateCount: 1, sourceSurvivorCount: 1, directRefinedPairCount: 397, canonicalRefinedPairCount: 1_012, totalRefinedPairCount: 1_409 }],
  ["3:canvas-scale-125", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 528, canonicalRefinedPairCount: 0, totalRefinedPairCount: 528 }],
  ["3:canvas-jpeg-q75", { stage: "direct", geometry: "present", normalizedHash: "null", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 1_057, canonicalRefinedPairCount: 0, totalRefinedPairCount: 1_057 }],
]);

describe("grid evidence input hash stability", () => {
  it("rejects an RGBA mutation with the case ID and input-hash field", () => {
    const image = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255]),
    };
    const initialHash = createHash("sha256").update(image.data).digest("hex");
    image.data[0] = 1;

    expect(() => assertStablePixelHash("fixture:source", image, initialHash))
      .toThrowError("Measured-pass drift for fixture:source field inputHash.");
  });
});

describe("paired grid fallback evaluator", () => {
  it("accepts absolute UX latency when relative ratios still fail", () => {
    const result = evaluateGridFallbackUxPerformance({
      strictMedianMilliseconds: 200,
      completeMedianMilliseconds: 250,
      strictWorstMilliseconds: 400,
      completeWorstMilliseconds: 500,
      medianRatio: 1.25,
      worstRatio: 2,
    });

    expect(result).toEqual({
      medianThresholdMilliseconds: 500,
      worstThresholdMilliseconds: 1_000,
      medianPass: true,
      worstPass: true,
      passed: true,
    });
  });

  it("fails absolute UX latency when either bound is exceeded", () => {
    const result = evaluateGridFallbackUxPerformance({
      strictMedianMilliseconds: 200,
      completeMedianMilliseconds: 501,
      strictWorstMilliseconds: 400,
      completeWorstMilliseconds: 999,
      medianRatio: 1.1,
      worstRatio: 1.2,
    });

    expect(result).toEqual({
      medianThresholdMilliseconds: 500,
      worstThresholdMilliseconds: 1_000,
      medianPass: false,
      worstPass: true,
      passed: false,
    });
  });

  it.each([
    ["functionalMatrix", { functionalMatrixPassed: false }],
    ["negativeMatrix", { negativeMatrixPassed: false }],
    ["determinism", { determinismPassed: false }],
    ["budget", { budgetPassed: false }],
    ["uxLatency", { uxLatencyPassed: false }],
  ])("fails partial adoption when %s is false", (_, overrides) => {
    expect(evaluateGridFallbackPartialAdoption({
      functionalMatrixPassed: true,
      negativeMatrixPassed: true,
      determinismPassed: true,
      budgetPassed: true,
      uxLatencyPassed: true,
      ...overrides,
    })).toMatchObject({
      ...overrides,
      passed: false,
    });
  });

  it("reuses sixteen retained Chromium inputs across three alternating measured runs", async () => {
    let loaderCalls = 0;
    const retainedImages = new Map<string, PixelImage>();
    const observedMeasurements = new Map<string, { warmup: number; measured: number }>();
    const summary = await evaluateGridEvidence(undefined, {
      acquireCases: async (loadDefault: () => Promise<readonly GridEvidenceInputCase[]>) => {
        loaderCalls += 1;
        const cases = await loadDefault();
        for (const caseValue of cases) retainedImages.set(caseValue.caseId, caseValue.image);
        return cases;
      },
      observeMeasurement: (measurement: GridEvidenceMeasurementObservation) => {
        expect(measurement.image, `${measurement.caseId} retained image`).toBe(retainedImages.get(measurement.caseId));
        const counts = observedMeasurements.get(measurement.caseId) ?? { warmup: 0, measured: 0 };
        counts[measurement.phase] += 1;
        observedMeasurements.set(measurement.caseId, counts);
      },
    });

    expect(loaderCalls).toBe(1);
    expect(summary.retainedInputCount).toBe(16);
    expect(summary.inputAcquisitionPasses).toBe(1);
    expect(summary.warmupPasses).toBe(1);
    expect(summary.measuredPasses).toBe(3);
    expect(summary.measuredExecutionOrder).toEqual([
      "strict-first",
      "complete-first",
      "strict-first",
    ]);
    expect(summary.cases.map((value) => value.caseId)).toEqual([...expectedCases.keys()]);
    expect([...observedMeasurements.entries()]).toEqual(
      [...expectedCases.keys()].map((caseId) => [caseId, { warmup: 2, measured: 6 }]),
    );
    expect(summary.measuredExecutionTrace).toHaveLength(16 * 2 * 3);
    const expectedCaseIds = [...expectedCases.keys()];
    for (let run = 0; run < 3; run += 1) {
      const runTrace = summary.measuredExecutionTrace.slice(run * 32, (run + 1) * 32);
      const firstKind = run % 2 === 0 ? "strict" : "complete";
      const secondKind = run % 2 === 0 ? "complete" : "strict";
      expect(runTrace.filter((_, index) => index % 2 === 0)).toEqual(
        expectedCaseIds.map((caseId) => `${firstKind}:${caseId}`),
      );
      expect(runTrace.filter((_, index) => index % 2 === 1)).toEqual(
        expectedCaseIds.map((caseId) => `${secondKind}:${caseId}`),
      );
    }

    for (const caseValue of summary.cases) {
      const expected = expectedCases.get(caseValue.caseId);
      expect(expected, caseValue.caseId).toBeDefined();
      expect(caseValue.inputHash, `${caseValue.caseId} input hash`).toMatch(/^[0-9a-f]{64}$/);
      expect(caseValue.geometry === null ? "null" : "present", `${caseValue.caseId} geometry`).toBe(expected!.geometry);
      expect(caseValue.normalizedHash === null ? "null" : "present", `${caseValue.caseId} normalized hash`).toBe(expected!.normalizedHash);
      if (caseValue.normalizedHash !== null) {
        expect(caseValue.normalizedHash, `${caseValue.caseId} normalized hash`).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(caseValue.stage, `${caseValue.caseId} stage`).toBe(expected!.stage);
      expect(caseValue.canonicalCandidateCount, `${caseValue.caseId} canonical candidates`).toBe(expected!.canonicalCandidateCount);
      expect(caseValue.sourceSurvivorCount, `${caseValue.caseId} source survivors`).toBe(expected!.sourceSurvivorCount);
      expect(caseValue.directRefinedPairCount, `${caseValue.caseId} direct pairs`).toBe(expected!.directRefinedPairCount);
      expect(caseValue.canonicalRefinedPairCount, `${caseValue.caseId} canonical pairs`).toBe(expected!.canonicalRefinedPairCount);
      expect(caseValue.totalRefinedPairCount, `${caseValue.caseId} total pairs`).toBe(expected!.totalRefinedPairCount);
      expect(caseValue.totalRefinedPairCount, `${caseValue.caseId} pair budget`).toBeLessThanOrEqual(20_000);
      expect(caseValue.strictSamplesMilliseconds).toHaveLength(3);
      expect(caseValue.completeSamplesMilliseconds).toHaveLength(3);
    }

    expect(summary.cases).toHaveLength(16);
    expect(summary.cases.filter((value) => value.stage === "direct")).toHaveLength(11);
    expect(summary.cases.filter((value) => value.stage === "fallback")).toHaveLength(3);
    expect(summary.cases.filter((value) => value.stage === "source-revalidation-rejected")).toHaveLength(2);
    expect(summary.cases.map((value) => `${value.caseId}:${value.stage}`)).toEqual([
      "0:source:direct",
      "0:canvas-scale-075:direct",
      "0:canvas-scale-125:direct",
      "0:canvas-jpeg-q75:direct",
      "1:source:direct",
      "1:canvas-scale-075:source-revalidation-rejected",
      "1:canvas-scale-125:fallback",
      "1:canvas-jpeg-q75:direct",
      "2:source:direct",
      "2:canvas-scale-075:source-revalidation-rejected",
      "2:canvas-scale-125:fallback",
      "2:canvas-jpeg-q75:direct",
      "3:source:direct",
      "3:canvas-scale-075:fallback",
      "3:canvas-scale-125:direct",
      "3:canvas-jpeg-q75:direct",
    ]);
    expect(Number.isFinite(summary.strictMedianMilliseconds)).toBe(true);
    expect(Number.isFinite(summary.completeMedianMilliseconds)).toBe(true);
    expect(Number.isFinite(summary.strictWorstMilliseconds)).toBe(true);
    expect(Number.isFinite(summary.completeWorstMilliseconds)).toBe(true);
    expect(summary.medianRatio).toBe(summary.completeMedianMilliseconds / summary.strictMedianMilliseconds);
    expect(summary.worstRatio).toBe(summary.completeWorstMilliseconds / summary.strictWorstMilliseconds);
    expect(summary.uxMedianThresholdMilliseconds).toBe(500);
    expect(summary.uxWorstThresholdMilliseconds).toBe(1_000);
    expect(summary.uxMedianPass).toBe(true);
    expect(summary.uxWorstPass).toBe(true);
    expect(summary.uxLatencyPassed).toBe(true);
    expect(summary.functionalMatrixPassed).toBe(true);
    expect(summary.negativeMatrixPassed).toBeNull();
    expect(summary.determinismPassed).toBe(true);
    expect(summary.budgetPassed).toBe(true);
    expect("partialAdoptionPassed" in summary).toBe(false);
  }, 300_000);
});
