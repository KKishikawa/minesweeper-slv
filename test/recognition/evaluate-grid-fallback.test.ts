import { describe, expect, it } from "vitest";

import { evaluateGridEvidence } from "../../scripts/recognition/evaluate-grid-fallback.js";

describe("strict-only grid evidence evaluator", () => {
  it("evaluates the complete Chromium matrix in stable order", async () => {
    const summary = await evaluateGridEvidence({ warmupPasses: 0, measuredPasses: 1 });

    expect(summary.cases).toHaveLength(16);
    expect(summary.cases.map((value) => value.caseId)).toEqual([
      "0:source", "0:canvas-scale-075", "0:canvas-scale-125", "0:canvas-jpeg-q75",
      "1:source", "1:canvas-scale-075", "1:canvas-scale-125", "1:canvas-jpeg-q75",
      "2:source", "2:canvas-scale-075", "2:canvas-scale-125", "2:canvas-jpeg-q75",
      "3:source", "3:canvas-scale-075", "3:canvas-scale-125", "3:canvas-jpeg-q75",
    ]);
    expect(summary.cases.filter((value) => value.directStatus === "found")).toHaveLength(11);
    expect(summary.cases.filter((value) => value.pitchHint !== null)).toHaveLength(16);
    expect(summary.cases.every((value) => value.samplesMilliseconds.length === 1)).toBe(true);
    expect(Number.isFinite(summary.medianMilliseconds)).toBe(true);
    expect(Number.isFinite(summary.worstMilliseconds)).toBe(true);
  }, 120_000);
});
