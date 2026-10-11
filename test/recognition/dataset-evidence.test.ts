import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import * as browserDerive from "./browser-derive.js";
import { deriveFixtureEvidence } from "../../scripts/recognition/dataset-evidence.js";
import { sha256, type DatasetFixture } from "../../scripts/recognition/dataset.js";

it("records rounded dimensions, reproducible pixels and lossless output from three fresh Chromium runs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dataset-evidence-"));
  try {
    const source = await sharp({ create: { width: 5, height: 3, channels: 4, background: "#2468ab" } }).png().toBuffer();
    await sharp(source).toFile(path.join(directory, "source.png"));
    const fixture = { id: "test-only", source: { path: "source.png", sha256: sha256(source) }, expectedStages: {
      source: "grid-required", "canvas-scale-075": "grid-required", "canvas-scale-125": "grid-required", "canvas-jpeg-q75": "grid-required",
    } } satisfies Pick<DatasetFixture, "id" | "source" | "expectedStages">;
    const cases = await deriveFixtureEvidence(directory, fixture, "chromium", directory, "fixture-0");
    expect(cases.map(({ width, height }) => [width, height])).toEqual([[5, 3], [4, 2], [6, 4], [5, 3]]);
    for (const entry of cases) {
      expect(entry.reproducible).toBe(true);
      expect(entry.runs).toHaveLength(3);
      expect(entry.role).toBe("formal");
      expect(entry.parameters.imageSmoothingEnabled).toBe(true);
      const png = await readFile(path.join(directory, entry.file));
      expect(sha256(png)).toBe(entry.pngSha256);
      const raw = await sharp(png).ensureAlpha().raw().toBuffer();
      expect(sha256(raw)).toBe(entry.rgbaSha256);
    }
    await expect(deriveFixtureEvidence(directory, { ...fixture, source: { ...fixture.source, sha256: "0".repeat(64) } }, "chromium", directory, "tampered"))
      .rejects.toThrow(/hash mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

it("preserves completed run evidence when a later browser run fails", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dataset-partial-evidence-"));
  const original = browserDerive.deriveBrowserImages;
  // Real run first; inject only the unavailable-browser fault on the next launch.
  const launch = vi.spyOn(browserDerive, "deriveBrowserImages")
    .mockImplementationOnce(original).mockRejectedValueOnce(new Error("second browser launch unavailable"));
  try {
    const source = await sharp({ create: { width: 5, height: 3, channels: 4, background: "#abcdef" } }).png().toBuffer();
    await sharp(source).toFile(path.join(directory, "source.png"));
    const fixture = { id: "partial", source: { path: "source.png", sha256: sha256(source) }, expectedStages: {
      source: "grid-required", "canvas-scale-075": "grid-required", "canvas-scale-125": "grid-required", "canvas-jpeg-q75": "grid-required",
    } } satisfies Pick<DatasetFixture, "id" | "source" | "expectedStages">;
    await expect(deriveFixtureEvidence(directory, fixture, "chromium", directory, "partial"))
      .rejects.toMatchObject({ cases: expect.arrayContaining([expect.objectContaining({ id: "partial:source", reproducible: false, runs: [expect.objectContaining({ width: 5, height: 3 })] })]) });
    const checkpoint = JSON.parse(await readFile(path.join(directory, "partial-progress.json"), "utf8"));
    expect(checkpoint.cases).toHaveLength(4);
    const png = await readFile(path.join(directory, checkpoint.cases[0].file));
    expect(sha256(png)).toBe(checkpoint.cases[0].pngSha256);
  } finally {
    launch.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
