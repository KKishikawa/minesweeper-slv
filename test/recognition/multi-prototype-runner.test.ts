import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createAtomicArtifactWriter,
  describeDerivativeArtifact,
  reportProgress,
  renderSpikeReport,
  resolveDependencyVersions,
  runSpike,
  serializeCaseCells,
  summarizeAdoption,
  summarizeEngine,
  summarizeInterruptedEngine,
  type CandidateEvidence,
  type EngineCaseMeasurement,
  type EvaluatedEngine,
  type SpikeSummary,
} from "../../scripts/run-multi-prototype-spike.js";
import type { FoldResult } from "../../scripts/recognition/evaluate-folds.js";
import type { PrototypeBank } from "../../src/recognition/prototype-bank.js";

function measurement(overrides: Partial<EngineCaseMeasurement> = {}): EngineCaseMeasurement {
  return {
    id: "fixture/source",
    kind: "source",
    gridFound: true,
    wrongCertainCells: 0,
    uncertainCells: 0,
    elapsedMs: 10,
    ...overrides,
  };
}

function fold(index: number, passes: boolean): FoldResult {
  return {
    heldOutFixtureId: String(index) as FoldResult["heldOutFixtureId"],
    trainingFixtureIds: [],
    calibrationFixtureIds: [],
    absentTrainingLabels: [],
    prototypeCounts: [],
    thresholds: null,
    evaluationCases: [],
    passes,
  };
}

function candidate(
  bank: PrototypeBank | null,
  evaluationCases: CandidateEvidence["evaluationCases"] = [],
): CandidateEvidence {
  return {
    bank,
    serializedBank: bank === null ? null : {
      formatVersion: 1,
      featureVersion: "features-v1",
      featureLength: 1,
      thresholds: { relativeMargin: 0.5, absoluteDistance: 1 },
      labels: [],
      prototypeCounts: [],
      centerBase64: "",
      scaleBase64: "",
      prototypeBase64: "",
      sha256: "a".repeat(64),
    },
    prototypeLabels: ["closed"],
    prototypeCounts: [1],
    thresholds: bank === null ? null : { relativeMargin: 0.5, absoluteDistance: 1 },
    calibration: [],
    evaluationCases,
    chromiumVersion: "123.0.0.0",
    elapsedMs: 20,
  };
}

describe("multi-prototype spike summary", () => {
  it("reports resolved dependency versions instead of manifest ranges", () => {
    expect(resolveDependencyVersions({
      packages: {
        "node_modules/playwright": { version: "1.2.3" },
        "node_modules/sharp": { version: "4.5.6" },
      },
    })).toEqual({ playwright: "1.2.3", sharp: "4.5.6" });
  });

  it("publishes checkpoints atomically without a temporary file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "multi-prototype-runner-"));
    try {
      const writeArtifact = createAtomicArtifactWriter(directory);
      await writeArtifact("checkpoints/candidate.json", { status: "rejected" });

      expect(JSON.parse(await readFile(path.join(directory, "checkpoints", "candidate.json"), "utf8"))).toEqual({
        status: "rejected",
      });
      expect(await readdir(path.join(directory, "checkpoints"))).toEqual(["candidate.json"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("writes a stable progress marker to the supplied stderr sink", () => {
    const lines: string[] = [];

    reportProgress("folds:start", (line) => lines.push(line));

    expect(lines).toEqual(["[multi-prototype-spike] folds:start"]);
  });

  it("keeps compatibility failure separate from Chromium adoption", () => {
    const expected = ["fixture/source"];
    const chromium = summarizeEngine("chromium", [measurement()], expected);
    const firefox = summarizeEngine("firefox", [measurement({ wrongCertainCells: 1 })], expected);

    expect(chromium.formalPassed).toBe(true);
    expect(firefox.compatibility).toBe("not-guaranteed");
    expect(chromium.formalPassed).toBe(true);
  });

  it("distinguishes unavailable, limited, and guaranteed compatibility", () => {
    expect(summarizeEngine("webkit", [], ["fixture/source"])).toMatchObject({
      formalPassed: false,
      compatibility: "limited",
    });
    expect(summarizeEngine("firefox", [measurement({
      kind: "transformed",
      uncertainCells: 5,
    })], ["fixture/source"])).toMatchObject({
      formalPassed: false,
      compatibility: "limited",
    });
    expect(summarizeEngine("sharp", [measurement({
      kind: "transformed",
      uncertainCells: 4,
    })], ["fixture/source"])).toMatchObject({
      formalPassed: false,
      compatibility: "guaranteed",
    });
  });

  it("requires the exact expected case-id set for a guarantee", () => {
    expect(summarizeEngine(
      "firefox",
      [measurement({ id: "fixture/source" })],
      ["fixture/source", "fixture/transformed"],
    ).compatibility).toBe("limited");
    expect(summarizeEngine(
      "firefox",
      [measurement({ id: "fixture/source" }), measurement({ id: "unexpected" })],
      ["fixture/source", "fixture/transformed"],
    ).compatibility).toBe("limited");
  });

  it("preserves a hard failure when an engine is interrupted later", () => {
    const expected = ["fixture/source", "fixture/transformed"];
    expect(summarizeInterruptedEngine(
      "firefox",
      [measurement({ gridFound: false })],
      expected,
      [],
      "browser closed",
    ).summary.compatibility).toBe("not-guaranteed");
    expect(summarizeInterruptedEngine(
      "firefox",
      [measurement()],
      expected,
      [],
      "browser closed",
    ).summary.compatibility).toBe("limited");
  });

  it("serializes complete per-cell and derivative diagnostics", () => {
    expect(serializeCaseCells([
      { index: 0, label: 1, confidence: 0.75, candidates: [{ label: 1, distance: 0.5 }] },
    ], [2], [0])).toEqual([{
      index: 0,
      label: 1,
      expectedLabel: 2,
      confidence: 0.75,
      candidates: [{ label: 1, distance: 0.5 }],
      uncertain: true,
      correct: false,
    }]);
    expect(describeDerivativeArtifact({
      name: "source",
      scale: 1,
      encoding: "source",
      image: { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4]) },
    })).toEqual({
      scale: 1,
      encoding: "source",
      width: 1,
      height: 1,
      rgbaSha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
    });
  });

  it("rejects when the candidate bank or any fold is missing", () => {
    const chromiumCases = [measurement()];

    expect(summarizeAdoption(false, chromiumCases, [true, true, true, true], ["fixture/source"])).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
    expect(summarizeAdoption(true, chromiumCases, [true, true, false, true], ["fixture/source"])).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
  });

  it("requires the complete sixteen-case Chromium matrix", () => {
    expect(summarizeAdoption(true, [measurement()], [true, true, true, true], ["fixture/source"])).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
    const completeCases = Array.from({ length: 16 }, (_, index) => measurement({ id: `case-${index}` }));
    expect(summarizeAdoption(
      true,
      completeCases,
      [true, true, true, true],
      completeCases.map((item) => item.id),
    )).toEqual({
      decision: "multi-prototype-adopted",
      formalPassed: true,
    });
    expect(summarizeAdoption(
      true,
      completeCases,
      [true, true, true, true],
      completeCases.map((_, index) => `expected-${index}`),
    )).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
  });

  it("writes a rejected bank-null summary without evaluating engines", async () => {
    const artifacts = new Map<string, unknown>();
    let engineEvaluations = 0;
    let report: SpikeSummary | null = null;
    const candidateCase = {
      id: "fixture:source",
      kind: "source",
      gridFound: true,
      correctCells: 0,
      wrongCertainCells: 0,
      uncertainCells: 1,
      elapsedMs: 10,
      browserVersion: "123.0.0.0",
      derivative: {
        scale: 1,
        encoding: "source",
        width: 1,
        height: 1,
        rgbaSha256: "b".repeat(64),
        browserVersion: "123.0.0.0",
      },
      geometry: null,
      cells: [{
        index: 0,
        label: 1,
        expectedLabel: 2,
        confidence: 0.5,
        candidates: [{ label: 1, distance: 0.25 }],
        uncertain: true,
        correct: false,
      }],
    } as CandidateEvidence["evaluationCases"][number];
    const result = await runSpike({
      buildCandidate: async () => candidate(null, [candidateCase]),
      evaluateFolds: async () => [0, 1, 2, 3].map((index) => fold(index, false)),
      evaluateEngines: async () => {
        engineEvaluations += 1;
        return [];
      },
      environment: {
        node: "v-test",
        platform: "test",
        architecture: "test",
        dependencyVersions: { playwright: "1.0.0", sharp: "1.0.0" },
      },
      writeArtifact: async (name, value) => {
        artifacts.set(name, value);
      },
      writeReport: async (summary) => {
        report = summary;
      },
      progress: () => undefined,
      now: (() => {
        let value = 100;
        return () => value++;
      })(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary).toMatchObject({
      decision: "multi-prototype-rejected",
      chromiumFormal: { passed: false },
      compatibility: {
        chromium: { compatibility: "not-run" },
        firefox: { compatibility: "not-run" },
        webkit: { compatibility: "not-run" },
        sharp: { compatibility: "not-run" },
      },
    });
    expect(engineEvaluations).toBe(0);
    expect([...artifacts.keys()]).toEqual([
      "checkpoints/candidate.json",
      "checkpoints/folds.json",
      "candidate/cases/fixture-source.json",
      "candidate.json",
      "folds.json",
      "engines.json",
      "summary.json",
    ]);
    expect(report).toEqual(result.summary);
    expect(artifacts.get("candidate/cases/fixture-source.json")).toEqual(candidateCase);
    expect(renderSpikeReport(result.summary).match(/multi-prototype-rejected/g)).toHaveLength(1);
  });

  it("does not reject a passing Chromium bank for compatibility-only failures", async () => {
    const bank = {} as PrototypeBank;
    const artifacts = new Map<string, unknown>();
    const chromiumCases = Array.from({ length: 16 }, (_, index) => measurement({ id: `case-${index}` }));
    const expectedCaseIds = chromiumCases.map((item) => item.id);
    const engine = (
      name: EvaluatedEngine["summary"]["engine"],
      cases: readonly EngineCaseMeasurement[],
    ): EvaluatedEngine => ({
      summary: summarizeEngine(name, cases, expectedCaseIds),
      cases,
      versions: [],
    });
    const result = await runSpike({
      buildCandidate: async () => candidate(bank),
      evaluateFolds: async () => [0, 1, 2, 3].map((index) => fold(index, true)),
      evaluateEngines: async () => [
        engine("chromium", chromiumCases),
        engine("firefox", chromiumCases.slice(0, 15)),
        engine("webkit", chromiumCases),
        engine("sharp", chromiumCases),
      ],
      environment: {
        node: "v-test",
        platform: "test",
        architecture: "test",
        dependencyVersions: { playwright: "1.0.0", sharp: "1.0.0" },
      },
      writeArtifact: async (name, value) => {
        artifacts.set(name, value);
      },
      writeReport: async () => undefined,
      progress: () => undefined,
      now: () => 100,
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.decision).toBe("multi-prototype-adopted");
    expect(result.summary.compatibility.firefox.compatibility).toBe("limited");
    expect(artifacts.get("prototype-bank.json")).toMatchObject({ sha256: "a".repeat(64) });
  });
});
