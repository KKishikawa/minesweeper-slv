import { describe, expect, it } from "vitest";

import { detectGrid } from "../../src/recognition/grid.js";
import { detectGridWithDiagnostics } from "../../src/recognition/grid-fallback.js";
import { deriveBrowserImages } from "./browser-derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";

const expectedPaths = new Map<string, {
  readonly stage: "direct" | "fallback" | "source-revalidation-rejected";
  readonly canonicalCandidateCount: number;
  readonly sourceSurvivorCount: number;
}>([
  ["0:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["0:canvas-scale-075", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["0:canvas-scale-125", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["0:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["1:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["1:canvas-scale-075", { stage: "source-revalidation-rejected", canonicalCandidateCount: 3, sourceSurvivorCount: 3 }],
  ["1:canvas-scale-125", { stage: "fallback", canonicalCandidateCount: 1, sourceSurvivorCount: 1 }],
  ["1:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["2:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["2:canvas-scale-075", { stage: "source-revalidation-rejected", canonicalCandidateCount: 1, sourceSurvivorCount: 0 }],
  ["2:canvas-scale-125", { stage: "fallback", canonicalCandidateCount: 1, sourceSurvivorCount: 1 }],
  ["2:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["3:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["3:canvas-scale-075", { stage: "fallback", canonicalCandidateCount: 1, sourceSurvivorCount: 1 }],
  ["3:canvas-scale-125", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
  ["3:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0 }],
]);

describe("Chromium canonical grid fallback", () => {
  it("returns the exact fourteen-success and two-rejection public matrix", async () => {
    const failures: string[] = [];
    let caseCount = 0;
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveBrowserImages("chromium", fixture.imagePath)) {
        caseCount += 1;
        const caseId = `${fixture.id}:${derived.name}`;
        const expectedPath = expectedPaths.get(caseId);
        if (expectedPath === undefined) {
          failures.push(`${caseId}: unexpected formal case`);
          continue;
        }
        const geometry = detectGrid(derived.image, fixture);
        if (expectedPath.stage === "source-revalidation-rejected") {
          if (geometry !== null) failures.push(`${caseId}: unexpected public success`);
          continue;
        }
        if (geometry === null) {
          failures.push(`${caseId}: null`);
          continue;
        }

        const expectedPitch = fixture.expectedBoardBounds.width / fixture.columns;
        const tolerance = 0.1 * expectedPitch * derived.scale;
        const expectedBounds = {
          x: fixture.expectedBoardBounds.x * derived.scale,
          y: fixture.expectedBoardBounds.y * derived.scale,
          width: fixture.expectedBoardBounds.width * derived.scale,
          height: fixture.expectedBoardBounds.height * derived.scale,
        };
        for (const key of ["x", "y", "width", "height"] as const) {
          const error = Math.abs(geometry.bounds[key] - expectedBounds[key]);
          if (error > tolerance) failures.push(`${caseId}: ${key} error ${error} > ${tolerance}`);
        }
        const pitchDifference = Math.abs(geometry.pitchX - geometry.pitchY) / Math.max(geometry.pitchX, geometry.pitchY);
        if (pitchDifference > 0.05) failures.push(`${caseId}: pitch difference ${pitchDifference} > 0.05`);
      }
    }

    expect(caseCount).toBe(16);
    expect(failures).toEqual([]);
  }, 120_000);

  it("reports the exact eleven-direct, three-fallback, and two-rejection diagnostics", async () => {
    const failures: string[] = [];
    let caseCount = 0;
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveBrowserImages("chromium", fixture.imagePath)) {
        caseCount += 1;
        const caseId = `${fixture.id}:${derived.name}`;
        const result = detectGridWithDiagnostics(derived.image, fixture);
        const refinedPairCount = result.directRefinedPairCount + result.canonicalRefinedPairCount;
        if (refinedPairCount > 20_000) {
          failures.push(`${caseId}: refined pair count ${refinedPairCount} > 20000`);
        }

        const expectedPath = expectedPaths.get(caseId);
        if (expectedPath === undefined) {
          failures.push(`${caseId}: unexpected formal case`);
          continue;
        }

        const expectsGeometry = expectedPath.stage !== "source-revalidation-rejected";
        if (expectsGeometry !== (result.geometry !== null)) {
          failures.push(`${caseId}: diagnostic geometry ${result.geometry === null ? "null" : "non-null"}`);
        }
        if (result.stage !== expectedPath.stage) {
          failures.push(`${caseId}: stage ${result.stage} !== ${expectedPath.stage}`);
        }
        if (result.canonicalCandidateCount !== expectedPath.canonicalCandidateCount) {
          failures.push(
            `${caseId}: canonical candidate count ${result.canonicalCandidateCount} !== ${expectedPath.canonicalCandidateCount}`,
          );
        }
        if (result.sourceSurvivorCount !== expectedPath.sourceSurvivorCount) {
          failures.push(
            `${caseId}: source survivor count ${result.sourceSurvivorCount} !== ${expectedPath.sourceSurvivorCount}`,
          );
        }
      }
    }

    expect(caseCount).toBe(16);
    expect([...expectedPaths.values()].filter(({ stage }) => stage === "direct")).toHaveLength(11);
    expect([...expectedPaths.values()].filter(({ stage }) => stage === "fallback")).toHaveLength(3);
    expect([...expectedPaths.values()].filter(({ stage }) => stage === "source-revalidation-rejected")).toHaveLength(2);
    expect(failures).toEqual([]);
  }, 120_000);
});
