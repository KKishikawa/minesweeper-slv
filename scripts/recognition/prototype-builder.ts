import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import {
  CELL_LABEL_ORDER,
  scaleFeatures,
  validatePrototypeGeometry,
  type BankPrototype,
  type FeatureScaler,
  type PrototypeGeometry,
} from "../../src/recognition/prototype-bank.js";
import type { LabeledFeatureSample } from "../../src/recognition/prototypes.js";
import type { CellLabel } from "../../src/recognition/types.js";

export interface PrototypeBuilderOptions {
  readonly maxPrototypesPerLabel: number;
  readonly iterations: number;
  readonly scaleFloor: number;
}

export const DEFAULT_PROTOTYPE_BUILDER_OPTIONS: PrototypeBuilderOptions = {
  maxPrototypesPerLabel: 12,
  iterations: 8,
  scaleFloor: 1e-6,
};

interface ScaledSample {
  readonly label: CellLabel;
  readonly vector: Float64Array;
}

const LABEL_INDEX = new Map(CELL_LABEL_ORDER.map((label, index) => [label, index]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyFiniteValues(vector: Float64Array): boolean {
  for (const value of vector) {
    if (!Number.isFinite(value)) return false;
  }
  return true;
}

function compareVectors(left: Float64Array, right: Float64Array): number {
  for (let index = 0; index < FEATURE_LENGTH; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function compareSamples(left: ScaledSample, right: ScaledSample): number {
  const labelDifference = LABEL_INDEX.get(left.label)! - LABEL_INDEX.get(right.label)!;
  return labelDifference || compareVectors(left.vector, right.vector);
}

function squaredDistance(left: Float64Array, right: Float64Array): number {
  let total = 0;
  for (let index = 0; index < FEATURE_LENGTH; index += 1) {
    const difference = left[index]! - right[index]!;
    total += difference * difference;
  }
  return total / FEATURE_LENGTH;
}

function validateOptions(options: PrototypeBuilderOptions): void {
  if (!isRecord(options)) throw new RangeError("Builder options must be an object.");
  if (!Number.isInteger(options.maxPrototypesPerLabel)
    || options.maxPrototypesPerLabel < 1
    || options.maxPrototypesPerLabel > 12) {
    throw new RangeError("maxPrototypesPerLabel must be an integer from 1 through 12.");
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 0) {
    throw new RangeError("iterations must be a non-negative integer.");
  }
  if (!Number.isFinite(options.scaleFloor) || options.scaleFloor <= 0) {
    throw new RangeError("scaleFloor must be finite and positive.");
  }
}

function validateSamples(samples: readonly LabeledFeatureSample[]): void {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new RangeError("At least one feature sample is required.");
  }
  for (const sample of samples) {
    if (!isRecord(sample)) throw new RangeError("Feature samples must be objects.");
    const { label, features } = sample as unknown as LabeledFeatureSample;
    if (!LABEL_INDEX.has(label)) throw new RangeError("Feature sample label is unsupported.");
    if (!(features instanceof Float64Array) || features.length !== FEATURE_LENGTH) {
      throw new RangeError(`Feature samples must contain ${FEATURE_LENGTH} values.`);
    }
    if (!hasOnlyFiniteValues(features)) {
      throw new RangeError("Feature samples must contain only finite values.");
    }
  }
}

function fitScaler(samples: readonly LabeledFeatureSample[], scaleFloor: number): FeatureScaler {
  const center = new Float64Array(FEATURE_LENGTH);
  for (const sample of samples) {
    for (let index = 0; index < FEATURE_LENGTH; index += 1) center[index] = center[index]! + sample.features[index]!;
  }
  for (let index = 0; index < FEATURE_LENGTH; index += 1) center[index] = center[index]! / samples.length;

  const scale = new Float64Array(FEATURE_LENGTH);
  for (const sample of samples) {
    for (let index = 0; index < FEATURE_LENGTH; index += 1) {
      const difference = sample.features[index]! - center[index]!;
      scale[index] = scale[index]! + difference * difference;
    }
  }
  for (let index = 0; index < FEATURE_LENGTH; index += 1) {
    scale[index] = Math.max(scaleFloor, Math.sqrt(scale[index]! / samples.length));
  }
  return { center, scale };
}

function initialCenters(samples: readonly ScaledSample[], count: number): Float64Array[] {
  const centers = [samples[0]!.vector];
  while (centers.length < count) {
    let selected: ScaledSample | undefined;
    let greatestDistance = 0;
    for (const sample of samples) {
      let nearest = Infinity;
      for (const center of centers) nearest = Math.min(nearest, squaredDistance(sample.vector, center));
      if (nearest > greatestDistance) {
        greatestDistance = nearest;
        selected = sample;
      }
    }
    if (!selected || greatestDistance === 0) break;
    centers.push(selected.vector);
  }
  return centers.map((center) => new Float64Array(center));
}

function refinePrototypeCenters(
  samples: readonly Float64Array[],
  centers: readonly Float64Array[],
  iterations: number,
): Float64Array[] {
  let current = centers.map((center) => new Float64Array(center));
  for (let round = 0; round < iterations; round += 1) {
    const sums = current.map(() => new Float64Array(FEATURE_LENGTH));
    const counts = current.map(() => 0);
    for (const vector of samples) {
      let nearestIndex = 0;
      let nearestDistance = squaredDistance(vector, current[0]!);
      for (let index = 1; index < current.length; index += 1) {
        const distance = squaredDistance(vector, current[index]!);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      counts[nearestIndex] = counts[nearestIndex]! + 1;
      for (let index = 0; index < FEATURE_LENGTH; index += 1) {
        sums[nearestIndex]![index] = sums[nearestIndex]![index]! + vector[index]!;
      }
    }
    current = current.map((center, cluster) => {
      const count = counts[cluster]!;
      if (count === 0) return center;
      const next = sums[cluster]!;
      for (let index = 0; index < FEATURE_LENGTH; index += 1) next[index] = next[index]! / count;
      return next;
    });
  }
  return current;
}

export function buildPrototypeGeometry(
  samples: readonly LabeledFeatureSample[],
  options: PrototypeBuilderOptions = DEFAULT_PROTOTYPE_BUILDER_OPTIONS,
): PrototypeGeometry {
  validateOptions(options);
  validateSamples(samples);

  const stableSamples = [...samples].sort((left, right) => {
    const labelDifference = LABEL_INDEX.get(left.label)! - LABEL_INDEX.get(right.label)!;
    return labelDifference || compareVectors(left.features, right.features);
  });
  const scaler = fitScaler(stableSamples, options.scaleFloor);
  const scaled = stableSamples
    .map((sample) => ({ label: sample.label, vector: scaleFeatures(sample.features, scaler) }))
    .sort(compareSamples);

  const prototypes: BankPrototype[] = [];
  for (const label of CELL_LABEL_ORDER) {
    const samplesForLabel = scaled.filter((sample) => sample.label === label);
    if (samplesForLabel.length === 0) continue;
    const centers = refinePrototypeCenters(
      samplesForLabel.map((sample) => sample.vector),
      initialCenters(samplesForLabel, Math.min(options.maxPrototypesPerLabel, samplesForLabel.length)),
      options.iterations,
    );
    for (const vector of centers) prototypes.push({ label, vector });
  }
  prototypes.sort((left, right) => compareSamples(left, right));

  const geometry: PrototypeGeometry = {
    formatVersion: 1,
    featureVersion: "features-v1",
    scaler,
    prototypes,
  };
  validatePrototypeGeometry(geometry);
  return geometry;
}
