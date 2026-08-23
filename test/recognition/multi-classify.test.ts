import { describe, expect, it } from "vitest";

import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import { classifyCellWithBank } from "../../src/recognition/multi-classify.js";
import type { BankPrototype, PrototypeBank } from "../../src/recognition/prototype-bank.js";
import type { CellLabel } from "../../src/recognition/types.js";

function feature(value: number): Float64Array {
  return new Float64Array(FEATURE_LENGTH).fill(value);
}

function prototype(label: CellLabel, value: number): BankPrototype {
  return { label, vector: feature(value) };
}

function syntheticBank(input: {
  readonly prototypes: readonly BankPrototype[];
  readonly thresholds: PrototypeBank["thresholds"];
}): PrototypeBank {
  return {
    formatVersion: 1,
    featureVersion: "features-v1",
    scaler: { center: feature(0), scale: feature(1) },
    prototypes: input.prototypes,
    thresholds: input.thresholds,
  };
}

describe("classifyCellWithBank", () => {
  it("ranks distinct labels instead of sibling prototypes", () => {
    const bank = syntheticBank({
      prototypes: [prototype("flag", 0), prototype("flag", 0.1), prototype(3, 2)],
      thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
    });
    const result = classifyCellWithBank(new Float64Array(FEATURE_LENGTH), bank);
    expect(result.candidates.map((item) => item.label)).toEqual(["flag", 3]);
  });

  it("requires both the label margin and absolute distance", () => {
    const ambiguous = classifyCellWithBank(feature(0.49), syntheticBank({
      prototypes: [prototype(1, 0), prototype(2, 1)],
      thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
    }));
    const far = classifyCellWithBank(feature(100), syntheticBank({
      prototypes: [prototype(1, 0), prototype(2, 20)],
      thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
    }));
    expect(ambiguous.certain).toBe(false);
    expect(far.certain).toBe(false);
  });

  it("returns an uncertain null result for non-finite features", () => {
    const result = classifyCellWithBank(feature(Number.NaN), syntheticBank({
      prototypes: [prototype(1, 0), prototype(2, 1)],
      thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
    }));
    expect(result).toMatchObject({ label: null, certain: false, candidates: [] });
    expect(result.relativeMargin).toBe(0);
    expect(result.bestDistance).toBe(Infinity);
  });

  it("rejects a wrong-length feature vector even when it contains a non-finite value", () => {
    const features = new Float64Array(FEATURE_LENGTH - 1).fill(Number.NaN);

    expect(() => classifyCellWithBank(features, syntheticBank({
      prototypes: [prototype(1, 0), prototype(2, 1)],
      thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
    }))).toThrow(RangeError);
  });

  it("orders equal-distance labels by the stable cell-label order", () => {
    const result = classifyCellWithBank(feature(1), syntheticBank({
      prototypes: [prototype(3, 0), prototype("flag", 2)],
      thresholds: { relativeMargin: 0, absoluteDistance: 10 },
    }));

    expect(result.candidates.map((item) => item.label)).toEqual(["flag", 3]);
  });

  it("marks a single distinct label as uncertain with no margin", () => {
    const result = classifyCellWithBank(feature(1), syntheticBank({
      prototypes: [prototype("closed", 0), prototype("closed", 2)],
      thresholds: { relativeMargin: 0, absoluteDistance: 10 },
    }));

    expect(result).toMatchObject({ label: "closed", relativeMargin: 0, certain: false });
  });
});
