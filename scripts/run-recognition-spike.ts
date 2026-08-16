import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildPrototypeSet } from "../src/recognition/prototypes.js";
import {
  RECOGNITION_CONFIDENCE_THRESHOLD,
  evaluateConfidenceThresholds,
  recognizeBoard,
  selectSharedConfidenceThreshold,
} from "../src/recognition/recognize.js";
import { deriveImages } from "../test/recognition/derive.js";
import { loadFixtureCases } from "../test/recognition/fixture-manifest.js";
import { renderOverlay } from "../test/recognition/overlay.js";
import { buildFixtureSamples } from "../test/recognition/samples.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const artifactParent = path.resolve(repositoryRoot, "test", "artifacts");
const artifactDirectory = path.resolve(artifactParent, "recognition");

function assertSafeArtifactDirectory(): void {
  if (path.dirname(artifactDirectory) !== artifactParent || path.basename(artifactDirectory) !== "recognition") {
    throw new Error(`Refusing to clean unsafe artifact directory: ${artifactDirectory}`);
  }
}

function artifactPath(filename: string): string {
  const resolved = path.resolve(artifactDirectory, filename);
  if (resolved === artifactDirectory || !resolved.startsWith(`${artifactDirectory}${path.sep}`)) {
    throw new Error(`Refusing to write outside recognition artifacts: ${resolved}`);
  }
  return resolved;
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(artifactPath(filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

assertSafeArtifactDirectory();
await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });

const fixtures = await loadFixtureCases();
const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
const caseSummaries = [];
const calibrationCases = [];

for (const fixture of fixtures) {
  for (const derived of await deriveImages(fixture.imagePath)) {
    const caseName = `${fixture.id}-${derived.name}`;
    const result = recognizeBoard({
      image: derived.image,
      columns: fixture.columns,
      rows: fixture.rows,
    }, prototypes);
    const uncertainty = new Set(result.uncertainCellIndices);
    const correctness = result.cells.map((cell, index) => cell.label === fixture.expectedCells[index]);
    const highConfidenceErrors = correctness.filter((correct, index) => !correct && !uncertainty.has(index)).length;
    const correctCells = correctness.filter(Boolean).length;

    calibrationCases.push({
      kind: derived.name === "source" ? "source" as const : "derivative" as const,
      cells: result.cells.map((cell, index) => ({
        confidence: cell.confidence,
        correct: correctness[index]!,
      })),
    });
    caseSummaries.push({
      fixtureId: fixture.id,
      derivative: derived.name,
      status: result.status,
      detectedGrid: result.geometry !== null,
      correctCells,
      highConfidenceErrors,
      uncertainCells: result.uncertainCellIndices.length,
      elapsedMs: result.elapsedMs,
    });

    await writeJson(`${caseName}.json`, {
      fixtureId: fixture.id,
      derivative: derived.name,
      image: { width: derived.image.width, height: derived.image.height },
      status: result.status,
      geometry: result.geometry,
      labels: result.cells.map((cell) => cell.label),
      confidence: result.cells.map((cell) => cell.confidence),
      uncertainty: result.cells.map((cell) => uncertainty.has(cell.index)),
      correctness,
      uncertainCellIndices: result.uncertainCellIndices,
      candidates: result.cells.map((cell) => cell.candidates),
      correctCells,
      highConfidenceErrors,
      elapsedMs: result.elapsedMs,
    });
    const overlayGeometry = result.geometry ?? {
      bounds: { x: 0, y: 0, width: derived.image.width, height: derived.image.height },
      columns: fixture.columns,
      rows: fixture.rows,
      pitchX: derived.image.width / fixture.columns,
      pitchY: derived.image.height / fixture.rows,
      score: 0,
    };
    await renderOverlay(derived.image, overlayGeometry, result.cells, artifactPath(`${caseName}.png`));
  }
}

const thresholdEvaluations = evaluateConfidenceThresholds(calibrationCases);
const selectedThreshold = selectSharedConfidenceThreshold(calibrationCases);
const totals = {
  cases: caseSummaries.length,
  detectedGrids: caseSummaries.filter((result) => result.detectedGrid).length,
  correctCells: caseSummaries.reduce((total, result) => total + result.correctCells, 0),
  highConfidenceErrors: caseSummaries.reduce((total, result) => total + result.highConfidenceErrors, 0),
  uncertainCells: caseSummaries.reduce((total, result) => total + result.uncertainCells, 0),
  elapsedMs: caseSummaries.reduce((total, result) => total + result.elapsedMs, 0),
};
const sourceCases = caseSummaries.filter((result) => result.derivative === "source");
const derivativeCases = caseSummaries.filter((result) => result.derivative !== "source");
const mandatory = {
  passed: totals.cases === 16
    && totals.detectedGrids === 16
    && selectedThreshold === RECOGNITION_CONFIDENCE_THRESHOLD
    && sourceCases.every((result) => (
      result.status === "recognized"
      && result.correctCells === 480
      && result.highConfidenceErrors === 0
      && result.uncertainCells === 0
    ))
    && derivativeCases.every((result) => result.highConfidenceErrors === 0 && result.uncertainCells <= 4),
  selectedThreshold,
  configuredThreshold: RECOGNITION_CONFIDENCE_THRESHOLD,
  requirements: {
    allGridsDetected: totals.detectedGrids === 16,
    sourceCellsCorrect: sourceCases.every((result) => result.correctCells === 480),
    sourceUncertainCellsZero: sourceCases.every((result) => result.uncertainCells === 0),
    highConfidenceErrorsZero: totals.highConfidenceErrors === 0,
    derivativeUncertainCellsAtMostFour: derivativeCases.every((result) => result.uncertainCells <= 4),
  },
};

await writeJson("summary.json", {
  confidenceThresholdCandidates: thresholdEvaluations,
  cases: caseSummaries,
  totals,
  mandatory,
});

console.log(JSON.stringify({ totals, mandatory }, null, 2));
if (!mandatory.passed) process.exitCode = 1;
