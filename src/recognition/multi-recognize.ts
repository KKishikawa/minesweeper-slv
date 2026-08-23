import { classifyCellWithBank } from "./multi-classify.js";
import { extractFeatures } from "./features.js";
import { cellRect, detectGrid } from "./grid.js";
import { normalizeCell } from "./normalize.js";
import { cropImage } from "./pixels.js";
import type { PrototypeBank } from "./prototype-bank.js";
import type { RecognizedCell } from "./types.js";
import type { RecognitionRequest, RecognitionResult } from "./recognize.js";

export type { RecognitionRequest, RecognitionResult } from "./recognize.js";

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function recognizeBoardWithBank(
  request: RecognitionRequest,
  bank: PrototypeBank,
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
      const classification = classifyCellWithBank(extractFeatures(normalized), bank);
      cells.push({
        index,
        label: classification.label,
        confidence: classification.relativeMargin,
        candidates: classification.candidates,
      });
      if (!classification.certain) uncertainCellIndices.push(index);
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
