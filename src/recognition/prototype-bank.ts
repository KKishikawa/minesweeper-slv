import { FEATURE_LENGTH } from "./features.js";
import type { CellLabel } from "./types.js";

export interface FeatureScaler {
  readonly center: Float64Array;
  readonly scale: Float64Array;
}

export interface BankPrototype {
  readonly label: CellLabel;
  readonly vector: Float64Array;
}

export interface PrototypeGeometry {
  readonly formatVersion: 1;
  readonly featureVersion: "features-v1";
  readonly scaler: FeatureScaler;
  readonly prototypes: readonly BankPrototype[];
}

export interface ConfidenceThresholds {
  readonly relativeMargin: number;
  readonly absoluteDistance: number;
}

export interface PrototypeBank extends PrototypeGeometry {
  readonly thresholds: ConfidenceThresholds;
}

export const CELL_LABEL_ORDER: readonly CellLabel[] = ["closed", "empty", "flag", 1, 2, 3, 4, 5, 6, 7, 8];

const LABEL_SET = new Set<CellLabel>(CELL_LABEL_ORDER);
const MAX_PROTOTYPES_PER_LABEL = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyFiniteValues(vector: Float64Array): boolean {
  for (const value of vector) {
    if (!Number.isFinite(value)) return false;
  }
  return true;
}

function assertFiniteVector(vector: unknown, description: string): asserts vector is Float64Array {
  if (!(vector instanceof Float64Array) || vector.length !== FEATURE_LENGTH) {
    throw new RangeError(`${description} must be a Float64Array with ${FEATURE_LENGTH} values.`);
  }
  if (!hasOnlyFiniteValues(vector)) {
    throw new RangeError(`${description} must contain only finite values.`);
  }
}

function assertLabel(label: unknown): asserts label is CellLabel {
  if (!LABEL_SET.has(label as CellLabel)) throw new RangeError("Prototype label is unsupported.");
}

function assertScaler(scaler: unknown): asserts scaler is FeatureScaler {
  if (!isRecord(scaler)) throw new RangeError("Prototype geometry requires a scaler.");
  assertFiniteVector(scaler.center, "Scaler center");
  assertFiniteVector(scaler.scale, "Scaler scale");
  for (const scale of scaler.scale) {
    if (scale <= 0) throw new RangeError("Scaler scale must be positive.");
  }
}

export function scaleFeatures(features: Float64Array, scaler: FeatureScaler): Float64Array {
  assertFiniteVector(features, "Feature vector");
  assertScaler(scaler);

  const scaled = new Float64Array(FEATURE_LENGTH);
  for (let index = 0; index < FEATURE_LENGTH; index += 1) {
    scaled[index] = (features[index]! - scaler.center[index]!) / scaler.scale[index]!;
  }
  return scaled;
}

export function validatePrototypeGeometry(geometry: PrototypeGeometry): void {
  if (!isRecord(geometry)) throw new RangeError("Prototype geometry must be an object.");
  if (geometry.formatVersion !== 1) throw new RangeError("Unsupported prototype geometry format version.");
  if (geometry.featureVersion !== "features-v1") throw new RangeError("Unsupported feature version.");
  assertScaler(geometry.scaler);
  if (!Array.isArray(geometry.prototypes) || geometry.prototypes.length === 0) {
    throw new RangeError("Prototype geometry must contain at least one prototype.");
  }

  const counts = new Map<CellLabel, number>();
  for (const prototype of geometry.prototypes) {
    if (!isRecord(prototype)) throw new RangeError("Prototype must be an object.");
    assertLabel(prototype.label);
    assertFiniteVector(prototype.vector, "Prototype vector");
    const count = (counts.get(prototype.label) ?? 0) + 1;
    if (count > MAX_PROTOTYPES_PER_LABEL) {
      throw new RangeError(`A label cannot have more than ${MAX_PROTOTYPES_PER_LABEL} prototypes.`);
    }
    counts.set(prototype.label, count);
  }
}

export function validatePrototypeBank(bank: PrototypeBank): void {
  validatePrototypeGeometry(bank);
  if (!isRecord(bank.thresholds)) throw new RangeError("Prototype bank requires confidence thresholds.");
  const { relativeMargin, absoluteDistance } = bank.thresholds;
  if (!Number.isFinite(relativeMargin) || relativeMargin < 0 || relativeMargin > 1) {
    throw new RangeError("Relative confidence margin must be between 0 and 1.");
  }
  if (!Number.isFinite(absoluteDistance) || absoluteDistance < 0) {
    throw new RangeError("Absolute confidence distance must be finite and non-negative.");
  }
}
