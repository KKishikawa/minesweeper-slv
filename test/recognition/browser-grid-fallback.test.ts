import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { detectGrid } from "../../src/recognition/grid.js";
import { detectGridWithDiagnostics } from "../../src/recognition/grid-fallback.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { deriveBrowserImages, type BrowserDerivedImage } from "./browser-derive.js";
import { loadFixtureCases, type FixtureCase } from "./fixture-manifest.js";

const expectedPaths = new Map<string, {
  readonly stage: "direct" | "fallback" | "source-revalidation-rejected";
  readonly canonicalCandidateCount: number;
  readonly sourceSurvivorCount: number;
  readonly directRefinedPairCount: number;
  readonly canonicalRefinedPairCount: number;
}>([
  ["0:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_240, canonicalRefinedPairCount: 0 }],
  ["0:canvas-scale-075", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 1_392, canonicalRefinedPairCount: 0 }],
  ["0:canvas-scale-125", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 1_640, canonicalRefinedPairCount: 0 }],
  ["0:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_325, canonicalRefinedPairCount: 0 }],
  ["1:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_718, canonicalRefinedPairCount: 0 }],
  ["1:canvas-scale-075", { stage: "source-revalidation-rejected", canonicalCandidateCount: 3, sourceSurvivorCount: 3, directRefinedPairCount: 2_155, canonicalRefinedPairCount: 1_449 }],
  ["1:canvas-scale-125", { stage: "fallback", canonicalCandidateCount: 1, sourceSurvivorCount: 1, directRefinedPairCount: 1_296, canonicalRefinedPairCount: 1_632 }],
  ["1:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 2_791, canonicalRefinedPairCount: 0 }],
  ["2:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 3_251, canonicalRefinedPairCount: 0 }],
  ["2:canvas-scale-075", { stage: "source-revalidation-rejected", canonicalCandidateCount: 1, sourceSurvivorCount: 0, directRefinedPairCount: 2_207, canonicalRefinedPairCount: 1_753 }],
  ["2:canvas-scale-125", { stage: "fallback", canonicalCandidateCount: 1, sourceSurvivorCount: 1, directRefinedPairCount: 1_825, canonicalRefinedPairCount: 1_950 }],
  ["2:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 3_212, canonicalRefinedPairCount: 0 }],
  ["3:source", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 750, canonicalRefinedPairCount: 0 }],
  ["3:canvas-scale-075", { stage: "fallback", canonicalCandidateCount: 1, sourceSurvivorCount: 1, directRefinedPairCount: 397, canonicalRefinedPairCount: 1_012 }],
  ["3:canvas-scale-125", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 528, canonicalRefinedPairCount: 0 }],
  ["3:canvas-jpeg-q75", { stage: "direct", canonicalCandidateCount: 0, sourceSurvivorCount: 0, directRefinedPairCount: 1_057, canonicalRefinedPairCount: 0 }],
]);

interface RetainedBrowserCase {
  readonly caseId: string;
  readonly fixture: FixtureCase;
  readonly derived: BrowserDerivedImage;
  readonly inputHash: string;
}

function rgbaHash(image: PixelImage): string {
  return createHash("sha256").update(image.data).digest("hex");
}

describe("Chromium canonical grid fallback", () => {
  it("keeps the exact formal matrix deterministic across three runs over retained inputs", async () => {
    const retainedCases: RetainedBrowserCase[] = [];
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveBrowserImages("chromium", fixture.imagePath)) {
        retainedCases.push({
          caseId: `${fixture.id}:${derived.name}`,
          fixture,
          derived,
          inputHash: rgbaHash(derived.image),
        });
      }
    }

    expect(retainedCases).toHaveLength(16);
    expect(retainedCases.map(({ caseId }) => caseId)).toEqual([...expectedPaths.keys()]);

    const failures: string[] = [];
    let firstRun: readonly unknown[] | null = null;
    for (let run = 0; run < 3; run += 1) {
      const runResults: unknown[] = [];
      for (const retained of retainedCases) {
        const { caseId, fixture, derived, inputHash } = retained;
        const beforeHash = rgbaHash(derived.image);
        const publicGeometry = detectGrid(derived.image, fixture);
        const result = detectGridWithDiagnostics(derived.image, fixture);
        const afterHash = rgbaHash(derived.image);
        const normalizedHash = result.normalizedImage === null ? null : rgbaHash(result.normalizedImage);
        const totalRefinedPairCount = result.directRefinedPairCount + result.canonicalRefinedPairCount;
        runResults.push({
          caseId,
          inputHash: afterHash,
          normalizedHash,
          publicGeometry,
          geometry: result.geometry,
          stage: result.stage,
          canonicalCandidateCount: result.canonicalCandidateCount,
          sourceSurvivorCount: result.sourceSurvivorCount,
          directRefinedPairCount: result.directRefinedPairCount,
          canonicalRefinedPairCount: result.canonicalRefinedPairCount,
          totalRefinedPairCount,
        });

        if (beforeHash !== inputHash || afterHash !== inputHash) {
          failures.push(`run ${run + 1} ${caseId}: input hash drift`);
        }
        if (JSON.stringify(publicGeometry) !== JSON.stringify(result.geometry)) {
          failures.push(`run ${run + 1} ${caseId}: public/diagnostic geometry mismatch`);
        }
        if (totalRefinedPairCount > 20_000) {
          failures.push(`run ${run + 1} ${caseId}: refined pair count ${totalRefinedPairCount} > 20000`);
        }

        const expectedPath = expectedPaths.get(caseId)!;
        if (result.stage !== expectedPath.stage) {
          failures.push(`run ${run + 1} ${caseId}: stage ${result.stage} !== ${expectedPath.stage}`);
        }
        if (result.canonicalCandidateCount !== expectedPath.canonicalCandidateCount) {
          failures.push(`run ${run + 1} ${caseId}: canonical candidates ${result.canonicalCandidateCount} !== ${expectedPath.canonicalCandidateCount}`);
        }
        if (result.sourceSurvivorCount !== expectedPath.sourceSurvivorCount) {
          failures.push(`run ${run + 1} ${caseId}: source survivors ${result.sourceSurvivorCount} !== ${expectedPath.sourceSurvivorCount}`);
        }
        if (result.directRefinedPairCount !== expectedPath.directRefinedPairCount) {
          failures.push(`run ${run + 1} ${caseId}: direct pairs ${result.directRefinedPairCount} !== ${expectedPath.directRefinedPairCount}`);
        }
        if (result.canonicalRefinedPairCount !== expectedPath.canonicalRefinedPairCount) {
          failures.push(`run ${run + 1} ${caseId}: canonical pairs ${result.canonicalRefinedPairCount} !== ${expectedPath.canonicalRefinedPairCount}`);
        }

        const expectsGeometry = expectedPath.stage !== "source-revalidation-rejected";
        if (expectsGeometry !== (result.geometry !== null)) {
          failures.push(`run ${run + 1} ${caseId}: geometry ${result.geometry === null ? "null" : "non-null"}`);
        }
        if (!expectsGeometry) {
          if (normalizedHash === null) failures.push(`run ${run + 1} ${caseId}: missing rejected normalized hash`);
          continue;
        }

        const geometry = result.geometry!;
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
          if (error > tolerance) failures.push(`run ${run + 1} ${caseId}: ${key} error ${error} > ${tolerance}`);
        }
        const pitchDifference = Math.abs(geometry.pitchX - geometry.pitchY) / Math.max(geometry.pitchX, geometry.pitchY);
        if (pitchDifference > 0.05) failures.push(`run ${run + 1} ${caseId}: pitch difference ${pitchDifference} > 0.05`);
      }

      if (firstRun === null) firstRun = runResults;
      else expect(runResults, `run ${run + 1} deterministic diagnostics`).toEqual(firstRun);
    }

    expect([...expectedPaths.values()].filter(({ stage }) => stage === "direct")).toHaveLength(11);
    expect([...expectedPaths.values()].filter(({ stage }) => stage === "fallback")).toHaveLength(3);
    expect([...expectedPaths.values()].filter(({ stage }) => stage === "source-revalidation-rejected")).toHaveLength(2);
    expect(failures).toEqual([]);
  }, 180_000);
});
