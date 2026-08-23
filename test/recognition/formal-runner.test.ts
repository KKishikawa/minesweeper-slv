import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import {
  createProductionDependencies,
  runSpike,
} from "../../scripts/run-multi-prototype-spike.js";

it("writes fresh rejected formal evidence through the production evaluators", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "formal-recognition-runner-"));
  const artifactDirectory = path.join(directory, "artifacts");
  const reportPath = path.join(directory, "report.md");
  try {
    const dependencies = await createProductionDependencies({ artifactDirectory, reportPath });
    const result = await runSpike(dependencies);

    expect(result.exitCode).toBe(1);
    expect(result.summary).toMatchObject({
      decision: "multi-prototype-rejected",
      chromiumFormal: { passed: false },
      wholeScreenHoldout: { passed: false },
      compatibility: {
        chromium: { compatibility: "not-run" },
        firefox: { compatibility: "not-run" },
        webkit: { compatibility: "not-run" },
        sharp: { compatibility: "not-run" },
      },
    });
    expect(result.summary.chromiumFormal.candidateCases).toHaveLength(16);
    expect(result.summary.chromiumFormal.candidateCases.every((item) => item.elapsedMs >= 0)).toBe(true);
    expect(JSON.parse(await readFile(path.join(artifactDirectory, "summary.json"), "utf8"))).toMatchObject({
      decision: "multi-prototype-rejected",
    });
    expect(JSON.parse(await readFile(
      path.join(artifactDirectory, "checkpoints", "candidate.json"),
      "utf8",
    ))).toMatchObject({ status: "rejected" });
    expect(JSON.parse(await readFile(
      path.join(artifactDirectory, "checkpoints", "folds.json"),
      "utf8",
    ))).toHaveLength(4);
    const candidateCaseFiles = await readdir(path.join(artifactDirectory, "candidate", "cases"));
    expect(candidateCaseFiles).toHaveLength(16);
    const sourceEvidence = JSON.parse(await readFile(
      path.join(artifactDirectory, "candidate", "cases", "0-source.json"),
      "utf8",
    ));
    expect(sourceEvidence).toMatchObject({
      browserVersion: result.summary.environment.chromiumVersion,
      derivative: {
        scale: 1,
        encoding: "source",
        browserVersion: result.summary.environment.chromiumVersion,
      },
    });
    expect(sourceEvidence.derivative.rgbaSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceEvidence.cells).toHaveLength(480);
    expect(sourceEvidence.cells[0]).toEqual(expect.objectContaining({
      index: 0,
      expectedLabel: expect.anything(),
      confidence: expect.any(Number),
      candidates: expect.any(Array),
      uncertain: true,
      correct: expect.any(Boolean),
    }));
    const report = await readFile(reportPath, "utf8");
    expect(report.match(/multi-prototype-rejected/g)).toHaveLength(1);
    expect(report).toContain(`Chromium: ${result.summary.environment.chromiumVersion}`);
    expect(report).toContain(`Calibration evaluated ${result.summary.candidate.calibration.evaluatedThresholdPairs}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);
