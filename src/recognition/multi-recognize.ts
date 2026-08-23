import { classifyCellWithBank } from "./multi-classify.js";
import { extractFeatures } from "./features.js";
import { cellRect, detectGrid } from "./grid.js";
import { normalizeCell } from "./normalize.js";
import { cropImage } from "./pixels.js";
import { validatePrototypeBank, type PrototypeBank } from "./prototype-bank.js";
import type { RecognizedCell } from "./types.js";
import type { PixelImage } from "./types.js";
import type { RecognitionRequest, RecognitionResult } from "./recognize.js";

export type { RecognitionRequest, RecognitionResult } from "./recognize.js";

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validateImage(image: PixelImage): void {
  if (!isPositiveInteger(image.width) || !isPositiveInteger(image.height)) {
    throw new RangeError("Image dimensions must be positive integers.");
  }
  if (!(image.data instanceof Uint8ClampedArray)
    || image.data.length !== image.width * image.height * 4) {
    throw new RangeError("Image data must contain one RGBA pixel per image coordinate.");
  }
}

export function recognizeBoardWithBank(
  request: RecognitionRequest,
  bank: PrototypeBank,
): RecognitionResult {
  if (!isPositiveInteger(request.columns) || !isPositiveInteger(request.rows)) {
    throw new RangeError("Board dimensions must be positive integers.");
  }
  validateImage(request.image);
  validatePrototypeBank(bank);

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
