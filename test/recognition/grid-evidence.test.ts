import { describe, expect, it } from "vitest";

import {
  estimateCanonicalPitch,
  type CoarsePitchEvidence,
} from "../../src/recognition/grid-evidence.js";

function evidence(
  vertical: CoarsePitchEvidence["vertical"],
  horizontal: CoarsePitchEvidence["horizontal"],
): CoarsePitchEvidence {
  return { vertical, horizontal };
}

describe("estimateCanonicalPitch", () => {
  it("returns the score-weighted pitch of one separated family", () => {
    expect(estimateCanonicalPitch(evidence(
      [
        { pitch: 30, normalizedScore: 1, candidateCount: 4 },
        { pitch: 40, normalizedScore: 0.6, candidateCount: 1 },
      ],
      [
        { pitch: 31, normalizedScore: 1, candidateCount: 3 },
        { pitch: 40, normalizedScore: 0.6, candidateCount: 1 },
      ],
    ))).toBeCloseTo(30.5, 10);
  });

  it("accepts an X/Y pair whose pitches differ by exactly five percent", () => {
    expect(estimateCanonicalPitch(evidence(
      [{ pitch: 30, normalizedScore: 1, candidateCount: 2 }],
      [{ pitch: 31.5, normalizedScore: 0.8, candidateCount: 2 }],
    ))).toBeCloseTo((30 + 31.5 * 0.8) / 1.8, 10);
  });

  it("rejects a runner-up inside the five-percent family-score margin", () => {
    expect(estimateCanonicalPitch(evidence(
      [
        { pitch: 30, normalizedScore: 1, candidateCount: 2 },
        { pitch: 40, normalizedScore: 0.97, candidateCount: 2 },
      ],
      [
        { pitch: 30, normalizedScore: 1, candidateCount: 2 },
        { pitch: 40, normalizedScore: 0.96, candidateCount: 2 },
      ],
    ))).toBeNull();
  });

  it("does not merge a chained pitch range into one complete-link family", () => {
    expect(estimateCanonicalPitch(evidence(
      [
        { pitch: 30, normalizedScore: 1, candidateCount: 2 },
        { pitch: 31.5, normalizedScore: 0.98, candidateCount: 2 },
        { pitch: 33, normalizedScore: 0.97, candidateCount: 2 },
      ],
      [
        { pitch: 30, normalizedScore: 1, candidateCount: 2 },
        { pitch: 31.5, normalizedScore: 0.98, candidateCount: 2 },
        { pitch: 33, normalizedScore: 0.97, candidateCount: 2 },
      ],
    ))).toBeNull();
  });

  it("accepts the inclusive 30 and 50 pitch bounds", () => {
    expect(estimateCanonicalPitch(evidence(
      [{ pitch: 30, normalizedScore: 0.65, candidateCount: 1 }],
      [{ pitch: 30, normalizedScore: 0.65, candidateCount: 1 }],
    ))).toBe(30);
    expect(estimateCanonicalPitch(evidence(
      [{ pitch: 50, normalizedScore: 1, candidateCount: 1 }],
      [{ pitch: 50, normalizedScore: 1, candidateCount: 1 }],
    ))).toBe(50);
  });

  it("rejects estimates outside the canonical pitch range", () => {
    expect(estimateCanonicalPitch(evidence(
      [{ pitch: 29, normalizedScore: 1, candidateCount: 1 }],
      [{ pitch: 29, normalizedScore: 1, candidateCount: 1 }],
    ))).toBeNull();
    expect(estimateCanonicalPitch(evidence(
      [{ pitch: 51, normalizedScore: 1, candidateCount: 1 }],
      [{ pitch: 51, normalizedScore: 1, candidateCount: 1 }],
    ))).toBeNull();
  });

  it("rejects evidence with a missing axis", () => {
    expect(estimateCanonicalPitch(evidence([], [{ pitch: 30, normalizedScore: 1, candidateCount: 1 }]))).toBeNull();
    expect(estimateCanonicalPitch(evidence([{ pitch: 30, normalizedScore: 1, candidateCount: 1 }], []))).toBeNull();
  });
});
