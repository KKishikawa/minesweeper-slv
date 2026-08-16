export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GridGeometry {
  readonly bounds: Rect;
  readonly columns: number;
  readonly rows: number;
  readonly pitchX: number;
  readonly pitchY: number;
  readonly score: number;
}

export type CellLabel = "closed" | "empty" | "flag" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface CellCandidate {
  readonly label: CellLabel;
  readonly distance: number;
}

export interface RecognizedCell {
  readonly index: number;
  readonly label: CellLabel;
  readonly confidence: number;
  readonly candidates: readonly CellCandidate[];
}
