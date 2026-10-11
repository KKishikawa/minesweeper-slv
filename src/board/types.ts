export type CellValue = 'closed' | 'flag' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface BoardCell {
  readonly value: CellValue;
  readonly source: 'manual' | 'recognition';
  readonly uncertain: boolean;
}
export interface BoardSnapshot {
  readonly width: number;
  readonly height: number;
  readonly totalMines: number;
  readonly revision: number;
  readonly cells: readonly BoardCell[];
}
export type ValidationResult =
  | { status: 'valid' }
  | { status: 'needs-review'; reason: 'uncertain' | 'dimensions'; cells: number[] }
  | { status: 'inconsistent'; reason: 'settings' | 'local' | 'total'; cells: number[] };
