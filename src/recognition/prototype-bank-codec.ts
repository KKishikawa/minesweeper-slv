import { FEATURE_LENGTH } from "./features.js";
import {
  CELL_LABEL_ORDER,
  validatePrototypeBank,
  type ConfidenceThresholds,
  type PrototypeBank,
} from "./prototype-bank.js";
import type { CellLabel } from "./types.js";

export interface SerializedPrototypeBank {
  readonly formatVersion: 1;
  readonly featureVersion: "features-v1";
  readonly featureLength: number;
  readonly thresholds: ConfidenceThresholds;
  readonly labels: readonly CellLabel[];
  readonly prototypeCounts: readonly number[];
  readonly centerBase64: string;
  readonly scaleBase64: string;
  readonly prototypeBase64: string;
  readonly sha256: string;
}

const SERIALIZED_KEYS = [
  "formatVersion",
  "featureVersion",
  "featureLength",
  "thresholds",
  "labels",
  "prototypeCounts",
  "centerBase64",
  "scaleBase64",
  "prototypeBase64",
  "sha256",
] as const;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FLOAT32_BYTES = 4;
const MAX_PROTOTYPES_PER_LABEL = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertSerializedShape(value: unknown): asserts value is SerializedPrototypeBank {
  if (!isRecord(value)) throw new RangeError("Serialized prototype bank must be an object.");
  const keys = Object.keys(value);
  if (keys.length !== SERIALIZED_KEYS.length || SERIALIZED_KEYS.some((key) => !keys.includes(key))) {
    throw new RangeError("Serialized prototype bank has an unexpected shape.");
  }
  if (value.formatVersion !== 1) throw new RangeError("Unsupported serialized prototype bank format version.");
  if (value.featureVersion !== "features-v1") throw new RangeError("Unsupported serialized feature version.");
  if (value.featureLength !== FEATURE_LENGTH) throw new RangeError("Serialized feature length is unsupported.");
  if (!isRecord(value.thresholds)
    || typeof value.thresholds.relativeMargin !== "number"
    || typeof value.thresholds.absoluteDistance !== "number") {
    throw new RangeError("Serialized prototype bank thresholds have an unexpected shape.");
  }
  if (!Array.isArray(value.labels) || !Array.isArray(value.prototypeCounts)
    || value.labels.length === 0 || value.labels.length !== value.prototypeCounts.length) {
    throw new RangeError("Serialized prototype labels and counts must have matching non-empty shapes.");
  }

  let previousLabelIndex = -1;
  for (let index = 0; index < value.labels.length; index += 1) {
    const labelIndex = CELL_LABEL_ORDER.indexOf(value.labels[index] as CellLabel);
    const count = value.prototypeCounts[index];
    if (labelIndex <= previousLabelIndex) {
      throw new RangeError("Serialized prototype labels must use canonical order without duplicates.");
    }
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_PROTOTYPES_PER_LABEL) {
      throw new RangeError(`Serialized prototype counts must be integers from 1 through ${MAX_PROTOTYPES_PER_LABEL}.`);
    }
    previousLabelIndex = labelIndex;
  }
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    throw new RangeError("Serialized prototype bank SHA-256 must be 64 lowercase hexadecimal characters.");
  }
}

function decodeBase64Float32(value: unknown, expectedValues: number, description: string): Float64Array {
  if (typeof value !== "string" || !BASE64_PATTERN.test(value)) {
    throw new RangeError(`${description} must be canonical base64.`);
  }

  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new RangeError(`${description} must be canonical base64.`);
  }
  if (binary.length !== expectedValues * FLOAT32_BYTES) {
    throw new RangeError(`${description} has an unexpected byte length.`);
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoded = new Float64Array(expectedValues);
  for (let index = 0; index < expectedValues; index += 1) {
    const valueAtIndex = view.getFloat32(index * FLOAT32_BYTES, true);
    if (!Number.isFinite(valueAtIndex)) throw new RangeError(`${description} must contain only finite values.`);
    decoded[index] = valueAtIndex;
  }
  return decoded;
}

export function decodePrototypeBank(serialized: SerializedPrototypeBank): PrototypeBank {
  assertSerializedShape(serialized);
  const prototypeCount = serialized.prototypeCounts.reduce((total, count) => total + count, 0);
  const center = decodeBase64Float32(serialized.centerBase64, FEATURE_LENGTH, "Serialized scaler center");
  const scale = decodeBase64Float32(serialized.scaleBase64, FEATURE_LENGTH, "Serialized scaler scale");
  const prototypeValues = decodeBase64Float32(
    serialized.prototypeBase64,
    prototypeCount * FEATURE_LENGTH,
    "Serialized prototypes",
  );

  const prototypes: PrototypeBank["prototypes"][number][] = [];
  let prototypeIndex = 0;
  for (let labelIndex = 0; labelIndex < serialized.labels.length; labelIndex += 1) {
    const label = serialized.labels[labelIndex]!;
    const count = serialized.prototypeCounts[labelIndex]!;
    for (let labelPrototypeIndex = 0; labelPrototypeIndex < count; labelPrototypeIndex += 1) {
      const offset = prototypeIndex * FEATURE_LENGTH;
      prototypes.push({ label, vector: prototypeValues.slice(offset, offset + FEATURE_LENGTH) });
      prototypeIndex += 1;
    }
  }

  const bank: PrototypeBank = {
    formatVersion: 1,
    featureVersion: "features-v1",
    thresholds: {
      relativeMargin: serialized.thresholds.relativeMargin,
      absoluteDistance: serialized.thresholds.absoluteDistance,
    },
    scaler: { center, scale },
    prototypes,
  };
  validatePrototypeBank(bank);
  return bank;
}
