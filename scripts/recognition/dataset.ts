import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { BrowserDerivativeName } from "../../test/recognition/browser-derive.js";

export const CASE_NAMES: readonly BrowserDerivativeName[] = ["source", "canvas-scale-075", "canvas-scale-125", "canvas-jpeg-q75"];
export const LABELS = ["#", ".", "F", "1", "2", "3", "4", "5", "6", "7", "8"] as const;
export type Split = "regression" | "train" | "calibration" | "evaluation";
export type ExpectedStage = "direct" | "fallback" | "source-revalidation-rejected" | "grid-required" | "reject-or-review";
export interface DatasetFixture {
  id: string;
  group: string;
  // Same game/capture sequence, recapture, crop, or processed source shares one family.
  family: string;
  split: Split;
  kind: "positive" | "negative";
  theme: string;
  source: { path: string; sha256: string };
  truth: { path: string; sha256: string };
  provenance: { origin: string; license: string; rights: "confirmed" | "pending"; publication: "allowed" | "pending"; captureConditions: string };
  reviews: { reviewer: string; truthSha256: string }[];
  scanline6Indices: number[] | null;
  expectedStages: Record<BrowserDerivativeName, ExpectedStage>;
}
export interface DatasetManifest { version: 1; fixtures: DatasetFixture[] }
export interface AnnotatedFixture { fixture: DatasetFixture; cells: string[]; columns: number; rows: number }
export interface DatasetIssue { code: string; subject: string; detail: string }
export interface PositiveCoverage {
  groups: number;
  labels: Record<string, { cells: number; groups: number }>;
  scanline6: { present: number; absent: number };
}
export interface CoverageReport {
  status: "ready-for-fixture-review" | "next-cell-recognition-blocked";
  issues: DatasetIssue[];
  positive: Record<Exclude<Split, "regression">, PositiveCoverage>;
  negative: Record<"calibration" | "evaluation", { groups: number; unknownCells: number }>;
}

export function auditCoverage(fixtures: readonly AnnotatedFixture[]): CoverageReport {
  const empty = (): PositiveCoverage => ({ groups: 0, labels: Object.fromEntries(LABELS.map((label) => [label, { cells: 0, groups: 0 }])), scanline6: { present: 0, absent: 0 } });
  const report: CoverageReport = { status: "ready-for-fixture-review", issues: [], positive: { train: empty(), calibration: empty(), evaluation: empty() }, negative: { calibration: { groups: 0, unknownCells: 0 }, evaluation: { groups: 0, unknownCells: 0 } } };
  const issue = (code: string, subject: string, detail: string): void => { report.issues.push({ code, subject, detail }); };
  const groupCount = (entries: readonly AnnotatedFixture[]): number => new Set(entries.map(({ fixture }) => fixture.group)).size;
  const identities = new Map<string, DatasetFixture>();
  const ids = new Set<string>();
  for (const { fixture, cells } of fixtures) {
    if (ids.has(fixture.id)) issue("duplicate-id", fixture.id, "Fixture IDs must be unique.");
    ids.add(fixture.id);
    for (const identity of [`group:${fixture.group}`, `family:${fixture.family}`, `source:${fixture.source.sha256}`]) {
      const previous = identities.get(identity);
      if (previous && (previous.group !== fixture.group || previous.split !== fixture.split || previous.kind !== fixture.kind)) {
        issue("split-leakage", fixture.id, `${identity} is shared with ${previous.id} across groups, splits or kinds.`);
      }
      identities.set(identity, fixture);
    }
    if (fixture.provenance.rights !== "confirmed" || fixture.provenance.publication !== "allowed") {
      issue("rights-unconfirmed", fixture.id, "Source rights and public redistribution must both be confirmed.");
    }
    const reviewers = new Set(fixture.reviews.filter((review) => review.truthSha256 === fixture.truth.sha256).map((review) => review.reviewer.trim()));
    reviewers.delete("");
    if (reviewers.size < 2) issue("truth-unreviewed", fixture.id, "Two distinct reviewers must confirm the current truth hash.");
    if (fixture.scanline6Indices === null) {
      issue("scanline-unannotated", fixture.id, "Annotate scanline-bearing digit 6 cell indices, or an explicit empty list.");
    } else if (new Set(fixture.scanline6Indices).size !== fixture.scanline6Indices.length || fixture.scanline6Indices.some((index) => !Number.isInteger(index) || index < 0 || cells[index] !== "6")) {
      issue("scanline-invalid", fixture.id, "Scanline indices must uniquely refer to digit 6 source cells.");
    }
    if (fixture.kind === "negative" && fixture.split !== "regression" && fixture.split !== "calibration" && fixture.split !== "evaluation") {
      issue("negative-split-invalid", fixture.id, "Negative fixtures belong only to calibration or evaluation.");
    }
    if (fixture.kind === "negative" && !cells.includes("?")) issue("unknown-unannotated", fixture.id, "Negative truth must annotate unknown cells as ?.");
  }

  for (const [split, minimum] of [["train", 6], ["calibration", 3], ["evaluation", 3]] as const) {
    const entries = fixtures.filter(({ fixture }) => fixture.split === split && fixture.kind === "positive");
    const summary = report.positive[split];
    summary.groups = groupCount(entries);
    if (summary.groups < minimum) issue("coverage-incomplete", split, `Positive groups ${summary.groups}/${minimum}.`);
    for (const label of LABELS) {
      // Identical sources within a group do not increase source cell counts.
      const uniqueSources = [...new Map(entries.map((entry) => [entry.fixture.source.sha256, entry])).values()];
      const cells = uniqueSources.reduce((count, entry) => count + entry.cells.filter((cell) => cell === label).length, 0);
      const groups = groupCount(entries.filter((entry) => entry.cells.includes(label)));
      summary.labels[label] = { cells, groups };
      if (cells < 10 || groups < 3) issue("coverage-incomplete", `${split}:${label}`, `Source cells ${cells}/10, independent groups ${groups}/3.`);
    }
    summary.scanline6.present = groupCount(entries.filter(({ fixture }) => (fixture.scanline6Indices?.length ?? 0) > 0));
    summary.scanline6.absent = groupCount(entries.filter(({ fixture, cells }) => fixture.scanline6Indices !== null && cells.some((cell, index) => cell === "6" && !fixture.scanline6Indices!.includes(index))));
    for (const condition of ["present", "absent"] as const) {
      if (summary.scanline6[condition] < 3) issue("coverage-incomplete", `${split}:6:scanline-${condition}`, `Independent groups ${summary.scanline6[condition]}/3.`);
    }
  }
  for (const split of ["calibration", "evaluation"] as const) {
    const entries = fixtures.filter(({ fixture }) => fixture.split === split && fixture.kind === "negative");
    const uniqueSources = [...new Map(entries.map((entry) => [entry.fixture.source.sha256, entry])).values()];
    const summary = report.negative[split];
    summary.groups = groupCount(entries);
    summary.unknownCells = uniqueSources.reduce((count, { cells }) => count + cells.filter((cell) => cell === "?").length, 0);
    if (summary.groups < 3 || summary.unknownCells < 30) issue("coverage-incomplete", `${split}:negative`, `Independent groups ${summary.groups}/3, unknown source cells ${summary.unknownCells}/30.`);
  }
  const training = fixtures.filter(({ fixture }) => fixture.split === "train" && fixture.kind === "positive");
  for (const group of new Set(training.map(({ fixture }) => fixture.group))) {
    for (const label of LABELS) {
      if (!training.some((entry) => entry.fixture.group !== group && entry.cells.includes(label))) {
        issue("fold-label-missing", `holdout:${group}:${label}`, "Label is missing from the remaining training groups.");
      }
    }
  }
  if (report.issues.length > 0) report.status = "next-cell-recognition-blocked";
  return report;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${subject}: expected object.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid ${subject}: expected nonempty string.`);
  return value;
}
function choice(value: unknown, allowed: readonly string[], subject: string): void {
  if (!allowed.includes(string(value, subject))) throw new Error(`Invalid ${subject}.`);
}
function hash(value: unknown, subject: string): void {
  if (!/^[a-f0-9]{64}$/.test(string(value, subject))) throw new Error(`Invalid ${subject}: expected SHA-256.`);
}

export function parseDatasetManifest(value: unknown): DatasetManifest {
  const manifest = object(value, "manifest");
  if (manifest.version !== 1 || !Array.isArray(manifest.fixtures)) throw new Error("Invalid manifest version or fixtures.");
  for (const value of manifest.fixtures) {
    const entry = object(value, "fixture");
    for (const field of ["id", "group", "family", "theme"]) string(entry[field], field);
    choice(entry.split, ["regression", "train", "calibration", "evaluation"], "split");
    choice(entry.kind, ["positive", "negative"], "kind");
    for (const field of ["source", "truth"]) {
      const asset = object(entry[field], field);
      string(asset.path, `${field}.path`);
      hash(asset.sha256, `${field}.sha256`);
    }
    const provenance = object(entry.provenance, "provenance");
    for (const field of ["origin", "license", "captureConditions"]) string(provenance[field], `provenance.${field}`);
    choice(provenance.rights, ["confirmed", "pending"], "rights");
    choice(provenance.publication, ["allowed", "pending"], "publication");
    if (!Array.isArray(entry.reviews)) throw new Error("Invalid reviews.");
    for (const value of entry.reviews) {
      const review = object(value, "review");
      string(review.reviewer, "reviewer");
      hash(review.truthSha256, "review.truthSha256");
    }
    if (entry.scanline6Indices !== null && (!Array.isArray(entry.scanline6Indices) || entry.scanline6Indices.some((index: unknown) => !Number.isInteger(index)))) throw new Error("Invalid scanline6Indices.");
    const stages = object(entry.expectedStages, "expectedStages");
    for (const name of CASE_NAMES) {
      const allowed: readonly ExpectedStage[] = entry.kind === "negative" ? ["reject-or-review"] : entry.split === "regression" ? ["direct", "fallback", "source-revalidation-rejected"] : ["grid-required"];
      choice(stages[name], allowed, `expectedStages.${name}`);
    }
  }
  return value as DatasetManifest;
}

export async function containedPath(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative)) throw new Error(`Path outside dataset root: ${relative}`);
  const realRoot = await realpath(root);
  const candidate = path.resolve(realRoot, relative);
  const assertInside = (target: string): void => {
    const rel = path.relative(realRoot, target);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`Path outside dataset root: ${relative}`);
  };
  assertInside(candidate);
  const resolved = await realpath(candidate);
  assertInside(resolved);
  return resolved;
}

// Curator audit: reads all truth, including holdout. Never call from model fitting.
export async function loadDataset(root: string, manifestPath: string): Promise<{ manifest: DatasetManifest; fixtures: AnnotatedFixture[]; manifestSha256: string }> {
  const bytes = await readFile(await containedPath(root, manifestPath));
  const manifest = parseDatasetManifest(JSON.parse(bytes.toString("utf8")));
  const fixtures: AnnotatedFixture[] = [];
  for (const fixture of manifest.fixtures) {
    const source = await readFile(await containedPath(root, fixture.source.path));
    const truthBytes = await readFile(await containedPath(root, fixture.truth.path));
    if (sha256(source) !== fixture.source.sha256) throw new Error(`Source hash mismatch: ${fixture.id}`);
    if (sha256(truthBytes) !== fixture.truth.sha256) throw new Error(`Truth hash mismatch: ${fixture.id}`);
    const truth = object(JSON.parse(truthBytes.toString("utf8")), `truth ${fixture.id}`);
    if (truth.columns !== 30 || truth.rows !== 16 || !Array.isArray(truth.board) || truth.board.length !== 16) throw new Error(`Invalid 30x16 truth: ${fixture.id}`);
    const cells = truth.board.flatMap((row: unknown) => {
      if (typeof row !== "string" || row.length !== 30) throw new Error(`Invalid truth row: ${fixture.id}`);
      return [...row];
    });
    if (cells.some((cell) => !(LABELS as readonly string[]).includes(cell) && !(fixture.kind === "negative" && cell === "?"))) throw new Error(`Invalid truth label: ${fixture.id}`);
    const metadata = await sharp(source).metadata();
    if (truth.expectedBoardBounds !== null || fixture.kind === "positive") {
      const bounds = object(truth.expectedBoardBounds, "expectedBoardBounds");
      for (const key of ["x", "y", "width", "height"]) {
        if (typeof bounds[key] !== "number" || !Number.isFinite(bounds[key])) throw new Error(`Invalid truth bounds: ${fixture.id}`);
      }
      const { x, y, width, height } = bounds as { x: number; y: number; width: number; height: number };
      if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > metadata.width! || y + height > metadata.height!) throw new Error(`Truth bounds outside image: ${fixture.id}`);
    }
    fixtures.push({ fixture, cells, columns: 30, rows: 16 });
  }
  return { manifest, fixtures, manifestSha256: sha256(bytes) };
}
