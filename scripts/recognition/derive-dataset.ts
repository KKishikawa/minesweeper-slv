import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch, cpus, platform, release } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { recreateArtifactDirectory } from "../artifact-directory.js";
import { containedPath, parseDatasetManifest, sha256 } from "./dataset.js";
import { deriveFixtureEvidence, FixtureEvidenceError, type CaseEvidence } from "./dataset-evidence.js";
import type { BrowserEngine } from "../../test/recognition/browser-derive.js";

// Transformation-only evidence: never parses holdout truth or runs a classifier.
try {
  const engine = process.argv[2] ?? "chromium";
  if (!["chromium", "firefox", "webkit"].includes(engine) || process.argv.length > 4) throw new Error("Usage: derive-dataset.ts [chromium|firefox|webkit] [manifest-path]");
  const root = process.cwd();
  const manifestPath = process.argv[3] ?? "test/recognition/dataset/manifest.json";
  const manifestBytes = await readFile(await containedPath(root, manifestPath));
  const manifest = parseDatasetManifest(JSON.parse(manifestBytes.toString("utf8")));
  const directory = await recreateArtifactDirectory(root, ["test", "artifacts", "recognition-dataset", `${engine}-${randomUUID()}`]);
  const lock = await readFile("package-lock.json");
  const require = createRequire(import.meta.url);
  const playwrightVersion = (require("playwright/package.json") as { version: string }).version;
  const report = {
    status: "matrix-incomplete", role: engine === "chromium" ? "formal" : "reference",
    fixtureReadiness: "not-assessed", recognition: "not-run", manifestSha256: sha256(manifestBytes),
    environment: { node: process.version, os: platform(), osRelease: release(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown", lockfileSha256: sha256(lock), playwright: playwrightVersion, sharp: sharp.versions.sharp, imageLibraries: sharp.versions },
    manifest, cases: [] as CaseEvidence[], failures: [] as { id: string; detail: string }[],
  };
  await writeFile(path.join(directory, "manifest.json"), manifestBytes, { flag: "wx" });
  for (const [index, fixture] of manifest.fixtures.entries()) {
    try {
      // Validate the frozen truth bytes without interpreting labels.
      if (sha256(await readFile(await containedPath(root, fixture.truth.path))) !== fixture.truth.sha256) throw new Error(`Truth hash mismatch: ${fixture.id}`);
      const cases = await deriveFixtureEvidence(root, fixture, engine as BrowserEngine, directory, `fixture-${index}`);
      report.cases.push(...cases);
      for (const entry of cases) if (!entry.reproducible) report.failures.push({ id: entry.id, detail: "Pixel hash, dimensions or browser version changed between fresh runs." });
    } catch (error) {
      if (error instanceof FixtureEvidenceError) report.cases.push(...error.cases);
      report.failures.push({ id: fixture.id, detail: error instanceof Error ? error.message : String(error) });
    }
    await writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  report.status = manifest.fixtures.length > 0 && report.failures.length === 0 && report.cases.length === manifest.fixtures.length * 4 ? "matrix-reproducible" : "matrix-failed";
  await writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, directory, cases: report.cases.length, failures: report.failures })}\n`);
  process.exitCode = report.status === "matrix-reproducible" ? 0 : 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: "matrix-failed", detail: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 2;
}
