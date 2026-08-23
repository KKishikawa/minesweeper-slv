export interface ThresholdPair {
  readonly relativeMargin: number;
  readonly absoluteDistance: number;
}

export interface CalibrationCell {
  readonly correct: boolean;
  readonly relativeMargin: number;
  readonly bestDistance: number;
}

export interface CalibrationCase {
  readonly id: string;
  readonly kind: "source" | "transformed";
  readonly cells: readonly CalibrationCell[];
}

export const RELATIVE_MARGIN_CANDIDATES = [
  0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95,
] as const;

export const ABSOLUTE_DISTANCE_CANDIDATES = [
  0.015625, 0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024,
] as const;

export interface ThresholdEvaluation extends ThresholdPair {
  readonly wrongCertainCells: number;
  readonly uncertainSourceCells: number;
  readonly totalUncertainCells: number;
  readonly maximumUncertainCells: number;
  readonly passes: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateThresholdPair(value: unknown): asserts value is ThresholdPair {
  if (!isRecord(value)
    || typeof value.relativeMargin !== "number"
    || !Number.isFinite(value.relativeMargin)
    || value.relativeMargin < 0
    || value.relativeMargin > 1
    || typeof value.absoluteDistance !== "number"
    || !Number.isFinite(value.absoluteDistance)
    || value.absoluteDistance < 0) {
    throw new RangeError("Threshold pairs require finite relative margins in [0, 1] and non-negative distances.");
  }
}

function validateCalibrationCell(value: unknown): asserts value is CalibrationCell {
  if (!isRecord(value)
    || typeof value.correct !== "boolean"
    || typeof value.relativeMargin !== "number"
    || !Number.isFinite(value.relativeMargin)
    || value.relativeMargin < 0
    || value.relativeMargin > 1
    || typeof value.bestDistance !== "number"
    || !Number.isFinite(value.bestDistance)
    || value.bestDistance < 0) {
    throw new RangeError("Calibration cells require a boolean truth value and finite non-negative distances.");
  }
}

function validateCalibrationCases(value: unknown): asserts value is readonly CalibrationCase[] {
  if (!Array.isArray(value)) throw new RangeError("Calibration cases must be an array.");
  for (const calibrationCase of value) {
    if (!isRecord(calibrationCase)
      || typeof calibrationCase.id !== "string"
      || calibrationCase.id.trim().length === 0
      || (calibrationCase.kind !== "source" && calibrationCase.kind !== "transformed")
      || !Array.isArray(calibrationCase.cells)
      || calibrationCase.cells.length === 0) {
      throw new RangeError("Calibration cases require a non-empty id, supported kind, and cells.");
    }
    for (const cell of calibrationCase.cells) validateCalibrationCell(cell);
  }
}

function validateThresholdPairs(value: unknown): asserts value is readonly ThresholdPair[] {
  if (!Array.isArray(value)) throw new RangeError("Threshold pairs must be an array.");
  for (const pair of value) validateThresholdPair(pair);
}

function fixedThresholdPairs(): readonly ThresholdPair[] {
  const pairs: ThresholdPair[] = [];
  for (const relativeMargin of RELATIVE_MARGIN_CANDIDATES) {
    for (const absoluteDistance of ABSOLUTE_DISTANCE_CANDIDATES) {
      pairs.push({ relativeMargin, absoluteDistance });
    }
  }
  return pairs;
}

export function evaluateThresholdPairs(
  cases: readonly CalibrationCase[],
  pairs: readonly ThresholdPair[] = fixedThresholdPairs(),
): readonly ThresholdEvaluation[] {
  validateCalibrationCases(cases);
  validateThresholdPairs(pairs);

  return pairs.map((pair) => {
    let wrongCertainCells = 0;
    let uncertainSourceCells = 0;
    let totalUncertainCells = 0;
    let maximumUncertainCells = 0;

    for (const calibrationCase of cases) {
      let uncertainCells = 0;
      for (const cell of calibrationCase.cells) {
        const certain = cell.relativeMargin >= pair.relativeMargin
          && cell.bestDistance <= pair.absoluteDistance;
        if (!certain) {
          uncertainCells += 1;
          totalUncertainCells += 1;
          if (calibrationCase.kind === "source") uncertainSourceCells += 1;
        } else if (!cell.correct) {
          wrongCertainCells += 1;
        }
      }
      if (calibrationCase.kind === "transformed") {
        maximumUncertainCells = Math.max(maximumUncertainCells, uncertainCells);
      }
    }

    return {
      relativeMargin: pair.relativeMargin,
      absoluteDistance: pair.absoluteDistance,
      wrongCertainCells,
      uncertainSourceCells,
      totalUncertainCells,
      maximumUncertainCells,
      passes: wrongCertainCells === 0
        && uncertainSourceCells === 0
        && maximumUncertainCells <= 4,
    };
  });
}

export function selectThresholdPair(
  cases: readonly CalibrationCase[],
  pairs: readonly ThresholdPair[] = fixedThresholdPairs(),
): ThresholdPair | null {
  const passing = evaluateThresholdPairs(cases, pairs)
    .filter((evaluation) => evaluation.passes)
    .map((evaluation, index) => ({ evaluation, index }));
  passing.sort((first, second) => {
    const firstEvaluation = first.evaluation;
    const secondEvaluation = second.evaluation;
    return firstEvaluation.maximumUncertainCells - secondEvaluation.maximumUncertainCells
      || firstEvaluation.totalUncertainCells - secondEvaluation.totalUncertainCells
      || firstEvaluation.relativeMargin - secondEvaluation.relativeMargin
      || secondEvaluation.absoluteDistance - firstEvaluation.absoluteDistance
      || first.index - second.index;
  });
  const selected = passing[0]?.evaluation;
  return selected === undefined
    ? null
    : { relativeMargin: selected.relativeMargin, absoluteDistance: selected.absoluteDistance };
}
