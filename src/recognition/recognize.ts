import { classifyCell } from "./classify.js";
import { extractFeatures } from "./features.js";
import { cellRect, detectGrid } from "./grid.js";
import { normalizeCell } from "./normalize.js";
import { cropImage } from "./pixels.js";
import type { PrototypeSet } from "./prototypes.js";
import type { GridGeometry, PixelImage, RecognizedCell } from "./types.js";

export interface RecognitionRequest {
  readonly image: PixelImage;
  readonly columns: number;
  readonly rows: number;
}

export interface RecognitionResult {
  readonly status: "recognized" | "needs-review" | "grid-not-found";
  readonly geometry: GridGeometry | null;
  readonly cells: readonly RecognizedCell[];
  readonly uncertainCellIndices: readonly number[];
  readonly elapsedMs: number;
}

export interface ConfidenceCalibrationCell {
  readonly confidence: number;
  readonly correct: boolean;
}

export interface ConfidenceCalibrationCase {
  readonly kind: "source" | "derivative";
  readonly cells: readonly ConfidenceCalibrationCell[];
}

export interface ConfidenceThresholdEvaluation {
  readonly threshold: number;
  readonly sourceHighConfidenceErrors: number;
  readonly sourceUncertainCells: number;
  readonly derivativeHighConfidenceErrors: number;
  readonly maximumDerivativeUncertainCells: number;
  readonly derivativeUncertainCells: number;
  readonly passesMandatory: boolean;
}

export const SHARED_CONFIDENCE_THRESHOLDS = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50] as const;

// No candidate passed the complete fixture-suite calibration. Keep runtime
// recognition on the lowest candidate so raising the threshold cannot hide
// the mandatory failure; the offline runner records the selected value as null.
export const RECOGNITION_CONFIDENCE_THRESHOLD = SHARED_CONFIDENCE_THRESHOLDS[0];

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function confidenceCounts(
  cells: readonly ConfidenceCalibrationCell[],
  threshold: number,
): { readonly highConfidenceErrors: number; readonly uncertainCells: number } {
  let highConfidenceErrors = 0;
  let uncertainCells = 0;
  for (const cell of cells) {
    if (cell.confidence < threshold) uncertainCells += 1;
    else if (!cell.correct) highConfidenceErrors += 1;
  }
  return { highConfidenceErrors, uncertainCells };
}

export function evaluateConfidenceThresholds(
  cases: readonly ConfidenceCalibrationCase[],
): readonly ConfidenceThresholdEvaluation[] {
  return SHARED_CONFIDENCE_THRESHOLDS.map((threshold) => {
    let sourceHighConfidenceErrors = 0;
    let sourceUncertainCells = 0;
    let derivativeHighConfidenceErrors = 0;
    let derivativeUncertainCells = 0;
    let maximumDerivativeUncertainCells = 0;

    for (const calibrationCase of cases) {
      const counts = confidenceCounts(calibrationCase.cells, threshold);
      if (calibrationCase.kind === "source") {
        sourceHighConfidenceErrors += counts.highConfidenceErrors;
        sourceUncertainCells += counts.uncertainCells;
      } else {
        derivativeHighConfidenceErrors += counts.highConfidenceErrors;
        derivativeUncertainCells += counts.uncertainCells;
        maximumDerivativeUncertainCells = Math.max(maximumDerivativeUncertainCells, counts.uncertainCells);
      }
    }

    return {
      threshold,
      sourceHighConfidenceErrors,
      sourceUncertainCells,
      derivativeHighConfidenceErrors,
      maximumDerivativeUncertainCells,
      derivativeUncertainCells,
      passesMandatory: sourceHighConfidenceErrors === 0
        && sourceUncertainCells === 0
        && derivativeHighConfidenceErrors === 0
        && maximumDerivativeUncertainCells <= 4,
    };
  });
}

export function selectSharedConfidenceThreshold(
  cases: readonly ConfidenceCalibrationCase[],
): number | null {
  return evaluateConfidenceThresholds(cases).find((evaluation) => evaluation.passesMandatory)?.threshold ?? null;
}

export function recognizeBoard(
  request: RecognitionRequest,
  prototypes: PrototypeSet,
): RecognitionResult {
  if (!isPositiveInteger(request.columns) || !isPositiveInteger(request.rows)) {
    throw new RangeError("Board dimensions must be positive integers.");
  }

  const startedAt = performance.now();
  const geometry = detectGrid(request.image, request);
  if (!geometry) {
    return {
      status: "grid-not-found",
      geometry: null,
      cells: [],
      uncertainCellIndices: [],
      elapsedMs: performance.now() - startedAt,
    };
  }

  const cells: RecognizedCell[] = [];
  const uncertainCellIndices: number[] = [];
  for (let row = 0; row < request.rows; row += 1) {
    for (let column = 0; column < request.columns; column += 1) {
      const index = row * request.columns + column;
      const normalized = normalizeCell(cropImage(request.image, cellRect(geometry, column, row)));
      const classification = classifyCell(extractFeatures(normalized), prototypes);
      const candidates = [...classification.candidates].sort((first, second) => first.distance - second.distance);
      cells.push({
        index,
        label: classification.label,
        confidence: classification.confidence,
        candidates,
      });
      if (classification.confidence < RECOGNITION_CONFIDENCE_THRESHOLD) uncertainCellIndices.push(index);
    }
  }

  return {
    status: uncertainCellIndices.length === 0 ? "recognized" : "needs-review",
    geometry,
    cells,
    uncertainCellIndices,
    elapsedMs: performance.now() - startedAt,
  };
}
