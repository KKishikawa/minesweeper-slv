import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditCoverage, loadDataset, parseDatasetManifest, type AnnotatedFixture, type DatasetManifest } from "../../scripts/recognition/dataset.js";

// These are test-only annotations, never independent evaluation data.
function completeDataset(): AnnotatedFixture[] {
  const fixtures: AnnotatedFixture[] = [];
  for (const [split, count] of [["train", 6], ["calibration", 3], ["evaluation", 3]] as const) {
    for (let n = 0; n < count; n++) {
      const id = `${split}-${n}`;
      const cells = "#.F12345678".split("").flatMap((label) => Array<string>(label === "6" ? 20 : 10).fill(label));
      while (cells.length < 480) cells.push("#");
      const sixStart = cells.indexOf("6");
      fixtures.push({
        fixture: {
          id, group: id, family: id, split, kind: "positive", theme: "test-only",
          source: { path: `${id}.png`, sha256: createHash("sha256").update(id).digest("hex") },
          truth: { path: `${id}.json`, sha256: "a".repeat(64) },
          provenance: { origin: "test-only", license: "test-only", rights: "confirmed", publication: "allowed", captureConditions: "test-only" },
          reviews: [{ reviewer: "one", truthSha256: "a".repeat(64) }, { reviewer: "two", truthSha256: "a".repeat(64) }],
          scanline6Indices: Array.from({ length: 10 }, (_, i) => sixStart + i),
          expectedStages: { source: "grid-required", "canvas-scale-075": "grid-required", "canvas-scale-125": "grid-required", "canvas-jpeg-q75": "grid-required" },
        },
        cells, columns: 30, rows: 16,
      });
    }
  }
  for (const split of ["calibration", "evaluation"] as const) {
    for (let n = 0; n < 3; n++) {
      const base = completePositive(fixtures);
      const id = `${split}-negative-${n}`;
      fixtures.push({ ...base, cells: [...Array<string>(10).fill("?"), ...Array<string>(470).fill("#")], fixture: {
        ...base.fixture, id, group: id, family: id, split, kind: "negative", scanline6Indices: [],
        source: { path: `${id}.png`, sha256: createHash("sha256").update(id).digest("hex") },
        expectedStages: { source: "reject-or-review", "canvas-scale-075": "reject-or-review", "canvas-scale-125": "reject-or-review", "canvas-jpeg-q75": "reject-or-review" },
      } });
    }
  }
  return fixtures;
}

function completePositive(fixtures: AnnotatedFixture[]): AnnotatedFixture {
  const first = fixtures[0];
  if (!first) throw new Error("test setup is empty");
  return first;
}

describe("next recognition dataset gate", () => {
  it("accepts full independent label, scanline and negative coverage", () => {
    const report = auditCoverage(completeDataset());
    expect(report.status).toBe("ready-for-fixture-review");
    expect(report.issues).toEqual([]);
    expect(report.positive.evaluation.labels["8"]).toEqual({ cells: 30, groups: 3 });
    expect(report.negative.evaluation).toEqual({ groups: 3, unknownCells: 30 });
  });

  it("does not count regression or additional captures as independent groups", () => {
    const fixtures = completeDataset();
    const evaluation = fixtures.filter(({ fixture }) => fixture.split === "evaluation" && fixture.kind === "positive");
    for (const entry of evaluation) {
      entry.fixture.group = "same-group";
      entry.fixture.family = "same-group";
    }
    const regression = structuredClone(evaluation[0]!);
    regression.fixture = { ...regression.fixture, id: "regression", group: "regression", family: "regression", split: "regression", source: { path: "regression.png", sha256: "b".repeat(64) } };
    const report = auditCoverage([...fixtures, regression]);
    expect(report.status).toBe("next-cell-recognition-blocked");
    expect(report.positive.evaluation.groups).toBe(1);
    expect(report.issues.some(({ code }) => code === "coverage-incomplete")).toBe(true);
  });

  it("rejects a shared family or copied source across splits", () => {
    const fixtures = completeDataset();
    const training = fixtures[0]!;
    const evaluation = fixtures.find(({ fixture }) => fixture.split === "evaluation")!;
    evaluation.fixture.family = training.fixture.family;
    evaluation.fixture.source.sha256 = training.fixture.source.sha256;
    expect(auditCoverage(fixtures).issues.filter(({ code }) => code === "split-leakage")).not.toHaveLength(0);
  });

  it("blocks unconfirmed rights, stale truth reviews and unannotated scanlines", () => {
    const fixtures = completeDataset();
    fixtures[0]!.fixture.provenance.rights = "pending";
    fixtures[1]!.fixture.reviews[1]!.truthSha256 = "b".repeat(64);
    fixtures[2]!.fixture.scanline6Indices = null;
    const codes = auditCoverage(fixtures).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining(["rights-unconfirmed", "truth-unreviewed", "scanline-unannotated"]));
  });

  it("reports per-label omissions and label disappearance in training folds", () => {
    const fixtures = completeDataset();
    for (const entry of fixtures) {
      if (entry.fixture.split === "train" && entry.fixture.id !== "train-0") entry.cells = entry.cells.map((cell) => cell === "8" ? "#" : cell);
    }
    const report = auditCoverage(fixtures);
    expect(report.positive.train.labels["8"]!.groups).toBe(1);
    expect(report.issues.some(({ code }) => code === "fold-label-missing")).toBe(true);
  });

  it("rejects malformed metadata and inappropriate case expectations before evaluation", () => {
    const fixture = completeDataset()[0]!.fixture;
    for (const override of [
      { split: "typo" }, { source: { path: "image.png", sha256: "not-a-hash" } },
      { scanline6Indices: ["0"] }, { reviews: [{ reviewer: "", truthSha256: "a".repeat(64) }] },
      { expectedStages: { ...fixture.expectedStages, source: "source-revalidation-rejected" } },
    ]) {
      expect(() => parseDatasetManifest({ version: 1, fixtures: [{ ...fixture, ...override }] })).toThrow(/Invalid/);
    }
  });

  it("loads unchanged regression truth and detects source/truth tampering", async () => {
    const dataset = await loadDataset(process.cwd(), "test/recognition/dataset/manifest.json");
    expect(dataset.fixtures.map(({ fixture }) => fixture.id)).toEqual(["0", "1", "2", "3"]);
    expect(auditCoverage(dataset.fixtures).status).toBe("next-cell-recognition-blocked");
    const directory = await mkdtemp(path.join(tmpdir(), "recognition-dataset-"));
    try {
      const entry = structuredClone(dataset.manifest.fixtures[0]!);
      entry.source.path = "source.png";
      entry.truth.path = "truth.json";
      const manifest: DatasetManifest = { version: 1, fixtures: [entry] };
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
      await writeFile(path.join(directory, "source.png"), await readFile("test/resources/0.png"));
      await writeFile(path.join(directory, "truth.json"), "{}");
      await expect(loadDataset(directory, "manifest.json")).rejects.toThrow(/hash mismatch/);
      await writeFile(path.join(directory, "truth.json"), await readFile("test/recognition/ground-truth/0.json"));
      await symlink(path.resolve("test/resources/0.png"), path.join(directory, "outside-link.png"));
      entry.source.path = "outside-link.png";
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
      await expect(loadDataset(directory, "manifest.json")).rejects.toThrow(/outside/);
      entry.source.path = "source.png";
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
      await writeFile(path.join(directory, "source.png"), "tampered");
      await expect(loadDataset(directory, "manifest.json")).rejects.toThrow(/hash mismatch/);
      entry.source.path = "../outside.png";
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
      await expect(loadDataset(directory, "manifest.json")).rejects.toThrow(/outside/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
