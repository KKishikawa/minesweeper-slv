import { describe, expect, it } from "vitest";

import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import {
  validatePrototypeGeometry,
  type PrototypeGeometry,
} from "../../src/recognition/prototype-bank.js";
import {
  buildPrototypeGeometry,
  type PrototypeBuilderOptions,
} from "../../scripts/recognition/prototype-builder.js";
import type { CellLabel } from "../../src/recognition/types.js";

function sample(label: CellLabel, value: number) {
  return { label, features: new Float64Array(FEATURE_LENGTH).fill(value) };
}

const options: PrototypeBuilderOptions = {
  maxPrototypesPerLabel: 2,
  iterations: 4,
  scaleFloor: 1e-6,
};

describe("multi-prototype builder", () => {
  it("is deterministic across input order and caps each label", () => {
    const samples = [sample("closed", 0), sample("closed", 1), sample("closed", 9), sample("flag", 20)];
    const first = buildPrototypeGeometry(samples, options);
    const reversed = buildPrototypeGeometry([...samples].reverse(), options);
    expect(first).toEqual(reversed);
    expect(first.prototypes.filter((item) => item.label === "closed")).toHaveLength(2);
    expect(first.prototypes.filter((item) => item.label === "flag")).toHaveLength(1);
    expect(first.prototypes.some((item) => item.label === 7 || item.label === 8)).toBe(false);
  });

  it("fits one finite global scaler for every label", () => {
    const result = buildPrototypeGeometry([sample("empty", 2), sample(1, 4)], options);
    expect(result.scaler.center).toHaveLength(FEATURE_LENGTH);
    expect(result.scaler.scale).toHaveLength(FEATURE_LENGTH);
    expect([...result.scaler.scale].every((value) => Number.isFinite(value) && value >= 1e-6)).toBe(true);
    expect(result.prototypes.flatMap((item) => [...item.vector]).every(Number.isFinite)).toBe(true);
  });

  it("rejects malformed geometry with a validation error", () => {
    const malformed = {
      formatVersion: 1,
      featureVersion: "features-v1",
      prototypes: [],
    } as unknown as PrototypeGeometry;

    expect(() => validatePrototypeGeometry(malformed)).toThrow(RangeError);
  });

  it("rejects malformed builder options with a range error", () => {
    expect(() => buildPrototypeGeometry([sample("closed", 0)], null as unknown as PrototypeBuilderOptions))
      .toThrow(RangeError);
  });
});
