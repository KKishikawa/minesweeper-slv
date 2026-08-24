import { detectStrictGridAttempt } from "./grid-strict.js";
import type { GridGeometry, PixelImage, Rect } from "./types.js";

export { buildEdgeProfiles, countCompatibleGridCandidatePairs } from "./grid-strict.js";
export type { GridCandidatePitchBucket } from "./grid-strict.js";

export function detectGrid(
  image: PixelImage,
  dimensions: { readonly columns: number; readonly rows: number },
): GridGeometry | null {
  const attempt = detectStrictGridAttempt(image, dimensions);
  return attempt.status === "found" ? attempt.geometry : null;
}

function roundedCellBoundary(origin: number, pitch: number, index: number): number {
  return Math.round(origin + index * pitch);
}

export function cellRect(grid: GridGeometry, column: number, row: number): Rect {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) {
    throw new RangeError("Cell coordinates are outside the grid.");
  }

  const x = roundedCellBoundary(grid.bounds.x, grid.pitchX, column);
  const y = roundedCellBoundary(grid.bounds.y, grid.pitchY, row);
  const right = roundedCellBoundary(grid.bounds.x, grid.pitchX, column + 1);
  const bottom = roundedCellBoundary(grid.bounds.y, grid.pitchY, row + 1);
  return { x, y, width: right - x, height: bottom - y };
}
