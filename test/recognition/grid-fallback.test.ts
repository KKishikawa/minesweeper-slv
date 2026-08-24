import { describe, expect, it } from "vitest";

import { GridRefinementBudget } from "../../src/recognition/grid-budget.js";
import {
  detectGridDirectFirst,
  type CanonicalFallbackOperations,
} from "../../src/recognition/grid-fallback.js";
import {
  buildEdgeProfiles,
  detectStrictGridAttempt,
  hasMappedBoundaryProvenance,
  revalidateMappedCandidate,
  type GridBoundaryCandidate,
  type GridDimensions,
  type RefinedGridCandidate,
  type SourceGridValidationContext,
  type StrictGridAttempt,
  type ValidatedGridCandidate,
} from "../../src/recognition/grid-strict.js";
import {
  canonicalScale,
  resampleCanonicalGridImage,
} from "../../src/recognition/grid-resample.js";
import type {
  GridGeometry,
  PixelImage,
} from "../../src/recognition/types.js";
import { syntheticSparseIntersectionImage } from "./grid-fixtures.js";
import { syntheticGridImage } from "./synthetic-grid.js";

const dimensions: GridDimensions = { columns: 4, rows: 4 };
const source: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray(16),
};
const normalized: PixelImage = {
  width: 3,
  height: 3,
  data: new Uint8ClampedArray(36),
};
const directGeometry: GridGeometry = {
  bounds: { x: 1, y: 2, width: 40, height: 40 },
  columns: 4,
  rows: 4,
  pitchX: 10,
  pitchY: 10,
  score: 3,
};
const canonicalGeometry: GridGeometry = {
  bounds: { x: 4, y: 8, width: 160, height: 160 },
  columns: 4,
  rows: 4,
  pitchX: 40,
  pitchY: 40,
  score: 5,
};
const mappedGeometry: GridGeometry = {
  bounds: { x: 3, y: 7, width: 120, height: 120 },
  columns: 4,
  rows: 4,
  pitchX: 30,
  pitchY: 30,
  score: 5,
};
const evidence = {
  vertical: [{ pitch: 30, normalizedScore: 1, candidateCount: 1 }],
  horizontal: [{ pitch: 30, normalizedScore: 1, candidateCount: 1 }],
};
const sourceContext = {} as SourceGridValidationContext;
const canonicalCandidate: ValidatedGridCandidate = {
  geometry: canonicalGeometry,
  verticalBoundaries: [4, 44, 84, 124, 164],
  horizontalBoundaries: [8, 48, 88, 128, 168],
  rangeScore: 5,
};
const alternateCandidate: GridBoundaryCandidate = {
  verticalBoundaries: [8, 48, 88, 128, 168],
  horizontalBoundaries: [12, 52, 92, 132, 172],
  rangeScore: 4,
};
const thirdCandidate: GridBoundaryCandidate = {
  verticalBoundaries: [12, 52, 92, 132, 172],
  horizontalBoundaries: [16, 56, 96, 136, 176],
  rangeScore: 3,
};

function found(
  geometry: GridGeometry,
  candidate: ValidatedGridCandidate = canonicalCandidate,
  refinedPairCount = 7,
): StrictGridAttempt {
  return {
    status: "found",
    geometry,
    candidate,
    candidates: [candidate],
    coarseEvidence: evidence,
    sourceContext,
    refinedPairCount,
  };
}

function rejected(overrides: Partial<Extract<StrictGridAttempt, { status: "rejected" }>> = {}): StrictGridAttempt {
  return {
    status: "rejected",
    candidates: [],
    coarseEvidence: evidence,
    sourceContext,
    refinedPairCount: 11,
    ...overrides,
  };
}

function ambiguous(
  candidates: readonly GridBoundaryCandidate[],
  refinedPairCount = 19,
): StrictGridAttempt {
  return {
    status: "ambiguous",
    candidates,
    coarseEvidence: evidence,
    sourceContext,
    refinedPairCount,
  };
}

function operations(overrides: Partial<CanonicalFallbackOperations> = {}): CanonicalFallbackOperations {
  let attempts = 0;
  return {
    strictAttempt: () => {
      attempts += 1;
      return attempts === 1 ? rejected() : found(canonicalGeometry);
    },
    estimatePitch: () => 30,
    resample: () => normalized,
    revalidate: () => mappedGeometry,
    ...overrides,
  };
}

describe("detectGridDirectFirst", () => {
  it("returns a direct success without estimating or normalizing", () => {
    const calls: string[] = [];
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => {
        calls.push("strict");
        return found(directGeometry, { ...canonicalCandidate, geometry: directGeometry }, 13);
      },
      estimatePitch: () => {
        calls.push("estimate");
        return 30;
      },
      resample: () => {
        calls.push("resample");
        return normalized;
      },
    }));

    expect(result).toEqual({
      geometry: directGeometry,
      stage: "direct",
      directRefinedPairCount: 13,
      canonicalRefinedPairCount: 0,
      canonicalCandidateCount: 0,
      sourceSurvivorCount: 0,
      normalizedImage: null,
    });
    expect(calls).toEqual(["strict"]);
  });

  it.each([
    { name: "missing evidence", attempt: rejected({ coarseEvidence: null }), estimate: 30 },
    { name: "ambiguous evidence", attempt: rejected(), estimate: null },
  ])("rejects $name before normalization", ({ attempt, estimate }) => {
    const calls: string[] = [];
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => attempt,
      estimatePitch: () => estimate,
      resample: () => {
        calls.push("resample");
        return normalized;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("hint-rejected");
    expect(result.normalizedImage).toBeNull();
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(calls).toEqual([]);
  });

  it("rejects an out-of-range pitch before normalization", () => {
    let resampleCalls = 0;
    const result = detectGridDirectFirst(source, dimensions, operations({
      estimatePitch: () => 29,
      resample: () => {
        resampleCalls += 1;
        return normalized;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("normalization-rejected");
    expect(result.normalizedImage).toBeNull();
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(resampleCalls).toBe(0);
  });

  it("fails closed without source context before normalization", () => {
    let resampleCalls = 0;
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => rejected({ sourceContext: null }),
      resample: () => {
        resampleCalls += 1;
        return normalized;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("source-revalidation-rejected");
    expect(result.normalizedImage).toBeNull();
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(resampleCalls).toBe(0);
  });

  it("does not fall back after direct budget exhaustion", () => {
    const calls: string[] = [];
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => ({
        status: "budget-exhausted",
        candidates: [],
        coarseEvidence: evidence,
        sourceContext,
        refinedPairCount: 0,
      }),
      estimatePitch: () => {
        calls.push("estimate");
        return 30;
      },
      resample: () => {
        calls.push("resample");
        return normalized;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("budget-exhausted");
    expect(result.normalizedImage).toBeNull();
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(calls).toEqual([]);
  });

  it("normalizes once and gives both strict attempts the same budget", () => {
    const budget = new GridRefinementBudget(123);
    const receivedBudgets: GridRefinementBudget[] = [];
    const receivedImages: PixelImage[] = [];
    let resampleCalls = 0;
    let attempts = 0;
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: (image, _dimensions, receivedBudget) => {
        attempts += 1;
        receivedImages.push(image);
        receivedBudgets.push(receivedBudget);
        return attempts === 1 ? rejected() : found(canonicalGeometry, canonicalCandidate, 17);
      },
      resample: () => {
        resampleCalls += 1;
        return normalized;
      },
    }), budget);

    expect(result.geometry).toEqual(mappedGeometry);
    expect(result.stage).toBe("fallback");
    expect(result.directRefinedPairCount).toBe(11);
    expect(result.canonicalRefinedPairCount).toBe(17);
    expect(result.canonicalCandidateCount).toBe(1);
    expect(result.sourceSurvivorCount).toBe(1);
    expect(result.normalizedImage).toBe(normalized);
    expect(receivedBudgets).toEqual([budget, budget]);
    expect(receivedImages).toEqual([source, normalized]);
    expect(resampleCalls).toBe(1);
  });

  it.each(["rejected", "ambiguous"] as const)("fails closed when canonical strict detection is %s", (status) => {
    let attempts = 0;
    let revalidateCalls = 0;
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => {
        attempts += 1;
        if (attempts === 1) return rejected();
        return status === "ambiguous" ? {
          status,
          candidates: [],
          coarseEvidence: evidence,
          sourceContext,
          refinedPairCount: 19,
        } : {
          status,
          candidates: [],
          coarseEvidence: evidence,
          sourceContext,
          refinedPairCount: 19,
        };
      },
      revalidate: () => {
        revalidateCalls += 1;
        return mappedGeometry;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("canonical-rejected");
    expect(result.canonicalRefinedPairCount).toBe(19);
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(result.normalizedImage).toBe(normalized);
    expect(revalidateCalls).toBe(0);
  });

  it("reports canonical budget exhaustion without revalidation", () => {
    let attempts = 0;
    let revalidateCalls = 0;
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => {
        attempts += 1;
        return attempts === 1 ? rejected() : {
          status: "budget-exhausted",
          candidates: [],
          coarseEvidence: evidence,
          sourceContext,
          refinedPairCount: 0,
        };
      },
      revalidate: () => {
        revalidateCalls += 1;
        return mappedGeometry;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("budget-exhausted");
    expect(result.canonicalRefinedPairCount).toBe(0);
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(result.normalizedImage).toBe(normalized);
    expect(revalidateCalls).toBe(0);
  });

  it("fails closed when resampling rejects the normalization", () => {
    const result = detectGridDirectFirst(source, dimensions, operations({
      resample: () => {
        throw new RangeError("too large");
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("normalization-rejected");
    expect(result.normalizedImage).toBeNull();
    expect(result.canonicalRefinedPairCount).toBe(0);
    expect(result.canonicalCandidateCount).toBe(0);
    expect(result.sourceSurvivorCount).toBe(0);
  });

  it("exposes only the source-revalidated mapped geometry", () => {
    const revalidateArguments: unknown[][] = [];
    const result = detectGridDirectFirst(source, dimensions, operations({
      revalidate: (...args) => {
        revalidateArguments.push(args);
        return mappedGeometry;
      },
    }));

    expect(result.geometry).toEqual(mappedGeometry);
    expect(result.geometry).not.toEqual(canonicalGeometry);
    expect(result.stage).toBe("fallback");
    expect(result.canonicalCandidateCount).toBe(1);
    expect(result.sourceSurvivorCount).toBe(1);
    expect(revalidateArguments).toEqual([
      [source, dimensions, sourceContext, canonicalCandidate, 4 / 3, 30],
    ]);
  });

  it("fails closed when source revalidation rejects the canonical candidate", () => {
    const result = detectGridDirectFirst(source, dimensions, operations({ revalidate: () => null }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("source-revalidation-rejected");
    expect(result.normalizedImage).toBe(normalized);
    expect(result.canonicalCandidateCount).toBe(1);
    expect(result.sourceSurvivorCount).toBe(0);
  });

  it("returns an ambiguous canonical grid when exactly one candidate survives source revalidation", () => {
    let attempts = 0;
    const calls: GridBoundaryCandidate[] = [];
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => {
        attempts += 1;
        return attempts === 1
          ? rejected()
          : ambiguous([canonicalCandidate, alternateCandidate, thirdCandidate]);
      },
      revalidate: (_source, _dimensions, _context, candidate) => {
        calls.push(candidate);
        return candidate === alternateCandidate ? mappedGeometry : null;
      },
    }));

    expect(result.geometry).toBe(mappedGeometry);
    expect(result.stage).toBe("fallback");
    expect(result.canonicalCandidateCount).toBe(3);
    expect(result.sourceSurvivorCount).toBe(1);
    expect(calls).toEqual([canonicalCandidate, alternateCandidate, thirdCandidate]);
  });

  it.each([
    { name: "zero", survivors: [] as readonly GridBoundaryCandidate[] },
    { name: "two", survivors: [canonicalCandidate, thirdCandidate] as readonly GridBoundaryCandidate[] },
  ])("rejects after revalidating all candidates when $name candidates survive", ({ survivors }) => {
    let attempts = 0;
    const calls: GridBoundaryCandidate[] = [];
    const candidates = [canonicalCandidate, alternateCandidate, thirdCandidate];
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => {
        attempts += 1;
        return attempts === 1 ? rejected() : ambiguous(candidates);
      },
      revalidate: (_source, _dimensions, _context, candidate) => {
        calls.push(candidate);
        return survivors.includes(candidate) ? mappedGeometry : null;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("source-revalidation-rejected");
    expect(result.canonicalCandidateCount).toBe(3);
    expect(result.sourceSurvivorCount).toBe(survivors.length);
    expect(calls).toEqual(candidates);
  });

  it("rejects nine canonical candidates without truncating or revalidating", () => {
    let attempts = 0;
    let revalidateCalls = 0;
    const candidates = Array.from({ length: 9 }, (_, index): GridBoundaryCandidate => ({
      verticalBoundaries: [index, index + 40, index + 80, index + 120, index + 160],
      horizontalBoundaries: [index, index + 40, index + 80, index + 120, index + 160],
      rangeScore: 9 - index,
    }));
    const result = detectGridDirectFirst(source, dimensions, operations({
      strictAttempt: () => {
        attempts += 1;
        return attempts === 1 ? rejected() : ambiguous(candidates);
      },
      revalidate: () => {
        revalidateCalls += 1;
        return mappedGeometry;
      },
    }));

    expect(result.geometry).toBeNull();
    expect(result.stage).toBe("canonical-rejected");
    expect(result.canonicalCandidateCount).toBe(9);
    expect(result.sourceSurvivorCount).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  it("makes the exactly-one decision independently of canonical candidate order", () => {
    const run = (candidates: readonly GridBoundaryCandidate[]) => {
      let attempts = 0;
      const calls: GridBoundaryCandidate[] = [];
      const result = detectGridDirectFirst(source, dimensions, operations({
        strictAttempt: () => {
          attempts += 1;
          return attempts === 1 ? rejected() : ambiguous(candidates);
        },
        revalidate: (_source, _dimensions, _context, candidate) => {
          calls.push(candidate);
          return candidate === alternateCandidate ? mappedGeometry : null;
        },
      }));
      return { result, calls };
    };

    const forward = run([canonicalCandidate, alternateCandidate, thirdCandidate]);
    const reverse = run([thirdCandidate, alternateCandidate, canonicalCandidate]);
    expect(forward.result.geometry).toBe(mappedGeometry);
    expect(reverse.result.geometry).toBe(mappedGeometry);
    expect(forward.result.sourceSurvivorCount).toBe(1);
    expect(reverse.result.sourceSurvivorCount).toBe(1);
    expect(forward.calls).toHaveLength(3);
    expect(reverse.calls).toHaveLength(3);
  });
});

describe("hasMappedBoundaryProvenance", () => {
  it("accepts the measured periodic two-pixel mapped/refined alias pattern", () => {
    const mapped = [
      287.125, 314.875, 344.875, 376.375, 404.875, 434.875, 466.375, 494.875,
      524.875, 556.375, 584.875, 614.875, 646.375, 674.875, 704.875, 737.125, 764.875,
    ];
    const refined = [286, 313, 345, 376, 403, 435, 466, 493, 525, 556, 583, 615, 646, 673, 705, 736, 763];

    expect(hasMappedBoundaryProvenance(mapped, refined)).toBe(true);
  });

  it("requires equal non-empty finite strictly increasing shapes within the refinement radius", () => {
    expect(hasMappedBoundaryProvenance([10, 20], [8, 22])).toBe(true);
    expect(hasMappedBoundaryProvenance([], [])).toBe(false);
    expect(hasMappedBoundaryProvenance([10], [10, 20])).toBe(false);
    expect(hasMappedBoundaryProvenance([10, Number.NaN], [10, 20])).toBe(false);
    expect(hasMappedBoundaryProvenance([10, 20], [10, Number.POSITIVE_INFINITY])).toBe(false);
    expect(hasMappedBoundaryProvenance([10, 10], [10, 20])).toBe(false);
    expect(hasMappedBoundaryProvenance([10, 20], [10, 10])).toBe(false);
    expect(hasMappedBoundaryProvenance([10], [12.001])).toBe(false);
  });
});

function strictAttempt(image: PixelImage, valueDimensions: GridDimensions): StrictGridAttempt {
  return detectStrictGridAttempt(image, valueDimensions, new GridRefinementBudget(20_000));
}

function requireSourceContext(attempt: StrictGridAttempt): SourceGridValidationContext {
  if (attempt.sourceContext === null) throw new Error(`strict attempt has no source context: ${attempt.status}`);
  return attempt.sourceContext;
}

function requireFoundCandidate(attempt: StrictGridAttempt): ValidatedGridCandidate {
  if (attempt.status !== "found") throw new Error(`strict attempt did not find a candidate: ${attempt.status}`);
  return attempt.candidate;
}

describe("revalidateMappedCandidate", () => {
  it("accepts a canonical strict candidate mapped back to a valid source grid", () => {
    const valueDimensions = { columns: 4, rows: 4 };
    const vertical = Array.from({ length: 5 }, (_, index) => 20 + index * 30);
    const horizontal = Array.from({ length: 5 }, (_, index) => 20 + index * 30);
    const sourceImage = syntheticGridImage(180, 180, vertical, horizontal, false);
    const sourceAttempt = strictAttempt(sourceImage, valueDimensions);
    const scale = canonicalScale(30);
    const canonicalAttempt = strictAttempt(resampleCanonicalGridImage(sourceImage, scale), valueDimensions);

    const result = revalidateMappedCandidate(
      sourceImage,
      valueDimensions,
      requireSourceContext(sourceAttempt),
      requireFoundCandidate(canonicalAttempt),
      scale,
      30,
    );

    expect(result).not.toBeNull();
    expect(result?.bounds).toEqual({ x: 20, y: 20, width: 120, height: 120 });
    expect(result?.pitchX).toBe(30);
    expect(result?.pitchY).toBe(30);
  });

  it("accepts canonical-phase-valid boundaries with periodic two-pixel source aliasing", () => {
    const valueDimensions = { columns: 4, rows: 4 };
    const canonicalBoundaries = [28, 68, 108, 148, 188];
    const canonicalImage = syntheticGridImage(
      220,
      220,
      canonicalBoundaries,
      canonicalBoundaries,
      false,
    );
    const canonicalAttempt = strictAttempt(canonicalImage, valueDimensions);
    const vertical = [21, 51, 81, 111, 141];
    const horizontal = [21, 49, 81, 111, 141];
    const sourceImage = syntheticGridImage(180, 180, vertical, horizontal, false);
    const sourceAttempt = strictAttempt(sourceImage, valueDimensions);

    const result = revalidateMappedCandidate(
      sourceImage,
      valueDimensions,
      requireSourceContext(sourceAttempt),
      requireFoundCandidate(canonicalAttempt),
      4 / 3,
      30,
    );

    expect(result).not.toBeNull();
    expect(result?.bounds).toEqual({ x: 21, y: 21, width: 120, height: 120 });
  });

  it("rejects projected lines with less than 90 percent source intersection support", () => {
    const valueDimensions = { columns: 30, rows: 16 };
    const vertical = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
    const horizontal = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    const valid = syntheticGridImage(340, 200, vertical, horizontal, false);
    const projected = syntheticSparseIntersectionImage(vertical, horizontal);
    const projectedAttempt = strictAttempt(projected, valueDimensions);

    expect(revalidateMappedCandidate(
      projected,
      valueDimensions,
      requireSourceContext(projectedAttempt),
      requireFoundCandidate(strictAttempt(valid, valueDimensions)),
      1,
      10,
    )).toBeNull();
  });

  it("rejects a two-through-four-pixel displaced competing extent", () => {
    const valueDimensions = { columns: 30, rows: 16 };
    const horizontal = Array.from({ length: 17 }, (_, index) => 10 + index * 10);
    for (const displacement of [2, 3, 4]) {
      const first = Array.from({ length: 31 }, (_, index) => 10 + index * 10);
      const valid = syntheticGridImage(340, 200, first, horizontal, false);
      const validAttempt = strictAttempt(valid, valueDimensions);
      const sourceContext = requireSourceContext(validAttempt);
      const anchor = sourceContext.refinedCandidates[0];
      if (anchor === undefined) throw new Error("valid source has no refined candidate");
      const shift = (values: readonly number[]): readonly number[] => values.map((value) => value + displacement);
      const competitor: RefinedGridCandidate = {
        ...anchor,
        candidate: {
          ...anchor.candidate,
          vertical: {
            ...anchor.candidate.vertical,
            origin: anchor.candidate.vertical.origin + displacement,
          },
        },
        verticalBoundaries: shift(anchor.verticalBoundaries),
        canonicalVerticalBoundaries: shift(anchor.canonicalVerticalBoundaries),
      };

      expect(revalidateMappedCandidate(
        valid,
        valueDimensions,
        { ...sourceContext, refinedCandidates: [anchor, competitor] },
        requireFoundCandidate(validAttempt),
        1,
        10,
      ), `displacement ${displacement}`).toBeNull();
    }
  });

  it("rejects a mapped candidate whose X/Y pitches differ by more than five percent", () => {
    const valueDimensions = { columns: 4, rows: 4 };
    const boundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 30);
    const sourceImage = syntheticGridImage(180, 180, boundaries, boundaries, false);
    const sourceAttempt = strictAttempt(sourceImage, valueDimensions);
    const candidate = requireFoundCandidate(sourceAttempt);
    const incompatibleCandidate = {
      ...candidate,
      horizontalBoundaries: candidate.horizontalBoundaries.map((_boundary, index) => (
        candidate.horizontalBoundaries[0]! + index * 32
      )),
    };

    expect(revalidateMappedCandidate(
      sourceImage,
      valueDimensions,
      requireSourceContext(sourceAttempt),
      incompatibleCandidate,
      1,
      30,
    )).toBeNull();
  });

  it("rejects more than 0.1-cell mapped/coarse pitch disagreement", () => {
    const valueDimensions = { columns: 4, rows: 4 };
    const boundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 30);
    const sourceImage = syntheticGridImage(180, 180, boundaries, boundaries, false);
    const sourceAttempt = strictAttempt(sourceImage, valueDimensions);

    expect(revalidateMappedCandidate(
      sourceImage,
      valueDimensions,
      requireSourceContext(sourceAttempt),
      requireFoundCandidate(sourceAttempt),
      1,
      34,
    )).toBeNull();
  });

  it("rejects weak original outer-boundary evidence", () => {
    const valueDimensions = { columns: 4, rows: 4 };
    const boundaries = Array.from({ length: 5 }, (_, index) => 20 + index * 30);
    const valid = syntheticGridImage(180, 180, boundaries, boundaries, false);
    const weak = syntheticGridImage(180, 180, boundaries.slice(1, -1), boundaries.slice(1, -1), false);
    const validAttempt = strictAttempt(valid, valueDimensions);
    const weakContext: SourceGridValidationContext = {
      profiles: buildEdgeProfiles(weak),
      refinedCandidates: requireSourceContext(validAttempt).refinedCandidates,
    };

    expect(revalidateMappedCandidate(
      weak,
      valueDimensions,
      weakContext,
      requireFoundCandidate(validAttempt),
      1,
      30,
    )).toBeNull();
  });
});
