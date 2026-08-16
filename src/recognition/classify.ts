import { FEATURE_LENGTH } from "./features.js";
import type { PrototypeSet } from "./prototypes.js";
import type { CellCandidate, CellLabel } from "./types.js";

export interface ClassificationResult {
  readonly label: CellLabel;
  readonly confidence: number;
  readonly candidates: readonly [CellCandidate, CellCandidate];
}

function normalizedSquaredDistance(features: Float64Array, mean: Float64Array, variance: Float64Array): number {
  let total = 0;
  for (let index = 0; index < FEATURE_LENGTH; index += 1) {
    const difference = features[index]! - mean[index]!;
    total += (difference * difference) / variance[index]!;
  }
  return total / FEATURE_LENGTH;
}

export function classifyCell(features: Float64Array, prototypes: PrototypeSet): ClassificationResult {
  if (features.length !== FEATURE_LENGTH) {
    throw new RangeError(`Feature vector must have ${FEATURE_LENGTH} values.`);
  }
  if (prototypes.prototypes.length < 2) {
    throw new RangeError("Classification requires at least two prototypes.");
  }

  const candidates = prototypes.prototypes.map((prototype): CellCandidate => {
    if (prototype.mean.length !== FEATURE_LENGTH || prototype.variance.length !== FEATURE_LENGTH) {
      throw new RangeError(`Prototype ${String(prototype.label)} has an invalid feature length.`);
    }
    return {
      label: prototype.label,
      distance: normalizedSquaredDistance(features, prototype.mean, prototype.variance),
    };
  }).sort((first, second) => first.distance - second.distance);
  const best = candidates[0]!;
  const second = candidates[1]!;
  const confidence = second.distance === 0
    ? 1
    : Math.max(0, Math.min(1, 1 - best.distance / second.distance));

  return {
    label: best.label,
    confidence,
    candidates: [best, second],
  };
}
