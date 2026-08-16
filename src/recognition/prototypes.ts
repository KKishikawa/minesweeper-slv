import { FEATURE_LENGTH } from "./features.js";
import type { CellLabel } from "./types.js";

const VARIANCE_FLOOR = 1e-6;
const LABEL_ORDER: readonly CellLabel[] = ["closed", "empty", "flag", 1, 2, 3, 4, 5, 6, 7, 8];

export interface CellPrototype {
  readonly label: CellLabel;
  readonly mean: Float64Array;
  readonly variance: Float64Array;
}

export interface PrototypeSet {
  readonly prototypes: readonly CellPrototype[];
}

export interface LabeledFeatureSample {
  readonly label: CellLabel;
  readonly features: Float64Array;
}

function assertFeatureLength(features: Float64Array): void {
  if (features.length !== FEATURE_LENGTH) {
    throw new RangeError(`Feature vector must have ${FEATURE_LENGTH} values.`);
  }
}

export function buildPrototypeSet(samples: readonly LabeledFeatureSample[]): PrototypeSet {
  const grouped = new Map<CellLabel, LabeledFeatureSample[]>();
  for (const sample of samples) {
    assertFeatureLength(sample.features);
    const group = grouped.get(sample.label);
    if (group) group.push(sample);
    else grouped.set(sample.label, [sample]);
  }

  const prototypes: CellPrototype[] = [];
  for (const label of LABEL_ORDER) {
    const samplesForLabel = grouped.get(label);
    if (!samplesForLabel) continue;

    const mean = new Float64Array(FEATURE_LENGTH);
    for (const sample of samplesForLabel) {
      for (let index = 0; index < FEATURE_LENGTH; index += 1) {
        mean[index] = mean[index]! + sample.features[index]!;
      }
    }
    for (let index = 0; index < FEATURE_LENGTH; index += 1) mean[index] = mean[index]! / samplesForLabel.length;

    const variance = new Float64Array(FEATURE_LENGTH);
    for (const sample of samplesForLabel) {
      for (let index = 0; index < FEATURE_LENGTH; index += 1) {
        const difference = sample.features[index]! - mean[index]!;
        variance[index] = variance[index]! + difference * difference;
      }
    }
    for (let index = 0; index < FEATURE_LENGTH; index += 1) {
      variance[index] = Math.max(VARIANCE_FLOOR, variance[index]! / samplesForLabel.length);
    }
    prototypes.push({ label, mean, variance });
  }

  return { prototypes };
}
