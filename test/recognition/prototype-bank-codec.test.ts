import { describe, expect, it } from "vitest";

import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import { decodePrototypeBank } from "../../src/recognition/prototype-bank-codec.js";
import type { PrototypeBank } from "../../src/recognition/prototype-bank.js";
import { encodePrototypeBank } from "../../scripts/recognition/encode-prototype-bank.js";

function vector(seed: number): Float64Array {
  return Float64Array.from({ length: FEATURE_LENGTH }, (_value, index) => seed + index / 10_000);
}

function syntheticPrototypeBank(): PrototypeBank {
  return {
    formatVersion: 1,
    featureVersion: "features-v1",
    thresholds: { relativeMargin: 0.25, absoluteDistance: 8.5 },
    scaler: {
      center: vector(-0.75),
      scale: Float64Array.from({ length: FEATURE_LENGTH }, (_value, index) => 0.5 + index / 1_000),
    },
    prototypes: [
      { label: "closed", vector: vector(-2) },
      { label: "closed", vector: vector(-1) },
      { label: 3, vector: vector(3) },
    ],
  };
}

function replaceFloat32(base64: string, index: number, value: number): string {
  const bytes = Buffer.from(base64, "base64");
  bytes.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
  return bytes.toString("base64");
}

describe("prototype bank codec", () => {
  it("round-trips the exact serialized Float32 bank with two distinct labels", () => {
    const bank = syntheticPrototypeBank();
    const first = encodePrototypeBank(bank);
    const decoded = decodePrototypeBank(first);
    const second = encodePrototypeBank(decoded);

    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual([
      "formatVersion", "featureVersion", "featureLength", "thresholds", "labels", "prototypeCounts",
      "centerBase64", "scaleBase64", "prototypeBase64", "sha256",
    ]);
    expect(first.labels).toEqual(["closed", 3]);
    expect(first.prototypeCounts).toEqual([2, 1]);
    expect(decoded.scaler.center).toBeInstanceOf(Float64Array);
    expect(decoded.scaler.center[0]).toBe(Math.fround(bank.scaler.center[0]!));
    expect(decoded.prototypes.every((item) => item.vector instanceof Float64Array)).toBe(true);
    expect(decoded.prototypes.map((item) => item.label)).toEqual(["closed", "closed", 3]);
  });

  it("produces deterministic hashes that drift with serialized bank content", () => {
    const bank = syntheticPrototypeBank();
    const first = encodePrototypeBank(bank);
    const repeated = encodePrototypeBank(syntheticPrototypeBank());
    const changed = encodePrototypeBank({
      ...bank,
      thresholds: { ...bank.thresholds, relativeMargin: 0.3 },
    });

    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(repeated).toEqual(first);
    expect(changed.sha256).not.toBe(first.sha256);
  });

  it.each([
    ["format version", { formatVersion: 2 }],
    ["feature version", { featureVersion: "features-v2" }],
    ["feature length", { featureLength: FEATURE_LENGTH - 1 }],
    ["threshold shape", { thresholds: null }],
    ["label/count shape", { labels: ["closed", 3], prototypeCounts: [3] }],
    ["canonical label order", { labels: [3, "closed"], prototypeCounts: [1, 2] }],
    ["duplicate labels", { labels: ["closed", "closed"], prototypeCounts: [1, 2] }],
    ["zero prototype count", { prototypeCounts: [0, 1] }],
    ["oversized prototype count", { prototypeCounts: [13, 1] }],
    ["fractional prototype count", { prototypeCounts: [1.5, 1] }],
    ["center byte length", { centerBase64: "AAAAAA==" }],
    ["scale byte length", { scaleBase64: "" }],
    ["prototype byte length", { prototypeBase64: "AAAAAA==" }],
    ["hash syntax", { sha256: "not-a-sha256" }],
  ])("rejects malformed serialized %s", (_description, override) => {
    const serialized = encodePrototypeBank(syntheticPrototypeBank());
    expect(() => decodePrototypeBank({ ...serialized, ...override } as never)).toThrow(RangeError);
  });

  it("rejects non-finite decoded center, scale, and prototype values", () => {
    const serialized = encodePrototypeBank(syntheticPrototypeBank());
    for (const override of [
      { centerBase64: replaceFloat32(serialized.centerBase64, 0, Number.NaN) },
      { scaleBase64: replaceFloat32(serialized.scaleBase64, 0, Number.POSITIVE_INFINITY) },
      { prototypeBase64: replaceFloat32(serialized.prototypeBase64, 0, Number.NEGATIVE_INFINITY) },
    ]) {
      expect(() => decodePrototypeBank({ ...serialized, ...override })).toThrow(RangeError);
    }
  });

  it("rejects finite Float64 values that overflow during Float32 serialization", () => {
    const bank = syntheticPrototypeBank();
    bank.scaler.center[0] = Number.MAX_VALUE;
    expect(() => encodePrototypeBank(bank)).toThrow(RangeError);
  });
});
