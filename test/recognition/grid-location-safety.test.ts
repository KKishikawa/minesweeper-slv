import { describe, expect, it } from "vitest";
import { assessGridLocationSafety, type GridBoundaryCandidate, type RefinedGridCandidate } from "../../src/recognition/grid-strict.js";

const image = { width: 400, height: 400 };
const dimensions = { columns: 4, rows: 4 };
const proposed: GridBoundaryCandidate = {
  verticalBoundaries: [20, 40, 60, 80, 100],
  horizontalBoundaries: [20, 40, 60, 80, 100],
  rangeScore: 100,
};
function shifted(offset: number, overrides: Partial<RefinedGridCandidate> = {}): RefinedGridCandidate {
  const boundaries = [20, 40, 60, 80, 100].map((value) => value + offset);
  return {
    candidate: { vertical: { origin: 0, pitch: 17, score: 0 }, horizontal: { origin: 1, pitch: 23, score: 0 }, score: 0 },
    verticalBoundaries: boundaries,
    horizontalBoundaries: boundaries,
    duplicateHorizontalBoundaries: [],
    canonicalVerticalBoundaries: boundaries,
    canonicalHorizontalBoundaries: boundaries,
    intersectionSupportRatio: 0.9,
    leadingIntersectionSupportRatio: 0,
    outerBoundaryDistinctiveness: 0,
    outerBoundaryBalance: 0,
    minimumOuterBoundaryEnergyRatio: 1.3,
    localRangeScore: 0,
    rangeScore: 0,
    ...overrides,
  };
}
const assess = (candidate: RefinedGridCandidate) => assessGridLocationSafety(image, dimensions, proposed, [candidate]);
const invalid = (candidateIndex: number | null) => ({ status: "conflict", reason: "invalid-evidence", candidateIndex, maximumBoundaryDifference: null });

describe("assessGridLocationSafety", () => {
  it.each([
    [4, {}, { status: "safe" }],
    [5, {}, { status: "conflict", reason: "competing-location", candidateIndex: 0, maximumBoundaryDifference: 5 }],
    [5, { intersectionSupportRatio: 0.899 }, { status: "safe" }],
    [5, { minimumOuterBoundaryEnergyRatio: 1.299 }, { status: "safe" }],
  ] as const)("assesses offset %s with absolute support %j", (offset, overrides, expected) => {
    expect(assess(shifted(offset, overrides))).toEqual(expected);
  });
  it.each(["canonicalVerticalBoundaries", "canonicalHorizontalBoundaries"] as const)("detects a five-pixel difference on %s alone", (axis) => {
    expect(assess(shifted(0, { [axis]: [25, 45, 65, 85, 105] }))).toMatchObject({ reason: "competing-location", maximumBoundaryDifference: 5 });
  });
  it("detects a separate board irrespective of weak score, phase, and distinctiveness", () => {
    expect(assess(shifted(150))).toMatchObject({ reason: "competing-location", maximumBoundaryDifference: 150 });
  });
  it("returns the first conflict in either order and accepts duplicate colocated candidates", () => {
    const near = shifted(4);
    const far = shifted(5);
    expect(assessGridLocationSafety(image, dimensions, proposed, [near, far, far])).toMatchObject({ candidateIndex: 1 });
    expect(assessGridLocationSafety(image, dimensions, proposed, [far, near])).toMatchObject({ candidateIndex: 0 });
    expect(assessGridLocationSafety(image, dimensions, proposed, [near, near])).toEqual({ status: "safe" });
  });
  it.each([
    [19, "conflict"],
    [18.99, "safe"],
  ] as const)("compares endpoint pitch %s to proposed pitch 20", (pitch, status) => {
    const boundaries = [30, 30 + pitch, 30 + pitch * 2, 30 + pitch * 3, 30 + pitch * 4];
    expect(assess(shifted(0, { canonicalVerticalBoundaries: boundaries, canonicalHorizontalBoundaries: boundaries })).status).toBe(status);
  });
  it("ignores candidates whose two endpoint pitches differ by more than five percent", () => {
    expect(assess(shifted(5, { canonicalHorizontalBoundaries: [25, 43, 61, 79, 97] }))).toEqual({ status: "safe" });
  });
  it("uses endpoint pitch instead of the candidate integer pitch", () => {
    expect(assess(shifted(5))).toMatchObject({ reason: "competing-location" });
  });
  it.each([
    [20, 40, 60, 80],
    [20, 40, 40, 80, 100],
    [20, 60, 40, 80, 100],
    [-1, 40, 60, 80, 100],
    [20, 40, 60, 80, 400],
    [20, 40, Number.NaN, 80, 100],
    [20, 40, 60, 80, Number.POSITIVE_INFINITY],
  ])("rejects invalid candidate canonical boundaries %j", (...boundaries) => {
    expect(assess(shifted(0, { canonicalVerticalBoundaries: boundaries }))).toEqual(invalid(0));
    expect(assess(shifted(0, { canonicalHorizontalBoundaries: boundaries }))).toEqual(invalid(0));
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects nonfinite absolute support %s", (value) => {
    expect(assess(shifted(0, { intersectionSupportRatio: value }))).toEqual(invalid(0));
    expect(assess(shifted(0, { minimumOuterBoundaryEnergyRatio: value }))).toEqual(invalid(0));
  });
  it("validates proposed boundaries even with no candidates", () => {
    expect(assessGridLocationSafety(image, dimensions, { ...proposed, verticalBoundaries: [20, 40, 60, 80] }, [])).toEqual(invalid(null));
    expect(assessGridLocationSafety(image, dimensions, { ...proposed, horizontalBoundaries: [20, 40, 60, 80, Number.NaN] }, [])).toEqual(invalid(null));
  });
  it.each([
    { columns: 0, rows: 4 }, { columns: 4.5, rows: 4 }, { columns: 4, rows: Number.NaN }, { columns: 4, rows: 3 },
  ])("rejects invalid dimensions %j", (size) => {
    expect(assessGridLocationSafety(image, size, proposed, [])).toEqual(invalid(null));
  });
  it.each([{ width: 0, height: 400 }, { width: 400, height: Number.NaN }, { width: 400.5, height: 400 }])("rejects invalid image dimensions %j", (size) => {
    expect(assessGridLocationSafety(size, dimensions, proposed, [])).toEqual(invalid(null));
  });
  it("accepts an empty candidate set with valid proposed evidence", () => {
    expect(assessGridLocationSafety(image, dimensions, proposed, [])).toEqual({ status: "safe" });
  });
  it("does not mutate the proposed boundaries or candidate collection", () => {
    const candidates = [shifted(4), shifted(5)];
    const before = structuredClone({ proposed, candidates });
    assessGridLocationSafety(image, dimensions, proposed, candidates);
    expect({ proposed, candidates }).toEqual(before);
  });
});
