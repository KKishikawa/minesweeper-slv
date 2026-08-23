import { describe, expect, it } from "vitest";

import { evaluateLeaveOneScreenOut } from "../../scripts/recognition/evaluate-folds.js";
import { CELL_LABEL_ORDER } from "../../src/recognition/prototype-bank.js";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("whole-screen holdout", () => {
  it("keeps held-out truth out of fitting and calibration and records formal fold metrics", async () => {
    const fixtures = await loadFixtureCases();
    const results = await evaluateLeaveOneScreenOut(fixtures, "chromium");
    expect(results.map((result) => result.heldOutFixtureId)).toEqual(fixtures.map((fixture) => fixture.id));

    for (const result of results) {
      const expectedTraining = fixtures
        .filter((fixture) => fixture.id !== result.heldOutFixtureId)
        .map((fixture) => fixture.id);
      const trainingLabels = new Set(fixtures
        .filter((fixture) => expectedTraining.includes(fixture.id))
        .flatMap((fixture) => fixture.expectedCells));
      const expectedAbsentLabels = CELL_LABEL_ORDER.filter((label) => !trainingLabels.has(label));

      expect(result.trainingFixtureIds).toEqual(expectedTraining);
      expect(result.calibrationFixtureIds).toEqual(expectedTraining);
      expect(result.trainingFixtureIds).not.toContain(result.heldOutFixtureId);
      expect(result.calibrationFixtureIds).not.toContain(result.heldOutFixtureId);
      expect(result.absentTrainingLabels).toEqual(expectedAbsentLabels);
      expect(result.prototypeCounts.length).toBe(CELL_LABEL_ORDER.length - expectedAbsentLabels.length);
      expect(result.prototypeCounts.every((count) => Number.isInteger(count) && count >= 1 && count <= 12)).toBe(true);
      expect(result.evaluationCases.map((evaluationCase) => evaluationCase.id)).toEqual([
        `${result.heldOutFixtureId}:source`,
        `${result.heldOutFixtureId}:canvas-scale-075`,
        `${result.heldOutFixtureId}:canvas-scale-125`,
        `${result.heldOutFixtureId}:canvas-jpeg-q75`,
      ]);
      expect(result.evaluationCases.map((evaluationCase) => evaluationCase.kind))
        .toEqual(["source", "transformed", "transformed", "transformed"]);
      for (const evaluationCase of result.evaluationCases) {
        expect(evaluationCase.correctCells + evaluationCase.wrongCertainCells + evaluationCase.uncertainCells)
          .toBe(480);
        expect(Number.isFinite(evaluationCase.elapsedMs)).toBe(true);
        expect(evaluationCase.elapsedMs).toBeGreaterThanOrEqual(0);
      }

      const formalMetricsPass = result.thresholds !== null
        && result.evaluationCases.every((evaluationCase) => evaluationCase.wrongCertainCells === 0
          && evaluationCase.uncertainCells <= 4);
      expect(result.passes).toBe(formalMetricsPass);
      if (result.thresholds === null) expect(result.passes).toBe(false);
    }
  }, 180_000);
});
