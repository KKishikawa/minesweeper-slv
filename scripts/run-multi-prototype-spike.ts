import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildFinalBankCandidate } from "./recognition/generate-prototype-bank.js";
import { encodePrototypeBank } from "./recognition/encode-prototype-bank.js";
import { evaluateLeaveOneScreenOut, type FoldResult } from "./recognition/evaluate-folds.js";
import { recreateArtifactDirectory } from "./artifact-directory.js";
import { recognizeBoardWithBank } from "../src/recognition/multi-recognize.js";
import type { PrototypeBank } from "../src/recognition/prototype-bank.js";
import type { GridGeometry, PixelImage } from "../src/recognition/types.js";
import { deriveBrowserImages } from "../test/recognition/browser-derive.js";
import { deriveImages } from "../test/recognition/derive.js";
import { loadFixtureCases, type FixtureCase } from "../test/recognition/fixture-manifest.js";
import { renderOverlay } from "../test/recognition/overlay.js";

export interface EngineCaseMeasurement {
  readonly id: string;
  readonly kind: "source" | "transformed";
  readonly gridFound: boolean;
  readonly wrongCertainCells: number;
  readonly uncertainCells: number;
  readonly elapsedMs: number;
}

export interface EngineSummary {
  readonly engine: "chromium" | "firefox" | "webkit" | "sharp";
  readonly formalPassed: boolean;
  readonly compatibility: "guaranteed" | "limited" | "not-guaranteed" | "not-run";
}

export interface AdoptionSummary {
  readonly decision: "multi-prototype-adopted" | "multi-prototype-rejected";
  readonly formalPassed: boolean;
}

export type SpikeProgressStage =
  | "candidate:start"
  | "candidate:complete"
  | "folds:start"
  | "folds:complete"
  | "artifacts:start"
  | "artifacts:complete";

interface EvaluatedEngine {
  readonly summary: EngineSummary;
  readonly cases: readonly EngineCaseMeasurement[];
  readonly versions: readonly string[];
  readonly error?: string;
}

interface DerivedEvaluationImage {
  readonly name: string;
  readonly image: PixelImage;
  readonly version?: string;
}

interface ElapsedSummary {
  readonly min: number | null;
  readonly median: number | null;
  readonly max: number | null;
}

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const artifactParts = ["test", "artifacts", "recognition"] as const;

function caseWithinFormalBudget(measurement: EngineCaseMeasurement): boolean {
  return measurement.gridFound
    && measurement.wrongCertainCells === 0
    && (measurement.kind === "source"
      ? measurement.uncertainCells === 0
      : measurement.uncertainCells <= 4);
}

export function summarizeEngine(
  engine: EngineSummary["engine"],
  cases: readonly EngineCaseMeasurement[],
): EngineSummary {
  if (cases.length === 0) {
    return { engine, formalPassed: false, compatibility: "not-run" };
  }

  const hasHardFailure = cases.some((measurement) => (
    !measurement.gridFound || measurement.wrongCertainCells !== 0
  ));
  const withinBudget = cases.every(caseWithinFormalBudget);
  return {
    engine,
    formalPassed: engine === "chromium" && withinBudget,
    compatibility: hasHardFailure
      ? "not-guaranteed"
      : withinBudget ? "guaranteed" : "limited",
  };
}

export function summarizeAdoption(
  hasBank: boolean,
  chromiumCases: readonly EngineCaseMeasurement[],
  foldPasses: readonly boolean[],
): AdoptionSummary {
  const formalPassed = hasBank
    && chromiumCases.length === 16
    && summarizeEngine("chromium", chromiumCases).formalPassed
    && foldPasses.length === 4
    && foldPasses.every(Boolean);
  return {
    decision: formalPassed ? "multi-prototype-adopted" : "multi-prototype-rejected",
    formalPassed,
  };
}

export function reportProgress(
  stage: SpikeProgressStage,
  write: (line: string) => void = (line) => console.error(line),
): void {
  write(`[multi-prototype-spike] ${stage}`);
}

function elapsedSummary(values: readonly number[]): ElapsedSummary {
  if (values.length === 0) return { min: null, median: null, max: null };
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  return { min: sorted[0]!, median, max: sorted.at(-1)! };
}

function artifactPath(artifactDirectory: string, ...parts: readonly string[]): string {
  const resolved = path.resolve(artifactDirectory, ...parts);
  const relative = path.relative(artifactDirectory, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside recognition artifacts: ${resolved}`);
  }
  return resolved;
}

async function writeJson(artifactDirectory: string, parts: readonly string[], value: unknown): Promise<void> {
  const outputPath = artifactPath(artifactDirectory, ...parts);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fallbackGeometry(image: PixelImage, fixture: FixtureCase): GridGeometry {
  return {
    bounds: { x: 0, y: 0, width: image.width, height: image.height },
    columns: fixture.columns,
    rows: fixture.rows,
    pitchX: image.width / fixture.columns,
    pitchY: image.height / fixture.rows,
    score: 0,
  };
}

async function evaluateImage(
  engine: EngineSummary["engine"],
  fixture: FixtureCase,
  derived: DerivedEvaluationImage,
  bank: PrototypeBank,
  artifactDirectory: string,
): Promise<EngineCaseMeasurement> {
  const result = recognizeBoardWithBank({
    image: derived.image,
    columns: fixture.columns,
    rows: fixture.rows,
  }, bank);
  const gridFound = result.status !== "grid-not-found" && result.cells.length === fixture.expectedCells.length;
  const uncertain = new Set(result.uncertainCellIndices);
  const wrongCertainCells = gridFound
    ? result.cells.filter((cell) => !uncertain.has(cell.index) && cell.label !== fixture.expectedCells[cell.index]).length
    : 0;
  const measurement: EngineCaseMeasurement = {
    id: `${fixture.id}:${derived.name}`,
    kind: derived.name === "source" ? "source" : "transformed",
    gridFound,
    wrongCertainCells,
    uncertainCells: gridFound ? result.uncertainCellIndices.length : fixture.expectedCells.length,
    elapsedMs: result.elapsedMs,
  };
  const stem = `${fixture.id}-${derived.name}`;
  await writeJson(artifactDirectory, ["engines", engine, `${stem}.json`], {
    ...measurement,
    status: result.status,
    geometry: result.geometry,
    labels: result.cells.map((cell) => cell.label),
    uncertainCellIndices: result.uncertainCellIndices,
    expectedLabels: fixture.expectedCells,
  });
  const overlayPath = artifactPath(artifactDirectory, "engines", engine, `${stem}.png`);
  await mkdir(path.dirname(overlayPath), { recursive: true });
  await renderOverlay(
    derived.image,
    result.geometry ?? fallbackGeometry(derived.image, fixture),
    result.cells,
    overlayPath,
  );
  return measurement;
}

async function derivedImages(
  engine: EngineSummary["engine"],
  fixture: FixtureCase,
): Promise<readonly DerivedEvaluationImage[]> {
  if (engine === "sharp") {
    return (await deriveImages(fixture.imagePath)).map((derived) => ({
      name: derived.name,
      image: derived.image,
    }));
  }
  return (await deriveBrowserImages(engine, fixture.imagePath)).map((derived) => ({
    name: derived.name,
    image: derived.image,
    version: derived.browserVersion,
  }));
}

async function evaluateEngine(
  engine: EngineSummary["engine"],
  fixtures: readonly FixtureCase[],
  bank: PrototypeBank,
  artifactDirectory: string,
): Promise<EvaluatedEngine> {
  const cases: EngineCaseMeasurement[] = [];
  const versions = new Set<string>();
  try {
    for (const fixture of fixtures) {
      for (const derived of await derivedImages(engine, fixture)) {
        if (derived.version !== undefined) versions.add(derived.version);
        cases.push(await evaluateImage(engine, fixture, derived, bank, artifactDirectory));
      }
    }
    return { summary: summarizeEngine(engine, cases), cases, versions: [...versions].sort() };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const failureCase: EngineCaseMeasurement = {
      id: `${engine}:evaluation-error`,
      kind: "source",
      gridFound: false,
      wrongCertainCells: 0,
      uncertainCells: 480,
      elapsedMs: 0,
    };
    return {
      summary: summarizeEngine(engine, [...cases, failureCase]),
      cases: [...cases, failureCase],
      versions: [...versions].sort(),
      error: message,
    };
  }
}

function notRunEngine(engine: EngineSummary["engine"]): EvaluatedEngine {
  return { summary: summarizeEngine(engine, []), cases: [], versions: [] };
}

function foldElapsedValues(folds: readonly FoldResult[]): readonly number[] {
  return folds.flatMap((fold) => fold.evaluationCases.map((evaluation) => evaluation.elapsedMs));
}

function hashSummary(summary: unknown): string {
  return createHash("sha256").update(JSON.stringify(summary)).digest("hex");
}

export async function main(): Promise<number> {
  const startedAt = Date.now();
  const artifactDirectory = await recreateArtifactDirectory(repositoryRoot, artifactParts);
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
    readonly devDependencies?: Readonly<Record<string, string>>;
  };
  const fixtures = await loadFixtureCases();

  reportProgress("candidate:start");
  const candidateStartedAt = Date.now();
  const candidate = await buildFinalBankCandidate();
  const candidateElapsedMs = Date.now() - candidateStartedAt;
  reportProgress("candidate:complete");
  const serializedGeometry = encodePrototypeBank({
    ...candidate.geometry,
    thresholds: { relativeMargin: 0, absoluteDistance: Number.MAX_VALUE },
  });

  reportProgress("folds:start");
  const foldsStartedAt = Date.now();
  const folds = await evaluateLeaveOneScreenOut(fixtures, "chromium");
  const foldsElapsedMs = Date.now() - foldsStartedAt;
  reportProgress("folds:complete");

  const engineNames = ["chromium", "firefox", "webkit", "sharp"] as const;
  const engines: EvaluatedEngine[] = [];
  if (candidate.bank === null) {
    engines.push(...engineNames.map(notRunEngine));
  } else {
    for (const engine of engineNames) {
      engines.push(await evaluateEngine(engine, fixtures, candidate.bank, artifactDirectory));
    }
  }

  const chromiumCases = engines.find((engine) => engine.summary.engine === "chromium")?.cases ?? [];
  const adoption = summarizeAdoption(
    candidate.bank !== null,
    chromiumCases,
    folds.map((fold) => fold.passes),
  );
  const allMeasuredElapsed = engines.flatMap((engine) => engine.cases.map((measurement) => measurement.elapsedMs));
  const measuredElapsed = allMeasuredElapsed.length === 0 ? foldElapsedValues(folds) : allMeasuredElapsed;
  const summary = {
    decision: adoption.decision,
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      dependencyRanges: {
        playwright: packageJson.devDependencies?.playwright ?? null,
        sharp: packageJson.devDependencies?.sharp ?? null,
      },
      engineVersions: Object.fromEntries(engines.map((engine) => [engine.summary.engine, engine.versions])),
    },
    candidate: {
      status: candidate.bank === null ? "rejected" : "thresholded",
      bankHash: candidate.bank === null ? null : encodePrototypeBank(candidate.bank).sha256,
      prototypeCounts: serializedGeometry.prototypeCounts,
      thresholds: candidate.thresholds,
      calibration: {
        evaluatedThresholdPairs: candidate.calibration.length,
        passingThresholdPairs: candidate.calibration.filter((evaluation) => evaluation.passes).length,
      },
      elapsedMs: candidateElapsedMs,
    },
    chromiumFormal: {
      passed: adoption.formalPassed,
      candidateCases: candidate.evaluationCases,
      evaluatedCases: chromiumCases,
    },
    wholeScreenHoldout: {
      passed: folds.length === 4 && folds.every((fold) => fold.passes),
      folds,
      elapsedMs: foldsElapsedMs,
    },
    compatibility: Object.fromEntries(engines.map((engine) => [engine.summary.engine, {
      ...engine.summary,
      cases: engine.cases,
      versions: engine.versions,
      ...(engine.error === undefined ? {} : { error: engine.error }),
    }])),
    performance: {
      caseElapsedMs: elapsedSummary(measuredElapsed),
      totalElapsedMs: Date.now() - startedAt,
    },
    coverage: {
      digits7And8: "unsupported",
      playwrightWebKit: "compatibility proxy; not Safari",
    },
  };
  reportProgress("artifacts:start");
  await writeJson(artifactDirectory, ["candidate.json"], {
    status: summary.candidate.status,
    prototypeCounts: summary.candidate.prototypeCounts,
    thresholds: summary.candidate.thresholds,
    calibration: candidate.calibration,
    evaluationCases: candidate.evaluationCases,
  });
  await writeJson(artifactDirectory, ["folds.json"], folds);
  await writeJson(artifactDirectory, ["engines.json"], summary.compatibility);
  await writeJson(artifactDirectory, ["summary.json"], {
    ...summary,
    evidenceHash: hashSummary(summary),
  });
  reportProgress("artifacts:complete");
  console.log(JSON.stringify({
    decision: adoption.decision,
    summaryPath: artifactPath(artifactDirectory, "summary.json"),
  }, null, 2));
  return adoption.formalPassed ? 0 : 1;
}

const currentModulePath = process.argv[1];
if (currentModulePath !== undefined && import.meta.url === pathToFileURL(path.resolve(currentModulePath)).href) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
    process.exitCode = 1;
  });
}
