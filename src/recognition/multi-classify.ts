import { FEATURE_LENGTH } from "./features.js";
import { CELL_LABEL_ORDER, scaleFeatures, validatePrototypeBank } from "./prototype-bank.js";
import type { PrototypeBank } from "./prototype-bank.js";
import type { CellCandidate, CellLabel } from "./types.js";

export interface MultiClassificationResult {
  readonly label: CellLabel | null;
  readonly relativeMargin: number;
  readonly bestDistance: number;
  readonly certain: boolean;
  readonly candidates: readonly CellCandidate[];
}

function emptyResult(): MultiClassificationResult {
  return {
    label: null,
    relativeMargin: 0,
    bestDistance: Infinity,
    certain: false,
    candidates: [],
  };
}

function hasOnlyFiniteValues(features: Float64Array): boolean {
  for (const value of features) {
    if (!Number.isFinite(value)) return false;
  }
  return true;
}

function meanSquaredDistance(features: Float64Array, prototype: Float64Array): number {
  let total = 0;
  for (let index = 0; index < FEATURE_LENGTH; index += 1) {
    const difference = features[index]! - prototype[index]!;
    total += difference * difference;
  }
  return total / FEATURE_LENGTH;
}

function compareCandidates(first: CellCandidate, second: CellCandidate): number {
  if (first.distance !== second.distance) return first.distance - second.distance;
  return CELL_LABEL_ORDER.indexOf(first.label) - CELL_LABEL_ORDER.indexOf(second.label);
}

export function classifyCellWithBank(features: Float64Array, bank: PrototypeBank): MultiClassificationResult {
  validatePrototypeBank(bank);
  if (features.length !== FEATURE_LENGTH) {
    throw new RangeError(`Feature vector must contain exactly ${FEATURE_LENGTH} values.`);
  }
  if (!hasOnlyFiniteValues(features)) return emptyResult();

  const scaled = scaleFeatures(features, bank.scaler);
  const distancesByLabel = new Map<CellLabel, number>();
  for (const prototype of bank.prototypes) {
    const distance = meanSquaredDistance(scaled, prototype.vector);
    const previous = distancesByLabel.get(prototype.label);
    if (previous === undefined || distance < previous) distancesByLabel.set(prototype.label, distance);
  }

  const candidates = [...distancesByLabel].map(([label, distance]) => ({ label, distance })).sort(compareCandidates);
  const best = candidates[0];
  if (!best) return emptyResult();
  if (candidates.length === 1) {
    return {
      label: best.label,
      relativeMargin: 0,
      bestDistance: best.distance,
      certain: false,
      candidates,
    };
  }

  const second = candidates[1]!;
  const relativeMargin = second.distance === 0
    ? 0
    : Math.max(0, Math.min(1, 1 - best.distance / second.distance));
  return {
    label: best.label,
    relativeMargin,
    bestDistance: best.distance,
    certain: relativeMargin >= bank.thresholds.relativeMargin
      && best.distance <= bank.thresholds.absoluteDistance,
    candidates,
  };
}
