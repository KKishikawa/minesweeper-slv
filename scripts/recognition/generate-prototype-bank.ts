import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  evaluateThresholdPairs,
  selectThresholdPair,
  type CalibrationCase,
  type ThresholdEvaluation,
  type ThresholdPair,
} from "./calibrate.js";
import { encodePrototypeBank } from "./encode-prototype-bank.js";
import { buildPrototypeGeometry } from "./prototype-builder.js";
import { decodePrototypeBank } from "../../src/recognition/prototype-bank-codec.js";
import type { SerializedPrototypeBank } from "../../src/recognition/prototype-bank-codec.js";
import type { PrototypeBank, PrototypeGeometry } from "../../src/recognition/prototype-bank.js";
import { recognizeBoardWithBank } from "../../src/recognition/multi-recognize.js";
import type { RecognitionResult } from "../../src/recognition/multi-recognize.js";
import type { CellCandidate, CellLabel, GridGeometry } from "../../src/recognition/types.js";
import { deriveBrowserImages, type BrowserDerivedImage } from "../../test/recognition/browser-derive.js";
import { loadFixtureCases, type FixtureCase } from "../../test/recognition/fixture-manifest.js";
import { buildFixtureSamples } from "../../test/recognition/samples.js";

export interface FinalCaseEvaluation {
  readonly id: string;
  readonly kind: "source" | "transformed";
  readonly gridFound: boolean;
  readonly correctCells: number;
  readonly wrongCertainCells: number;
  readonly uncertainCells: number;
  readonly elapsedMs: number;
  readonly browserVersion: string;
  readonly derivative: {
    readonly scale: number;
    readonly encoding: BrowserDerivedImage["encoding"];
    readonly width: number;
    readonly height: number;
    readonly rgbaSha256: string;
    readonly browserVersion: string;
  };
  readonly geometry: GridGeometry | null;
  readonly cells: readonly {
    readonly index: number;
    readonly label: CellLabel | null;
    readonly expectedLabel: CellLabel;
    readonly confidence: number;
    readonly candidates: readonly CellCandidate[];
    readonly uncertain: boolean;
    readonly correct: boolean;
  }[];
}

export interface FinalBankCandidate {
  readonly geometry: PrototypeGeometry;
  readonly calibration: readonly ThresholdEvaluation[];
  readonly evaluationCases: readonly FinalCaseEvaluation[];
  readonly thresholds: ThresholdPair | null;
  readonly bank: PrototypeBank | null;
  readonly chromiumVersion: string;
}

export class NoPassingThresholdError extends Error {
  override readonly name = "NoPassingThresholdError";

  constructor(readonly candidate: FinalBankCandidate) {
    super("No threshold pair passes the final Chromium acceptance cases.");
  }
}

interface BuiltFinalBankEvaluation {
  readonly candidate: FinalBankCandidate;
  readonly evaluationCases: readonly FinalCaseEvaluation[];
}

interface CollectedFormalCase {
  readonly calibration: CalibrationCase | null;
  readonly fixture: FixtureCase;
  readonly derived: BrowserDerivedImage;
  readonly recognition: RecognitionResult;
}

const PERMISSIVE_THRESHOLDS: ThresholdPair = {
  relativeMargin: 0,
  absoluteDistance: Number.MAX_VALUE,
};

function caseId(fixture: FixtureCase, derived: BrowserDerivedImage): string {
  return `${fixture.id}:${derived.name}`;
}

function caseKind(derived: BrowserDerivedImage): CalibrationCase["kind"] {
  return derived.name === "source" ? "source" : "transformed";
}

function buildCalibrationCase(
  fixture: FixtureCase,
  derived: BrowserDerivedImage,
  bank: PrototypeBank,
): CollectedFormalCase {
  const recognition = recognizeBoardWithBank({
    image: derived.image,
    columns: fixture.columns,
    rows: fixture.rows,
  }, bank);
  if (recognition.status === "grid-not-found" || recognition.cells.length !== fixture.expectedCells.length) {
    return {
      calibration: null,
      fixture,
      derived,
      recognition,
    };
  }

  const cells: CalibrationCase["cells"][number][] = [];
  for (const cell of recognition.cells) {
    const bestDistance = cell.candidates[0]?.distance;
    if (bestDistance === undefined || !Number.isFinite(bestDistance)) {
      return {
        calibration: null,
        fixture,
        derived,
        recognition,
      };
    }
    cells.push({
      correct: cell.label === fixture.expectedCells[cell.index],
      relativeMargin: cell.confidence,
      bestDistance,
    });
  }
  const calibration = { id: caseId(fixture, derived), kind: caseKind(derived), cells };
  return {
    calibration,
    fixture,
    derived,
    recognition,
  };
}

function evaluateCase(
  formalCase: CollectedFormalCase,
  thresholds: ThresholdPair | null,
): FinalCaseEvaluation {
  const { fixture, derived, recognition, calibration } = formalCase;
  let correctCells = 0;
  let wrongCertainCells = 0;
  let uncertainCells = 0;
  const cells = recognition.cells.map((recognizedCell, index) => {
    const calibrationCell = calibration?.cells[index];
    const certain = thresholds !== null && calibrationCell !== undefined
      && calibrationCell.relativeMargin >= thresholds.relativeMargin
      && calibrationCell.bestDistance <= thresholds.absoluteDistance;
    const correct = recognizedCell.label === fixture.expectedCells[recognizedCell.index];
    if (!certain) uncertainCells += 1;
    else if (correct) correctCells += 1;
    else wrongCertainCells += 1;
    return {
      index: recognizedCell.index,
      label: recognizedCell.label,
      expectedLabel: fixture.expectedCells[recognizedCell.index]!,
      confidence: recognizedCell.confidence,
      candidates: recognizedCell.candidates,
      uncertain: !certain,
      correct,
    };
  });
  const gridFound = recognition.status !== "grid-not-found"
    && recognition.cells.length === fixture.expectedCells.length;
  if (!gridFound) uncertainCells = fixture.expectedCells.length;
  return {
    id: caseId(fixture, derived),
    kind: caseKind(derived),
    gridFound,
    correctCells,
    wrongCertainCells,
    uncertainCells,
    elapsedMs: recognition.elapsedMs,
    browserVersion: derived.browserVersion,
    derivative: {
      scale: derived.scale,
      encoding: derived.encoding,
      width: derived.image.width,
      height: derived.image.height,
      rgbaSha256: createHash("sha256").update(derived.image.data).digest("hex"),
      browserVersion: derived.browserVersion,
    },
    geometry: recognition.geometry,
    cells,
  };
}

function geometryFromBank(bank: PrototypeBank): PrototypeGeometry {
  return {
    formatVersion: bank.formatVersion,
    featureVersion: bank.featureVersion,
    scaler: bank.scaler,
    prototypes: bank.prototypes,
  };
}

async function buildFinalBankEvaluation(): Promise<BuiltFinalBankEvaluation> {
  const fixtures = await loadFixtureCases();
  const samples = await buildFixtureSamples(fixtures);
  const fittedGeometry = buildPrototypeGeometry(samples);
  const roundTrippedBank = decodePrototypeBank(encodePrototypeBank({
    ...fittedGeometry,
    thresholds: PERMISSIVE_THRESHOLDS,
  }));
  const geometry = geometryFromBank(roundTrippedBank);

  const formalCases: CollectedFormalCase[] = [];
  const chromiumVersions = new Set<string>();
  for (const fixture of fixtures) {
    const derivedImages = await deriveBrowserImages("chromium", fixture.imagePath);
    for (const derived of derivedImages) {
      chromiumVersions.add(derived.browserVersion);
      formalCases.push(buildCalibrationCase(fixture, derived, roundTrippedBank));
    }
  }
  if (formalCases.length !== fixtures.length * 4) {
    throw new Error(`Expected ${fixtures.length * 4} formal Chromium cases, received ${formalCases.length}.`);
  }

  const calibrationCases = formalCases.flatMap((formalCase) => formalCase.calibration === null
    ? []
    : [formalCase.calibration]);
  const calibration = evaluateThresholdPairs(calibrationCases);
  const selectedThresholds = selectThresholdPair(calibrationCases);
  const thresholds = calibrationCases.length === formalCases.length ? selectedThresholds : null;
  const bank = thresholds === null ? null : { ...geometry, thresholds };
  const evaluationCases = formalCases.map((formalCase) => evaluateCase(formalCase, thresholds));
  return {
    candidate: {
      geometry,
      calibration,
      evaluationCases,
      thresholds,
      bank,
      chromiumVersion: [...chromiumVersions].sort().join(","),
    },
    evaluationCases,
  };
}

export async function buildFinalBankCandidate(): Promise<FinalBankCandidate> {
  return (await buildFinalBankEvaluation()).candidate;
}

function renderGeneratedModule(serialized: SerializedPrototypeBank): string {
  return [
    'import { decodePrototypeBank } from "../prototype-bank-codec.js";',
    'import type { SerializedPrototypeBank } from "../prototype-bank-codec.js";',
    "",
    `export const SERIALIZED_PROTOTYPE_BANK = ${JSON.stringify(serialized, null, 2)} as const satisfies SerializedPrototypeBank;`,
    "",
    "export const GENERATED_PROTOTYPE_BANK = decodePrototypeBank(SERIALIZED_PROTOTYPE_BANK);",
    "",
  ].join("\n");
}

export async function generatePrototypeBank(
  options: { readonly outputPath: string },
): Promise<SerializedPrototypeBank> {
  const candidate = await buildFinalBankCandidate();
  if (candidate.bank === null) {
    throw new NoPassingThresholdError(candidate);
  }

  const serialized = encodePrototypeBank(candidate.bank);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, renderGeneratedModule(serialized), "utf8");
  return serialized;
}

async function main(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? join(
    "test",
    "artifacts",
    "recognition",
    "final-prototype-bank.ts",
  ));
  const serialized = await generatePrototypeBank({ outputPath });
  console.log(JSON.stringify({ outputPath, serialized }, null, 2));
}

const currentModulePath = process.argv[1];
if (currentModulePath !== undefined && import.meta.url === pathToFileURL(resolve(currentModulePath)).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
    process.exitCode = 1;
  });
}
