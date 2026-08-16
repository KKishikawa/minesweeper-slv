import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { CellLabel, Rect } from "../../src/recognition/types.js";

const fixtureIds = ["0", "1", "2", "3"] as const;
const symbolLabels: Readonly<Record<string, CellLabel>> = {
  "#": "closed",
  ".": "empty",
  F: "flag",
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
};
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

interface GroundTruthFile {
  readonly image: `test/resources/${"0.png" | "1.png" | "2.png" | "3.jpg"}`;
  readonly columns: 30;
  readonly rows: 16;
  readonly totalMines: 99;
  readonly expectedRemainingMines: number;
  readonly expectedBoardBounds: Rect;
  readonly board: readonly string[];
}

export interface FixtureCase {
  readonly id: "0" | "1" | "2" | "3";
  readonly imagePath: string;
  readonly columns: 30;
  readonly rows: 16;
  readonly totalMines: 99;
  readonly expectedRemainingMines: number;
  readonly expectedBoardBounds: Rect;
  readonly expectedCells: readonly CellLabel[];
}

function parseBoard(board: readonly string[]): readonly CellLabel[] {
  if (board.length !== 16) {
    throw new Error(`Ground truth board must contain 16 rows, received ${board.length}.`);
  }

  return board.flatMap((row, rowIndex) => {
    if (row.length !== 30) {
      throw new Error(`Ground truth row ${rowIndex} must contain 30 cells, received ${row.length}.`);
    }
    return [...row].map((symbol, columnIndex) => {
      const label = symbolLabels[symbol];
      if (label === undefined) {
        throw new Error(`Unknown ground truth symbol ${JSON.stringify(symbol)} at row ${rowIndex}, column ${columnIndex}.`);
      }
      return label;
    });
  });
}

async function loadGroundTruth(id: FixtureCase["id"]): Promise<GroundTruthFile> {
  const source = await readFile(path.join(repositoryRoot, "test", "recognition", "ground-truth", `${id}.json`), "utf8");
  return JSON.parse(source) as GroundTruthFile;
}

export async function loadFixtureCases(): Promise<readonly FixtureCase[]> {
  return Promise.all(fixtureIds.map(async (id) => {
    const truth = await loadGroundTruth(id);
    return {
      id,
      imagePath: path.join(repositoryRoot, truth.image),
      columns: truth.columns,
      rows: truth.rows,
      totalMines: truth.totalMines,
      expectedRemainingMines: truth.expectedRemainingMines,
      expectedBoardBounds: truth.expectedBoardBounds,
      expectedCells: parseBoard(truth.board),
    };
  }));
}
