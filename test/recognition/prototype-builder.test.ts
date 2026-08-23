import { describe, expect, it } from "vitest";

import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import {
  scaleFeatures,
  validatePrototypeBank,
  validatePrototypeGeometry,
  type PrototypeBank,
  type PrototypeGeometry,
} from "../../src/recognition/prototype-bank.js";
import {
  buildPrototypeGeometry,
  DEFAULT_PROTOTYPE_BUILDER_OPTIONS,
  refinePrototypeCenters,
  type PrototypeBuilderOptions,
} from "../../scripts/recognition/prototype-builder.js";
import type { CellLabel } from "../../src/recognition/types.js";

function sample(label: CellLabel, value: number) {
  return { label, features: new Float64Array(FEATURE_LENGTH).fill(value) };
}

function sampleAt(label: CellLabel, ...values: readonly number[]) {
  const features = new Float64Array(FEATURE_LENGTH);
  features.set(values);
  return { label, features };
}

function vector(value: number): Float64Array {
  const result = new Float64Array(FEATURE_LENGTH);
  result[0] = value;
  return result;
}

function geometry(): PrototypeGeometry {
  return {
    formatVersion: 1,
    featureVersion: "features-v1",
    scaler: {
      center: new Float64Array(FEATURE_LENGTH),
      scale: new Float64Array(FEATURE_LENGTH).fill(1),
    },
    prototypes: [{ label: "closed", vector: new Float64Array(FEATURE_LENGTH) }],
  };
}

function optionsWith(overrides: Partial<PrototypeBuilderOptions>): PrototypeBuilderOptions {
  return { ...options, ...overrides };
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

  it("uses the global mean, population standard deviation, and scale floor", () => {
    const result = buildPrototypeGeometry([
      sampleAt("closed", 1),
      sampleAt("empty", 3),
      sampleAt("flag", 5),
    ], optionsWith({ maxPrototypesPerLabel: 1, iterations: 0 }));

    expect(result.scaler.center[0]).toBe(3);
    expect(result.scaler.scale[0]).toBeCloseTo(Math.sqrt(8 / 3), 12);
    expect(result.scaler.scale[17]).toBe(1e-6);
    expect(scaleFeatures(sampleAt("closed", 1).features, result.scaler)[0]).toBeCloseTo(-Math.sqrt(3 / 2), 12);
  });

  it("chooses the lexicographically first farthest-point tie", () => {
    const result = buildPrototypeGeometry([
      sampleAt("closed", 0, 0),
      sampleAt("closed", 1, 1),
      sampleAt("closed", 1, -1),
    ], optionsWith({ iterations: 0 }));

    expect(result.prototypes).toHaveLength(2);
    expect(result.prototypes[1]!.vector[0]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(result.prototypes[1]!.vector[1]).toBeCloseTo(-Math.sqrt(3 / 2), 12);
  });

  it("assigns equidistant samples to the lower center index", () => {
    const result = buildPrototypeGeometry([
      sampleAt("closed", 0),
      sampleAt("closed", 1),
      sampleAt("closed", 2),
    ], optionsWith({ iterations: 1 }));

    expect(result.prototypes.map((prototype) => prototype.vector[0])).toEqual([
      -Math.sqrt(3 / 2) / 2,
      Math.sqrt(3 / 2),
    ]);
  });

  it("retains an empty cluster's previous center", () => {
    const centers = refinePrototypeCenters([vector(0), vector(0)], [vector(0), vector(10)], 1);

    expect(centers.map((center) => center[0])).toEqual([0, 10]);
  });

  it("uses exactly eight default refinement rounds", () => {
    const samples = [15, 20, 24, 28, 37, 50, 54, 65, 68, 73, 76, 77, 79, 109, 111,
      112, 117, 128, 131, 134, 136, 142, 146, 150, 154, 156, 156, 179, 186, 192]
      .map((value) => sampleAt("closed", value));
    const defaultResult = buildPrototypeGeometry(samples, {
      ...DEFAULT_PROTOTYPE_BUILDER_OPTIONS,
      maxPrototypesPerLabel: 3,
    });
    const sevenRounds = buildPrototypeGeometry(samples, optionsWith({ maxPrototypesPerLabel: 3, iterations: 7 }));
    const eightRounds = buildPrototypeGeometry(samples, optionsWith({ maxPrototypesPerLabel: 3, iterations: 8 }));
    const nineRounds = buildPrototypeGeometry(samples, optionsWith({ maxPrototypesPerLabel: 3, iterations: 9 }));

    expect(defaultResult).toEqual(eightRounds);
    expect(defaultResult).not.toEqual(sevenRounds);
    expect(defaultResult).not.toEqual(nineRounds);
  });

  it("stops before adding duplicate farthest-point centers", () => {
    const result = buildPrototypeGeometry([
      sample("closed", 4),
      sample("closed", 4),
      sample("closed", 4),
    ], optionsWith({ maxPrototypesPerLabel: 12, iterations: 0 }));

    expect(result.prototypes).toHaveLength(1);
  });

  it.each([
    ["empty sample set", []],
    ["wrong feature length", [{ label: "closed", features: new Float64Array(FEATURE_LENGTH - 1) }]],
    ["NaN feature", [sampleAt("closed", Number.NaN)]],
    ["infinite feature", [sampleAt("closed", Number.POSITIVE_INFINITY)]],
    ["unknown label", [sample("closed", 0), { label: "mine", features: new Float64Array(FEATURE_LENGTH) }]],
  ])("rejects invalid samples: %s", (_description, samples) => {
    expect(() => buildPrototypeGeometry(samples as never, options)).toThrow(RangeError);
  });

  it.each([
    ["zero prototype cap", { maxPrototypesPerLabel: 0, iterations: 1, scaleFloor: 1e-6 }],
    ["oversized prototype cap", { maxPrototypesPerLabel: 13, iterations: 1, scaleFloor: 1e-6 }],
    ["fractional prototype cap", { maxPrototypesPerLabel: 1.5, iterations: 1, scaleFloor: 1e-6 }],
    ["negative iterations", { maxPrototypesPerLabel: 1, iterations: -1, scaleFloor: 1e-6 }],
    ["fractional iterations", { maxPrototypesPerLabel: 1, iterations: 1.5, scaleFloor: 1e-6 }],
    ["zero scale floor", { maxPrototypesPerLabel: 1, iterations: 1, scaleFloor: 0 }],
    ["non-finite scale floor", { maxPrototypesPerLabel: 1, iterations: 1, scaleFloor: Number.NaN }],
  ])("rejects invalid options: %s", (_description, invalidOptions) => {
    expect(() => buildPrototypeGeometry([sample("closed", 0)], invalidOptions)).toThrow(RangeError);
  });

  it.each([
    ["unsupported format version", () => ({ ...geometry(), formatVersion: 2 })],
    ["unsupported feature version", () => ({ ...geometry(), featureVersion: "features-v2" })],
    ["non-finite center", () => ({ ...geometry(), scaler: { center: vector(Number.NaN), scale: new Float64Array(FEATURE_LENGTH).fill(1) } })],
    ["non-positive scale", () => ({ ...geometry(), scaler: { center: vector(0), scale: vector(0) } })],
    ["non-finite prototype", () => ({ ...geometry(), prototypes: [{ label: "closed", vector: vector(Number.POSITIVE_INFINITY) }] })],
    ["too many prototypes", () => ({ ...geometry(), prototypes: Array.from({ length: 13 }, () => ({ label: "closed" as const, vector: vector(0) })) })],
  ])("rejects invalid prototype geometry: %s", (_description, invalidGeometry) => {
    expect(() => validatePrototypeGeometry(invalidGeometry() as unknown as PrototypeGeometry)).toThrow(RangeError);
  });

  it.each([
    ["relative margin below zero", { relativeMargin: -Number.EPSILON, absoluteDistance: 0 }],
    ["relative margin above one", { relativeMargin: 1 + Number.EPSILON, absoluteDistance: 0 }],
    ["absolute distance below zero", { relativeMargin: 0, absoluteDistance: -Number.EPSILON }],
    ["non-finite absolute distance", { relativeMargin: 0, absoluteDistance: Number.POSITIVE_INFINITY }],
  ])("rejects confidence threshold boundaries: %s", (_description, thresholds) => {
    const bank: PrototypeBank = { ...geometry(), thresholds };
    expect(() => validatePrototypeBank(bank)).toThrow(RangeError);
  });
});
