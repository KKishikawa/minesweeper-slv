import { selectThresholdPair, type CalibrationCase, type ThresholdPair } from "./calibrate.js";
import { encodePrototypeBank } from "./encode-prototype-bank.js";
import { buildPrototypeGeometry } from "./prototype-builder.js";
import { decodePrototypeBank } from "../../src/recognition/prototype-bank-codec.js";
import { CELL_LABEL_ORDER, type PrototypeBank } from "../../src/recognition/prototype-bank.js";
import { recognizeBoardWithBank } from "../../src/recognition/multi-recognize.js";
import type { CellLabel } from "../../src/recognition/types.js";
import {
  deriveBrowserImages,
  type BrowserDerivedImage,
  type BrowserEngine,
} from "../../test/recognition/browser-derive.js";
import type { FixtureCase } from "../../test/recognition/fixture-manifest.js";
import { buildFixtureSamples } from "../../test/recognition/samples.js";

export interface FoldCaseResult {
  readonly id: string;
  readonly kind: "source" | "transformed";
  readonly correctCells: number;
  readonly wrongCertainCells: number;
  readonly uncertainCells: number;
  readonly elapsedMs: number;
}

export interface FoldResult {
  readonly heldOutFixtureId: FixtureCase["id"];
  readonly trainingFixtureIds: readonly FixtureCase["id"][];
  readonly calibrationFixtureIds: readonly FixtureCase["id"][];
  readonly absentTrainingLabels: readonly CellLabel[];
  readonly prototypeCounts: readonly number[];
  readonly thresholds: ThresholdPair | null;
  readonly evaluationCases: readonly FoldCaseResult[];
  readonly passes: boolean;
}

interface EvaluatedFoldCase {
  readonly gridFound: boolean;
  readonly result: FoldCaseResult;
}

const PERMISSIVE_THRESHOLDS: ThresholdPair = {
  relativeMargin: 0,
  absoluteDistance: Number.MAX_VALUE,
};

function caseId(fixture: FixtureCase, derived: BrowserDerivedImage): string {
  return `${fixture.id}:${derived.name}`;
}

function caseKind(derived: BrowserDerivedImage): FoldCaseResult["kind"] {
  return derived.name === "source" ? "source" : "transformed";
}

function calibrationCase(
  fixture: FixtureCase,
  derived: BrowserDerivedImage,
  geometryBank: PrototypeBank,
): CalibrationCase | null {
  const recognition = recognizeBoardWithBank({
    image: derived.image,
    columns: fixture.columns,
    rows: fixture.rows,
  }, geometryBank);
  if (recognition.status === "grid-not-found" || recognition.cells.length !== fixture.expectedCells.length) return null;

  const cells: CalibrationCase["cells"][number][] = [];
  for (const cell of recognition.cells) {
    const bestDistance = cell.candidates[0]?.distance;
    if (bestDistance === undefined || !Number.isFinite(bestDistance)) return null;
    cells.push({
      correct: cell.label === fixture.expectedCells[cell.index],
      relativeMargin: cell.confidence,
      bestDistance,
    });
  }
  return { id: caseId(fixture, derived), kind: caseKind(derived), cells };
}

function evaluateCase(
  fixture: FixtureCase,
  derived: BrowserDerivedImage,
  bank: PrototypeBank,
  hasThresholds: boolean,
): EvaluatedFoldCase {
  const recognition = recognizeBoardWithBank({
    image: derived.image,
    columns: fixture.columns,
    rows: fixture.rows,
  }, bank);
  if (recognition.status === "grid-not-found" || recognition.cells.length !== fixture.expectedCells.length) {
    return {
      gridFound: false,
      result: {
        id: caseId(fixture, derived),
        kind: caseKind(derived),
        correctCells: 0,
        wrongCertainCells: 0,
        uncertainCells: fixture.expectedCells.length,
        elapsedMs: recognition.elapsedMs,
      },
    };
  }

  if (!hasThresholds) {
    return {
      gridFound: true,
      result: {
        id: caseId(fixture, derived),
        kind: caseKind(derived),
        correctCells: 0,
        wrongCertainCells: 0,
        uncertainCells: fixture.expectedCells.length,
        elapsedMs: recognition.elapsedMs,
      },
    };
  }

  const uncertainIndices = new Set(recognition.uncertainCellIndices);
  let correctCells = 0;
  let wrongCertainCells = 0;
  for (const cell of recognition.cells) {
    if (uncertainIndices.has(cell.index)) continue;
    if (cell.label === fixture.expectedCells[cell.index]) correctCells += 1;
    else wrongCertainCells += 1;
  }
  return {
    gridFound: true,
    result: {
      id: caseId(fixture, derived),
      kind: caseKind(derived),
      correctCells,
      wrongCertainCells,
      uncertainCells: recognition.uncertainCellIndices.length,
      elapsedMs: recognition.elapsedMs,
    },
  };
}

export async function evaluateLeaveOneScreenOut(
  fixtures: readonly FixtureCase[],
  engine: BrowserEngine,
): Promise<readonly FoldResult[]> {
  const samples = await buildFixtureSamples(fixtures);
  const derivativesByFixture = new Map<FixtureCase["id"], readonly BrowserDerivedImage[]>();
  for (const fixture of fixtures) {
    derivativesByFixture.set(fixture.id, await deriveBrowserImages(engine, fixture.imagePath));
  }

  const results: FoldResult[] = [];
  for (const heldOutFixture of fixtures) {
    const trainingFixtures = fixtures.filter((fixture) => fixture.id !== heldOutFixture.id);
    const trainingFixtureIds = trainingFixtures.map((fixture) => fixture.id);
    const trainingSamples = samples.filter((sample) => sample.fixtureId !== heldOutFixture.id);
    const trainingLabels = new Set(trainingSamples.map((sample) => sample.label));
    const absentTrainingLabels = CELL_LABEL_ORDER.filter((label) => !trainingLabels.has(label));
    const geometry = buildPrototypeGeometry(trainingSamples);
    const geometryBank = decodePrototypeBank(encodePrototypeBank({
      ...geometry,
      thresholds: PERMISSIVE_THRESHOLDS,
    }));
    const prototypeCounts = encodePrototypeBank(geometryBank).prototypeCounts;

    const calibrationCases: CalibrationCase[] = [];
    let calibrationComplete = true;
    for (const fixture of trainingFixtures) {
      for (const derived of derivativesByFixture.get(fixture.id) ?? []) {
        const calibration = calibrationCase(fixture, derived, geometryBank);
        if (calibration === null) calibrationComplete = false;
        else calibrationCases.push(calibration);
      }
    }
    const thresholds = calibrationComplete && calibrationCases.length === trainingFixtures.length * 4
      ? selectThresholdPair(calibrationCases)
      : null;
    const thresholdedBank: PrototypeBank = thresholds === null
      ? geometryBank
      : { ...geometryBank, thresholds };

    const evaluatedCases = (derivativesByFixture.get(heldOutFixture.id) ?? [])
      .map((derived) => evaluateCase(heldOutFixture, derived, thresholdedBank, thresholds !== null));
    const evaluationCases = evaluatedCases.map((evaluation) => evaluation.result);
    const passes = thresholds !== null
      && evaluatedCases.length === 4
      && evaluatedCases.every((evaluation) => evaluation.gridFound
        && evaluation.result.wrongCertainCells === 0
        && evaluation.result.uncertainCells <= 4);
    results.push({
      heldOutFixtureId: heldOutFixture.id,
      trainingFixtureIds,
      calibrationFixtureIds: trainingFixtureIds,
      absentTrainingLabels,
      prototypeCounts,
      thresholds,
      evaluationCases,
      passes,
    });
  }
  return results;
}
