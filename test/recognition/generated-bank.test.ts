import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  NoPassingThresholdError,
  generatePrototypeBank,
  type FinalBankCandidate,
} from "../../scripts/recognition/generate-prototype-bank.js";
import { encodePrototypeBank } from "../../scripts/recognition/encode-prototype-bank.js";
import { decodePrototypeBank } from "../../src/recognition/prototype-bank-codec.js";

const temporaryDirectories: string[] = [];
const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");
const generatorPath = fileURLToPath(new URL("../../scripts/recognition/generate-prototype-bank.ts", import.meta.url));

interface CliResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runGeneratorCli(cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, generatorPath], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function temporaryOutputPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "prototype-bank-"));
  temporaryDirectories.push(directory);
  return join(directory, "prototype-bank.ts");
}

type GenerationOutcome =
  | { readonly kind: "success"; readonly serialized: Awaited<ReturnType<typeof generatePrototypeBank>> }
  | { readonly kind: "rejection"; readonly error: NoPassingThresholdError };

async function generateOutcome(outputPath: string): Promise<GenerationOutcome> {
  try {
    return { kind: "success", serialized: await generatePrototypeBank({ outputPath }) };
  } catch (error) {
    if (!(error instanceof NoPassingThresholdError)) throw error;
    return { kind: "rejection", error };
  }
}

function comparableCandidate(candidate: FinalBankCandidate) {
  return {
    ...candidate,
    evaluationCases: candidate.evaluationCases.map(({ elapsedMs: _elapsedMs, ...evaluationCase }) => evaluationCase),
  };
}

const comparisonCandidate: FinalBankCandidate = {
  geometry: {
    formatVersion: 1,
    featureVersion: "features-v1",
    scaler: { center: new Float64Array([0]), scale: new Float64Array([1]) },
    prototypes: [],
  },
  calibration: [],
  thresholds: null,
  bank: null,
  chromiumVersion: "comparison-browser",
  evaluationCases: [{
    id: "0:source",
    kind: "source",
    gridFound: false,
    correctCells: 0,
    wrongCertainCells: 0,
    uncertainCells: 480,
    elapsedMs: 1,
    browserVersion: "comparison-browser",
    derivative: {
      scale: 1,
      encoding: "source",
      width: 480,
      height: 480,
      rgbaSha256: "a".repeat(64),
      browserVersion: "comparison-browser",
    },
    geometry: null,
    cells: [],
  }],
};

describe("candidate reproducibility comparison", () => {
  it("allows elapsed time differences while retaining image hashes and case results", () => {
    const firstCase = comparisonCandidate.evaluationCases[0]!;
    const changedTime = {
      ...comparisonCandidate,
      evaluationCases: [{ ...firstCase, elapsedMs: 99 }],
    };
    expect(comparableCandidate(changedTime)).toEqual(comparableCandidate(comparisonCandidate));

    const changedHash = {
      ...comparisonCandidate,
      evaluationCases: [{ ...firstCase, derivative: { ...firstCase.derivative, rgbaSha256: "b".repeat(64) } }],
    };
    expect(() => expect(comparableCandidate(changedHash))
      .toEqual(comparableCandidate(comparisonCandidate))).toThrow();

    const changedResult = {
      ...comparisonCandidate,
      evaluationCases: [{ ...firstCase, uncertainCells: 479 }],
    };
    expect(() => expect(comparableCandidate(changedResult))
      .toEqual(comparableCandidate(comparisonCandidate))).toThrow();
  });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("final prototype bank generation", () => {
  it("rejects through the local tsx CLI without leaking transform helpers or output", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "prototype-bank-cli-"));
    temporaryDirectories.push(workingDirectory);
    const defaultOutputPath = join(
      workingDirectory,
      "test",
      "artifacts",
      "recognition",
      "final-prototype-bank.ts",
    );

    const result = await runGeneratorCli(workingDirectory);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("NoPassingThresholdError");
    expect(result.stderr).not.toContain("__name");
    await expect(access(defaultOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
  }, 180_000);

  it("reproduces a passing candidate or records deterministic rejection without output", async () => {
    const firstOutputPath = await temporaryOutputPath();
    const secondOutputPath = await temporaryOutputPath();
    const first = await generateOutcome(firstOutputPath);
    const second = await generateOutcome(secondOutputPath);
    expect(second.kind).toBe(first.kind);

    if (first.kind === "rejection") {
      if (second.kind !== "rejection") throw new Error("Prototype bank generation outcomes differ.");
      const error = first.error;
      expect(error).toBeInstanceOf(NoPassingThresholdError);
      expect(second.error).toBeInstanceOf(NoPassingThresholdError);
      expect(second.error.name).toBe(error.name);
      expect(second.error.message).toBe(error.message);
      expect(comparableCandidate(second.error.candidate)).toEqual(comparableCandidate(error.candidate));

      expect(error.candidate.thresholds).toBeNull();
      expect(error.candidate.bank).toBeNull();
      expect(error.candidate.chromiumVersion).not.toBe("");
      expect(error.candidate.calibration).toHaveLength(238);
      expect(error.candidate.evaluationCases.map((evaluationCase) => evaluationCase.id)).toEqual([
        "0:source", "0:canvas-scale-075", "0:canvas-scale-125", "0:canvas-jpeg-q75",
        "1:source", "1:canvas-scale-075", "1:canvas-scale-125", "1:canvas-jpeg-q75",
        "2:source", "2:canvas-scale-075", "2:canvas-scale-125", "2:canvas-jpeg-q75",
        "3:source", "3:canvas-scale-075", "3:canvas-scale-125", "3:canvas-jpeg-q75",
      ]);
      expect(error.candidate.evaluationCases
        .filter((evaluationCase) => !evaluationCase.gridFound)
        .map((evaluationCase) => evaluationCase.id)).toEqual([
        "1:canvas-scale-075",
        "2:canvas-scale-075",
      ]);
      expect(second.error.candidate.evaluationCases.every((evaluationCase) => Number.isFinite(evaluationCase.elapsedMs)
        && evaluationCase.elapsedMs >= 0)).toBe(true);
      expect(error.candidate.evaluationCases.every((evaluationCase) => evaluationCase.correctCells === 0
        && evaluationCase.wrongCertainCells === 0
        && evaluationCase.uncertainCells === 480
        && Number.isFinite(evaluationCase.elapsedMs)
        && evaluationCase.elapsedMs >= 0)).toBe(true);
      expect(error.candidate.evaluationCases.every((evaluationCase) => (
        evaluationCase.browserVersion === error.candidate.chromiumVersion
        && evaluationCase.derivative.browserVersion === error.candidate.chromiumVersion
        && evaluationCase.derivative.width > 0
        && evaluationCase.derivative.height > 0
        && /^[0-9a-f]{64}$/.test(evaluationCase.derivative.rgbaSha256)
      ))).toBe(true);
      const sourceEvidence = error.candidate.evaluationCases.find((evaluationCase) => evaluationCase.id === "0:source");
      expect(sourceEvidence?.geometry).not.toBeNull();
      expect(sourceEvidence?.cells).toHaveLength(480);
      expect(sourceEvidence?.cells[0]).toEqual(expect.objectContaining({
        index: 0,
        expectedLabel: expect.anything(),
        confidence: expect.any(Number),
        candidates: expect.any(Array),
        uncertain: true,
        correct: expect.any(Boolean),
      }));
      await expect(access(firstOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(secondOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
      return;
    }

    if (second.kind !== "success") throw new Error("Prototype bank generation outcomes differ.");
    {
      const firstSerialized = first.serialized;
      const secondSerialized = second.serialized;
      const firstModule = await readFile(firstOutputPath, "utf8");
      const secondModule = await readFile(secondOutputPath, "utf8");

      expect(secondSerialized).toEqual(firstSerialized);
      expect(secondModule).toBe(firstModule);
      expect(Math.max(...firstSerialized.prototypeCounts)).toBeLessThanOrEqual(12);
      expect(firstSerialized.labels).not.toContain(7);
      expect(firstSerialized.labels).not.toContain(8);
      expect(encodePrototypeBank(decodePrototypeBank(firstSerialized))).toEqual(firstSerialized);
    }
  }, 180_000);
});
