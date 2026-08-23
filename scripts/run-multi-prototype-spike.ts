import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildFinalBankCandidate, type FinalCaseEvaluation } from "./recognition/generate-prototype-bank.js";
import { encodePrototypeBank } from "./recognition/encode-prototype-bank.js";
import { evaluateLeaveOneScreenOut, type FoldResult } from "./recognition/evaluate-folds.js";
import { recreateArtifactDirectory } from "./artifact-directory.js";
import { recognizeBoardWithBank } from "../src/recognition/multi-recognize.js";
import type { PrototypeBank } from "../src/recognition/prototype-bank.js";
import type { SerializedPrototypeBank } from "../src/recognition/prototype-bank-codec.js";
import type { CellLabel, GridGeometry, PixelImage, RecognizedCell } from "../src/recognition/types.js";
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

export interface EvaluatedEngine {
  readonly summary: EngineSummary;
  readonly cases: readonly EngineCaseMeasurement[];
  readonly versions: readonly string[];
  readonly error?: string;
}

export interface DerivedEvaluationImage {
  readonly name: string;
  readonly image: PixelImage;
  readonly version?: string;
  readonly scale: number;
  readonly encoding: string;
}

export interface MeasuredEngineCase {
  readonly measurement: EngineCaseMeasurement;
  readonly persist: () => Promise<void>;
}

export interface EvaluateEngineOverrides {
  readonly deriveImages?: (
    engine: EngineSummary["engine"],
    fixture: FixtureCase,
  ) => Promise<readonly DerivedEvaluationImage[]>;
  readonly measureImage?: (
    engine: EngineSummary["engine"],
    fixture: FixtureCase,
    derived: DerivedEvaluationImage,
    bank: PrototypeBank,
    artifactDirectory: string,
  ) => Promise<MeasuredEngineCase>;
}

interface ElapsedSummary {
  readonly min: number | null;
  readonly median: number | null;
  readonly max: number | null;
}

export interface CandidateEvidence {
  readonly bank: PrototypeBank | null;
  readonly serializedBank: SerializedPrototypeBank | null;
  readonly prototypeLabels: readonly CellLabel[];
  readonly prototypeCounts: readonly number[];
  readonly thresholds: PrototypeBank["thresholds"] | null;
  readonly calibration: readonly { readonly passes: boolean }[];
  readonly evaluationCases: readonly FinalCaseEvaluation[];
  readonly chromiumVersion: string;
  readonly elapsedMs: number;
}

export interface SpikeEnvironment {
  readonly node: string;
  readonly platform: string;
  readonly architecture: string;
  readonly dependencyVersions: {
    readonly playwright: string | null;
    readonly sharp: string | null;
  };
}

type CompatibilityEvidence = EngineSummary & {
  readonly cases: readonly EngineCaseMeasurement[];
  readonly versions: readonly string[];
  readonly error?: string;
};

export interface SpikeSummary {
  readonly decision: AdoptionSummary["decision"];
  readonly environment: SpikeEnvironment & {
    readonly chromiumVersion: string;
    readonly engineVersions: Readonly<Record<EngineSummary["engine"], readonly string[]>>;
  };
  readonly candidate: {
    readonly status: "rejected" | "thresholded";
    readonly bankHash: string | null;
    readonly prototypeLabels: readonly CellLabel[];
    readonly prototypeCounts: readonly number[];
    readonly thresholds: PrototypeBank["thresholds"] | null;
    readonly calibration: {
      readonly evaluatedThresholdPairs: number;
      readonly passingThresholdPairs: number;
    };
    readonly elapsedMs: number;
  };
  readonly chromiumFormal: {
    readonly passed: boolean;
    readonly candidateCases: readonly FinalCaseEvaluation[];
    readonly evaluatedCases: readonly EngineCaseMeasurement[];
  };
  readonly wholeScreenHoldout: {
    readonly passed: boolean;
    readonly folds: readonly FoldResult[];
    readonly elapsedMs: number | null;
  };
  readonly compatibility: Readonly<Record<EngineSummary["engine"], CompatibilityEvidence>>;
  readonly performance: {
    readonly caseElapsedMs: ElapsedSummary;
    readonly candidateCaseElapsedMs: ElapsedSummary;
    readonly foldCaseElapsedMs: ElapsedSummary;
    readonly engineCaseElapsedMs: ElapsedSummary;
    readonly totalElapsedMs: number;
  };
  readonly coverage: {
    readonly digits7And8: "unsupported";
    readonly playwrightWebKit: "compatibility proxy; not Safari";
  };
}

export interface SpikeRunDependencies {
  readonly buildCandidate: () => Promise<CandidateEvidence>;
  readonly evaluateFolds: () => Promise<readonly FoldResult[]>;
  readonly evaluateEngines: (bank: PrototypeBank) => Promise<readonly EvaluatedEngine[]>;
  readonly environment: SpikeEnvironment;
  readonly writeArtifact: (relativePath: string, value: unknown) => Promise<void>;
  readonly writeReport: (summary: SpikeSummary) => Promise<void>;
  readonly progress: (stage: SpikeProgressStage) => void;
  readonly now: () => number;
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
  expectedCaseIds: readonly string[],
): EngineSummary {
  const hasHardFailure = cases.some((measurement) => (
    !measurement.gridFound || measurement.wrongCertainCells !== 0
  ));
  const actualIds = new Set(cases.map((measurement) => measurement.id));
  const expectedIds = new Set(expectedCaseIds);
  const complete = actualIds.size === cases.length
    && expectedIds.size === expectedCaseIds.length
    && cases.length === expectedCaseIds.length
    && expectedCaseIds.every((id) => actualIds.has(id));
  const withinBudget = cases.every(caseWithinFormalBudget);
  return {
    engine,
    formalPassed: engine === "chromium" && complete && withinBudget,
    compatibility: hasHardFailure
      ? "not-guaranteed"
      : complete && withinBudget ? "guaranteed" : "limited",
  };
}

export function summarizeAdoption(
  hasBank: boolean,
  chromiumCases: readonly EngineCaseMeasurement[],
  foldPasses: readonly boolean[],
  expectedChromiumCaseIds: readonly string[],
): AdoptionSummary {
  const formalPassed = hasBank
    && chromiumCases.length === 16
    && summarizeEngine("chromium", chromiumCases, expectedChromiumCaseIds).formalPassed
    && foldPasses.length === 4
    && foldPasses.every(Boolean);
  return {
    decision: formalPassed ? "multi-prototype-adopted" : "multi-prototype-rejected",
    formalPassed,
  };
}

export function summarizeInterruptedEngine(
  engine: EngineSummary["engine"],
  cases: readonly EngineCaseMeasurement[],
  expectedCaseIds: readonly string[],
  versions: readonly string[],
  error: string,
): EvaluatedEngine {
  return {
    summary: summarizeEngine(engine, cases, expectedCaseIds),
    cases,
    versions,
    error,
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
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

export function createAtomicArtifactWriter(
  artifactDirectory: string,
): SpikeRunDependencies["writeArtifact"] {
  return async (relativePath, value) => {
    await writeJson(artifactDirectory, relativePath.split("/"), value);
  };
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

export function serializeCaseCells(
  cells: readonly RecognizedCell[],
  expectedLabels: readonly CellLabel[],
  uncertainCellIndices: readonly number[],
): readonly unknown[] {
  const uncertain = new Set(uncertainCellIndices);
  return cells.map((cell) => {
    const expectedLabel = expectedLabels[cell.index] ?? null;
    return {
      index: cell.index,
      label: cell.label,
      expectedLabel,
      confidence: cell.confidence,
      candidates: cell.candidates,
      uncertain: uncertain.has(cell.index),
      correct: cell.label === expectedLabel,
    };
  });
}

export function describeDerivativeArtifact(derived: DerivedEvaluationImage): {
  readonly scale: number;
  readonly encoding: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaSha256: string;
} {
  return {
    scale: derived.scale,
    encoding: derived.encoding,
    width: derived.image.width,
    height: derived.image.height,
    rgbaSha256: createHash("sha256").update(derived.image.data).digest("hex"),
  };
}

async function measureImage(
  engine: EngineSummary["engine"],
  fixture: FixtureCase,
  derived: DerivedEvaluationImage,
  bank: PrototypeBank,
  artifactDirectory: string,
): Promise<MeasuredEngineCase> {
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
  return {
    measurement,
    persist: async () => {
      const stem = `${fixture.id}-${derived.name}`;
      await writeJson(artifactDirectory, ["engines", engine, `${stem}.json`], {
        ...measurement,
        derivative: describeDerivativeArtifact(derived),
        status: result.status,
        geometry: result.geometry,
        cells: serializeCaseCells(result.cells, fixture.expectedCells, result.uncertainCellIndices),
      });
      const overlayPath = artifactPath(artifactDirectory, "engines", engine, `${stem}.png`);
      await mkdir(path.dirname(overlayPath), { recursive: true });
      await renderOverlay(
        derived.image,
        result.geometry ?? fallbackGeometry(derived.image, fixture),
        result.cells,
        overlayPath,
      );
    },
  };
}

async function derivedImages(
  engine: EngineSummary["engine"],
  fixture: FixtureCase,
): Promise<readonly DerivedEvaluationImage[]> {
  if (engine === "sharp") {
    return (await deriveImages(fixture.imagePath)).map((derived) => ({
      name: derived.name,
      image: derived.image,
      scale: derived.scale,
      encoding: derived.name === "source"
        ? "sharp-source"
        : derived.name === "jpeg-q75" ? "sharp-jpeg-075" : "sharp-lanczos3",
    }));
  }
  return (await deriveBrowserImages(engine, fixture.imagePath)).map((derived) => ({
    name: derived.name,
    image: derived.image,
    version: derived.browserVersion,
    scale: derived.scale,
    encoding: derived.encoding,
  }));
}

function expectedCaseIds(engine: EngineSummary["engine"], fixtures: readonly FixtureCase[]): readonly string[] {
  const derivatives = engine === "sharp"
    ? ["source", "scale-075", "scale-125", "jpeg-q75"]
    : ["source", "canvas-scale-075", "canvas-scale-125", "canvas-jpeg-q75"];
  return fixtures.flatMap((fixture) => derivatives.map((derivative) => `${fixture.id}:${derivative}`));
}

export async function evaluateEngine(
  engine: EngineSummary["engine"],
  fixtures: readonly FixtureCase[],
  bank: PrototypeBank,
  artifactDirectory: string,
  overrides: EvaluateEngineOverrides = {},
): Promise<EvaluatedEngine> {
  const cases: EngineCaseMeasurement[] = [];
  const versions = new Set<string>();
  const expectedIds = expectedCaseIds(engine, fixtures);
  const derive = overrides.deriveImages ?? derivedImages;
  const measure = overrides.measureImage ?? measureImage;
  try {
    for (const fixture of fixtures) {
      for (const derived of await derive(engine, fixture)) {
        if (derived.version !== undefined) versions.add(derived.version);
        const evaluated = await measure(engine, fixture, derived, bank, artifactDirectory);
        cases.push(evaluated.measurement);
        await evaluated.persist();
      }
    }
    return { summary: summarizeEngine(engine, cases, expectedIds), cases, versions: [...versions].sort() };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return summarizeInterruptedEngine(engine, cases, expectedIds, [...versions].sort(), message);
  }
}

function notRunEngine(engine: EngineSummary["engine"]): EvaluatedEngine {
  return {
    summary: { engine, formalPassed: false, compatibility: "not-run" },
    cases: [],
    versions: [],
  };
}

function foldElapsedValues(folds: readonly FoldResult[]): readonly number[] {
  return folds.flatMap((fold) => fold.evaluationCases.map((evaluation) => evaluation.elapsedMs));
}

function hashSummary(summary: unknown): string {
  return createHash("sha256").update(JSON.stringify(summary)).digest("hex");
}

const engineNames = ["chromium", "firefox", "webkit", "sharp"] as const;

function candidateArtifact(candidate: CandidateEvidence): unknown {
  return {
    status: candidate.bank === null ? "rejected" : "thresholded",
    bankHash: candidate.serializedBank?.sha256 ?? null,
    prototypeLabels: candidate.prototypeLabels,
    prototypeCounts: candidate.prototypeCounts,
    thresholds: candidate.thresholds,
    calibration: candidate.calibration,
    evaluationCases: candidate.evaluationCases,
    chromiumVersion: candidate.chromiumVersion,
    elapsedMs: candidate.elapsedMs,
  };
}

function compatibilityRecord(engines: readonly EvaluatedEngine[]): SpikeSummary["compatibility"] {
  const byName = new Map(engines.map((engine) => [engine.summary.engine, engine]));
  return Object.fromEntries(engineNames.map((engineName) => {
    const evaluated = byName.get(engineName) ?? {
      summary: { engine: engineName, formalPassed: false, compatibility: "limited" as const },
      cases: [],
      versions: [],
      error: "Engine evaluation did not return a result.",
    };
    return [engineName, {
      ...evaluated.summary,
      cases: evaluated.cases,
      versions: evaluated.versions,
      ...(evaluated.error === undefined ? {} : { error: evaluated.error }),
    }];
  })) as unknown as SpikeSummary["compatibility"];
}

export async function runSpike(
  dependencies: SpikeRunDependencies,
): Promise<{ readonly exitCode: 0 | 1; readonly summary: SpikeSummary }> {
  const startedAt = dependencies.now();
  dependencies.progress("candidate:start");
  const candidate = await dependencies.buildCandidate();
  dependencies.progress("candidate:complete");
  await dependencies.writeArtifact("checkpoints/candidate.json", candidateArtifact(candidate));

  dependencies.progress("folds:start");
  const foldsStartedAt = dependencies.now();
  const folds = await dependencies.evaluateFolds();
  const foldsElapsedMs = dependencies.now() - foldsStartedAt;
  dependencies.progress("folds:complete");
  await dependencies.writeArtifact("checkpoints/folds.json", folds);

  const evaluatedEngines = candidate.bank === null
    ? engineNames.map(notRunEngine)
    : await dependencies.evaluateEngines(candidate.bank);
  const compatibility = compatibilityRecord(evaluatedEngines);
  const chromiumCases = compatibility.chromium.cases;
  const foldsPassed = folds.length === 4 && folds.every((fold) => fold.passes);
  const formalPassed = candidate.bank !== null
    && compatibility.chromium.formalPassed
    && foldsPassed;
  const adoption: AdoptionSummary = {
    decision: formalPassed ? "multi-prototype-adopted" : "multi-prototype-rejected",
    formalPassed,
  };
  const measuredEngineElapsed = evaluatedEngines.flatMap((engine) => (
    engine.cases.map((measurement) => measurement.elapsedMs)
  ));
  const measuredElapsed = measuredEngineElapsed.length === 0
    ? foldElapsedValues(folds)
    : measuredEngineElapsed;
  const summary: SpikeSummary = {
    decision: adoption.decision,
    environment: {
      ...dependencies.environment,
      chromiumVersion: candidate.chromiumVersion,
      engineVersions: Object.fromEntries(engineNames.map((engineName) => [
        engineName,
        compatibility[engineName].versions,
      ])) as SpikeSummary["environment"]["engineVersions"],
    },
    candidate: {
      status: candidate.bank === null ? "rejected" : "thresholded",
      bankHash: candidate.serializedBank?.sha256 ?? null,
      prototypeLabels: candidate.prototypeLabels,
      prototypeCounts: candidate.prototypeCounts,
      thresholds: candidate.thresholds,
      calibration: {
        evaluatedThresholdPairs: candidate.calibration.length,
        passingThresholdPairs: candidate.calibration.filter((evaluation) => evaluation.passes).length,
      },
      elapsedMs: candidate.elapsedMs,
    },
    chromiumFormal: {
      passed: adoption.formalPassed,
      candidateCases: candidate.evaluationCases,
      evaluatedCases: chromiumCases,
    },
    wholeScreenHoldout: {
      passed: foldsPassed,
      folds,
      elapsedMs: foldsElapsedMs,
    },
    compatibility,
    performance: {
      caseElapsedMs: elapsedSummary(measuredElapsed),
      candidateCaseElapsedMs: elapsedSummary(candidate.evaluationCases.map((item) => item.elapsedMs)),
      foldCaseElapsedMs: elapsedSummary(foldElapsedValues(folds)),
      engineCaseElapsedMs: elapsedSummary(measuredEngineElapsed),
      totalElapsedMs: dependencies.now() - startedAt,
    },
    coverage: {
      digits7And8: "unsupported",
      playwrightWebKit: "compatibility proxy; not Safari",
    },
  };

  dependencies.progress("artifacts:start");
  if (candidate.serializedBank !== null) {
    await dependencies.writeArtifact("prototype-bank.json", candidate.serializedBank);
  }
  for (const candidateCase of candidate.evaluationCases) {
    const safeId = candidateCase.id.replaceAll(/[^a-zA-Z0-9._-]/g, "-");
    await dependencies.writeArtifact(`candidate/cases/${safeId}.json`, candidateCase);
  }
  await dependencies.writeArtifact("candidate.json", candidateArtifact(candidate));
  await dependencies.writeArtifact("folds.json", folds);
  await dependencies.writeArtifact("engines.json", summary.compatibility);
  await dependencies.writeArtifact("summary.json", {
    ...summary,
    evidenceHash: hashSummary(summary),
  });
  await dependencies.writeReport(summary);
  dependencies.progress("artifacts:complete");
  return { exitCode: formalPassed ? 0 : 1, summary };
}

function formatValue(value: number | null): string {
  return value === null ? "not measured" : `${value.toFixed(3)} ms`;
}

export function renderSpikeReport(summary: SpikeSummary): string {
  const gridFailureIds = summary.chromiumFormal.candidateCases
    .filter((measurement) => !measurement.gridFound)
    .map((measurement) => measurement.id);
  const prototypeCounts = summary.candidate.prototypeLabels.map((label, index) => (
    `${String(label)}:${summary.candidate.prototypeCounts[index] ?? 0}`
  )).join(", ");
  const failedCandidateCases = gridFailureIds
    .map((id) => `- \`${id}\``)
    .join("\n") || "- none";
  const calibrationOutcome = summary.decision === "multi-prototype-adopted"
    ? "The complete formal matrix passed with the selected shared thresholds."
    : gridFailureIds.length > 0
      ? `The full matrix remained incomplete because ${gridFailureIds.length} required cases had no grid.`
      : summary.candidate.thresholds === null
        ? "The complete measured matrix produced no passing shared threshold pair."
        : "The candidate thresholds passed the complete measured matrix, but another formal gate failed.";
  const followUp = summary.decision === "multi-prototype-adopted"
    ? "Proceed with product integration planning."
    : gridFailureIds.length > 0
      ? `Improve grid detection for the ${gridFailureIds.length} rejected Chromium derivatives.`
      : !summary.wholeScreenHoldout.passed
        ? "Improve held-out-screen generalization."
        : "Revisit shared-threshold calibration.";
  const foldRows = summary.wholeScreenHoldout.folds.map((fold) => (
    `| \`${fold.heldOutFixtureId}\` | \`${JSON.stringify(fold.prototypeCounts)}\` | `
      + `\`${fold.absentTrainingLabels.join(",") || "none"}\` | `
      + `\`${fold.thresholds === null ? "null" : JSON.stringify(fold.thresholds)}\` | ${fold.passes} |`
  )).join("\n");
  const compatibilityRows = engineNames.map((engine) => {
    const evidence = summary.compatibility[engine];
    return `| ${engine} | ${engine === "chromium" ? "formal" : "informational"} | \`${evidence.compatibility}\` |`;
  }).join("\n");
  return `# Multi-Prototype Recognition Spike Report

## Decision

${summary.decision}

## Environment

- Platform: ${summary.environment.platform} ${summary.environment.architecture}
- Node.js: ${summary.environment.node}
- Playwright: ${summary.environment.dependencyVersions.playwright ?? "unknown"}
- Sharp: ${summary.environment.dependencyVersions.sharp ?? "unknown"}
- Chromium: ${summary.environment.chromiumVersion}

## Prototype Bank

Prototype counts by label: \`${prototypeCounts}\`. Thresholds: \`${JSON.stringify(summary.candidate.thresholds)}\`. Bank SHA-256: \`${summary.candidate.bankHash ?? "null"}\`. Calibration evaluated ${summary.candidate.calibration.evaluatedThresholdPairs} threshold pairs; ${summary.candidate.calibration.passingThresholdPairs} passed the available complete cases. ${calibrationOutcome}

## Chromium Formal Results

\`formalPassed: ${summary.chromiumFormal.passed}\`. Candidate grid failures:

${failedCandidateCases}

All ${summary.chromiumFormal.candidateCases.length} final-candidate cases include measured \`elapsedMs\` values in the generated summary.

## Whole-Screen Holdout Results

| Held out | Prototype counts | Absent labels | Threshold | Pass |
| --- | --- | --- | --- | --- |
${foldRows}

## Compatibility Matrix

| Engine | Role | Result |
| --- | --- | --- |
${compatibilityRows}

Playwright WebKit is not Safari and does not provide a Safari compatibility guarantee.

## Visual Inspection

${summary.candidate.status === "rejected"
    ? "Engine overlays were not generated because no thresholded bank existed. Passing-bank overlay inspection is deferred."
    : "Engine case JSON and PNG overlays were generated under the ignored recognition artifact directory."}

## Performance

Candidate build elapsed: ${formatValue(summary.candidate.elapsedMs)}. Fold evaluation elapsed: ${formatValue(summary.wholeScreenHoldout.elapsedMs)}. Total runner elapsed: ${formatValue(summary.performance.totalElapsedMs)}.

Recorded case min/median/max: ${formatValue(summary.performance.caseElapsedMs.min)} / ${formatValue(summary.performance.caseElapsedMs.median)} / ${formatValue(summary.performance.caseElapsedMs.max)}. Candidate-case min/median/max: ${formatValue(summary.performance.candidateCaseElapsedMs.min)} / ${formatValue(summary.performance.candidateCaseElapsedMs.median)} / ${formatValue(summary.performance.candidateCaseElapsedMs.max)}. Fold-case min/median/max: ${formatValue(summary.performance.foldCaseElapsedMs.min)} / ${formatValue(summary.performance.foldCaseElapsedMs.median)} / ${formatValue(summary.performance.foldCaseElapsedMs.max)}. Evaluated-engine min/median/max: ${formatValue(summary.performance.engineCaseElapsedMs.min)} / ${formatValue(summary.performance.engineCaseElapsedMs.median)} / ${formatValue(summary.performance.engineCaseElapsedMs.max)}.

## Coverage Limits

- Digits 7 and 8 remain unsupported and unverified.
- Firefox, Playwright WebKit, and Sharp compatibility never override Chromium adoption.
- User-entered columns, rows, and total mines remain authoritative.
${summary.candidate.status === "rejected" ? "- Passing-bank overlays were unavailable, so their required visual inspection is deferred." : ""}

## Follow-up

${followUp}
`;
}

async function writeTextAtomically(outputPath: string, value: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, outputPath);
}

interface PackageLockVersions {
  readonly packages?: Readonly<Record<string, { readonly version?: string }>>;
}

export function resolveDependencyVersions(
  packageLock: PackageLockVersions,
): SpikeEnvironment["dependencyVersions"] {
  return {
    playwright: packageLock.packages?.["node_modules/playwright"]?.version ?? null,
    sharp: packageLock.packages?.["node_modules/sharp"]?.version ?? null,
  };
}

async function resolvedEnvironment(): Promise<SpikeEnvironment> {
  const packageLock = JSON.parse(
    await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"),
  ) as PackageLockVersions;
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    dependencyVersions: resolveDependencyVersions(packageLock),
  };
}

export async function createProductionDependencies(options: {
  readonly artifactDirectory: string;
  readonly reportPath: string;
}): Promise<SpikeRunDependencies> {
  const fixtures = await loadFixtureCases();
  return {
    buildCandidate: async () => {
      const startedAt = Date.now();
      const candidate = await buildFinalBankCandidate();
      const serializedGeometry = encodePrototypeBank({
        ...candidate.geometry,
        thresholds: { relativeMargin: 0, absoluteDistance: Number.MAX_VALUE },
      });
      return {
        bank: candidate.bank,
        serializedBank: candidate.bank === null ? null : encodePrototypeBank(candidate.bank),
        prototypeLabels: serializedGeometry.labels,
        prototypeCounts: serializedGeometry.prototypeCounts,
        thresholds: candidate.thresholds,
        calibration: candidate.calibration,
        evaluationCases: candidate.evaluationCases,
        chromiumVersion: candidate.chromiumVersion,
        elapsedMs: Date.now() - startedAt,
      };
    },
    evaluateFolds: async () => evaluateLeaveOneScreenOut(fixtures, "chromium"),
    evaluateEngines: async (bank) => {
      const engines: EvaluatedEngine[] = [];
      for (const engine of engineNames) {
        engines.push(await evaluateEngine(engine, fixtures, bank, options.artifactDirectory));
      }
      return engines;
    },
    environment: await resolvedEnvironment(),
    writeArtifact: createAtomicArtifactWriter(options.artifactDirectory),
    writeReport: async (summary) => {
      await writeTextAtomically(options.reportPath, renderSpikeReport(summary));
    },
    progress: reportProgress,
    now: Date.now,
  };
}

export async function main(): Promise<number> {
  const artifactDirectory = await recreateArtifactDirectory(repositoryRoot, artifactParts);
  const dependencies = await createProductionDependencies({
    artifactDirectory,
    reportPath: path.join(
      repositoryRoot,
      "docs",
      "superpowers",
      "spikes",
      "2026-08-23-multi-prototype-recognition-report.md",
    ),
  });
  const result = await runSpike(dependencies);
  console.log(JSON.stringify({
    decision: result.summary.decision,
    summaryPath: artifactPath(artifactDirectory, "summary.json"),
  }, null, 2));
  return result.exitCode;
}

export async function runCliAndExit(
  run: () => Promise<number> = main,
  exit: (exitCode: number) => void = (exitCode) => process.exit(exitCode),
): Promise<void> {
  try {
    const exitCode = await run();
    exit(exitCode);
  } catch (error) {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
    exit(1);
  }
}

const currentModulePath = process.argv[1];
if (currentModulePath !== undefined && import.meta.url === pathToFileURL(path.resolve(currentModulePath)).href) {
  void runCliAndExit();
}
