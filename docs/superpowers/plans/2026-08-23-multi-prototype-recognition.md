# Multi-Prototype Cell Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and evaluate a deterministic multi-prototype cell classifier that passes the formal Chromium source/resize/JPEG matrix and whole-screen holdout checks without wrong certain cells.

**Architecture:** Keep the existing RGBA grid, crop, normalization, and feature pipeline. Generate a globally scaled, per-label prototype bank offline; classify against distinct labels with shared relative-margin and absolute-distance gates; evaluate Chromium formally and Firefox, WebKit, and Sharp informationally.

**Tech Stack:** TypeScript ES modules, Node.js 22.12+, Vitest, Playwright Chromium/Firefox/WebKit, Sharp diagnostics, Canvas APIs, typed arrays, Vite-compatible generated TypeScript data.

**Spec:** `docs/superpowers/specs/2026-08-23-multi-prototype-recognition-design.md`

## Global Constraints

- Chromium source plus Canvas 0.75x, Canvas 1.25x, and Canvas JPEG quality 0.75 are the only formal engine cases.
- Firefox, Playwright WebKit, and Sharp/Lanczos3 results are compatibility information and never override the Chromium adoption result.
- Formal final-bank and leave-one-screen-out evaluation require zero wrong certain cells and no more than four uncertain cells per transformed or held-out image.
- Final-bank source images require zero uncertain cells.
- Digits 7 and 8 are unsupported and unverified; do not claim reliable recognition or rejection.
- User-entered columns, rows, and total mines remain authoritative.
- Runtime code receives no fixture identifier, filename, expected label, browser engine, or image-specific coordinate.
- Use at most 12 deterministic prototypes per observed label and one shared threshold pair within each evaluation.
- Do not add a neural network, bundled trained model, OpenCV.js, remote service, OS-specific image API, or runtime Playwright/Sharp dependency.
- Preserve the existing grid work budget and safe artifact-directory cleanup.
- Generated artifacts live only under `test/artifacts/recognition/` and remain ignored.
- Do not modify truth labels to make an acceptance test pass.
- Do not inspect or mention local-only reference material in committed files, comments, commit messages, or review text.
- Preserve the repository's commit-signing configuration; never use an unsigned fallback.

---

### Task 1: Generate Deterministic Browser Canvas Derivatives

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `test/recognition/browser-derive.ts`
- Test: `test/recognition/browser-derive.test.ts`

**Interfaces:**
- Consumes: fixture image paths and `PixelImage`
- Produces: `BrowserEngine`、`BrowserDerivativeName`、`BrowserDerivedImage`、`deriveBrowserImages()`

- [ ] **Step 1: Install Playwright as a spike-only development dependency**

Run:

```bash
npm install --save-dev playwright
npx playwright install chromium firefox webkit
```

Add these scripts through the package edit produced by `npm install`:

```json
{
  "scripts": {
    "browsers:install:spike": "playwright install chromium firefox webkit"
  }
}
```

Expected: `package-lock.json` records an exact Playwright version; no production dependency is added.

- [ ] **Step 2: Write the failing Chromium derivative test**

Create `test/recognition/browser-derive.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveBrowserImages } from "./browser-derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";

function rgbaHash(data: Uint8ClampedArray): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("browser Canvas derivatives", () => {
  it("creates the formal Chromium matrix deterministically", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");
    const first = await deriveBrowserImages("chromium", fixture.imagePath);
    const second = await deriveBrowserImages("chromium", fixture.imagePath);

    expect(first.map((item) => item.name)).toEqual([
      "source", "canvas-scale-075", "canvas-scale-125", "canvas-jpeg-q75",
    ]);
    expect(first.map((item) => [item.image.width, item.image.height])).toEqual([
      [2560, 1440], [1920, 1080], [3200, 1800], [2560, 1440],
    ]);
    expect(first.map((item) => rgbaHash(item.image.data)))
      .toEqual(second.map((item) => rgbaHash(item.image.data)));
    expect(first.every((item) => item.engine === "chromium" && item.browserVersion.length > 0)).toBe(true);
  }, 120_000);
});
```

- [ ] **Step 3: Run the test to verify RED**

Run:

```bash
npm test -- test/recognition/browser-derive.test.ts
```

Expected: FAIL because `browser-derive.ts` does not exist.

- [ ] **Step 4: Implement the browser derivative helper**

Create `test/recognition/browser-derive.ts` with these exact public contracts:

```ts
import { chromium, firefox, webkit } from "playwright";
import type { PixelImage } from "../../src/recognition/types.js";

export type BrowserEngine = "chromium" | "firefox" | "webkit";
export type BrowserDerivativeName =
  | "source"
  | "canvas-scale-075"
  | "canvas-scale-125"
  | "canvas-jpeg-q75";

export interface BrowserDerivedImage {
  readonly engine: BrowserEngine;
  readonly browserVersion: string;
  readonly name: BrowserDerivativeName;
  readonly scale: number;
  readonly encoding: "source" | "canvas-rgba" | "canvas-jpeg-075";
  readonly image: PixelImage;
}
```

Implement `deriveBrowserImages(engine, sourcePath)` by:

1. Reading the source bytes in Node and passing a base64 data URL to a blank page.
2. Decoding with `createImageBitmap(await (await fetch(dataUrl)).blob())`.
3. Drawing source and scale variants with `canvas.getContext("2d")!.drawImage(...)`.
4. Encoding the JPEG case with `canvas.toBlob(resolve, "image/jpeg", 0.75)`, decoding that blob, and reading its RGBA pixels from a second canvas.
5. Returning copied `Uint8ClampedArray` values from `ImageData`.
6. Closing the browser in `finally`.

Select the Playwright browser type with an exhaustive function and reject unknown values without fallback:

```ts
function browserType(engine: BrowserEngine): typeof chromium | typeof firefox | typeof webkit {
  switch (engine) {
    case "chromium": return chromium;
    case "firefox": return firefox;
    case "webkit": return webkit;
  }
}

export async function deriveBrowserImages(
  engine: BrowserEngine,
  sourcePath: string,
): Promise<readonly BrowserDerivedImage[]>;
```

Do not write derivatives to tracked paths and do not use screenshots as pixel transport.

- [ ] **Step 5: Run browser and type verification**

Run:

```bash
npm test -- test/recognition/browser-derive.test.ts
npm run typecheck
```

Expected: 1 test PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the browser derivative harness**

```bash
git add package.json package-lock.json test/recognition/browser-derive.ts test/recognition/browser-derive.test.ts
git commit -m "test: add browser canvas derivatives"
```

---

### Task 2: Build a Deterministic Multi-Prototype Geometry

**Files:**
- Create: `src/recognition/prototype-bank.ts`
- Create: `scripts/recognition/prototype-builder.ts`
- Test: `test/recognition/prototype-builder.test.ts`

**Interfaces:**
- Consumes: `LabeledFeatureSample[]`, `FEATURE_LENGTH`
- Produces: `FeatureScaler`、`BankPrototype`、`PrototypeGeometry`、`PrototypeBuilderOptions`、`buildPrototypeGeometry()`、`scaleFeatures()`

- [ ] **Step 1: Write failing scaler and clustering tests**

Create `test/recognition/prototype-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import {
  buildPrototypeGeometry,
  type PrototypeBuilderOptions,
} from "../../scripts/recognition/prototype-builder.js";
import type { CellLabel } from "../../src/recognition/types.js";

function sample(label: CellLabel, value: number) {
  return { label, features: new Float64Array(FEATURE_LENGTH).fill(value) };
}

const options: PrototypeBuilderOptions = {
  maxPrototypesPerLabel: 2,
  iterations: 4,
  scaleFloor: 1e-6,
};

describe("multi-prototype builder", () => {
  it("is deterministic across input order and caps each label", () => {
    const samples = [sample("closed", 0), sample("closed", 1), sample("closed", 9), sample("flag", 20)];
    const first = buildPrototypeGeometry(samples, options);
    const reversed = buildPrototypeGeometry([...samples].reverse(), options);
    expect(first).toEqual(reversed);
    expect(first.prototypes.filter((item) => item.label === "closed")).toHaveLength(2);
    expect(first.prototypes.filter((item) => item.label === "flag")).toHaveLength(1);
    expect(first.prototypes.some((item) => item.label === 7 || item.label === 8)).toBe(false);
  });

  it("fits one finite global scaler for every label", () => {
    const result = buildPrototypeGeometry([sample("empty", 2), sample(1, 4)], options);
    expect(result.scaler.center).toHaveLength(FEATURE_LENGTH);
    expect(result.scaler.scale).toHaveLength(FEATURE_LENGTH);
    expect([...result.scaler.scale].every((value) => Number.isFinite(value) && value >= 1e-6)).toBe(true);
    expect(result.prototypes.flatMap((item) => [...item.vector]).every(Number.isFinite)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npm test -- test/recognition/prototype-builder.test.ts
```

Expected: FAIL because the builder and new contracts do not exist.

- [ ] **Step 3: Add parallel multi-prototype contracts without breaking the historical spike**

Create `src/recognition/prototype-bank.ts` to export:

```ts
export interface FeatureScaler {
  readonly center: Float64Array;
  readonly scale: Float64Array;
}

export interface BankPrototype {
  readonly label: CellLabel;
  readonly vector: Float64Array;
}

export interface PrototypeGeometry {
  readonly formatVersion: 1;
  readonly featureVersion: "features-v1";
  readonly scaler: FeatureScaler;
  readonly prototypes: readonly BankPrototype[];
}

export interface ConfidenceThresholds {
  readonly relativeMargin: number;
  readonly absoluteDistance: number;
}

export interface PrototypeBank extends PrototypeGeometry {
  readonly thresholds: ConfidenceThresholds;
}

export const CELL_LABEL_ORDER: readonly CellLabel[];
export function scaleFeatures(features: Float64Array, scaler: FeatureScaler): Float64Array;
export function validatePrototypeGeometry(geometry: PrototypeGeometry): void;
export function validatePrototypeBank(bank: PrototypeBank): void;
```

Validation rejects wrong feature lengths, empty geometry, non-finite values, non-positive scales, more than 12 prototypes for one label, unsupported format/feature versions, and thresholds outside these domains:

```ts
0 <= relativeMargin && relativeMargin <= 1
0 <= absoluteDistance && Number.isFinite(absoluteDistance)
```

The builder continues to consume the structurally compatible `LabeledFeatureSample` exported by the historical `src/recognition/prototypes.ts`. Do not modify the historical single-prototype runtime in this task; the new spike remains parallel until formal adoption.

- [ ] **Step 4: Implement the deterministic builder**

Create `scripts/recognition/prototype-builder.ts`:

```ts
export interface PrototypeBuilderOptions {
  readonly maxPrototypesPerLabel: number;
  readonly iterations: number;
  readonly scaleFloor: number;
}

export const DEFAULT_PROTOTYPE_BUILDER_OPTIONS: PrototypeBuilderOptions = {
  maxPrototypesPerLabel: 12,
  iterations: 8,
  scaleFloor: 1e-6,
};

export function buildPrototypeGeometry(
  samples: readonly LabeledFeatureSample[],
  options: PrototypeBuilderOptions = DEFAULT_PROTOTYPE_BUILDER_OPTIONS,
): PrototypeGeometry;
```

Implement these pure operations:

1. Validate all samples before allocation.
2. Compute global per-feature means and population standard deviations; clamp standard deviations to `scaleFloor`.
3. Scale all samples once.
4. Sort samples lexicographically by label and full scaled vector, providing stable tie-breaking independent of input order.
5. For each label, choose the first sorted sample, then repeatedly choose the sample with the greatest distance to its nearest center; break equal distances lexicographically.
6. Assign samples to the nearest center with center-index tie-breaking and update arithmetic centroids for exactly `iterations` rounds; retain the previous center for an empty cluster.
7. Stop adding centers if the greatest new-center distance is zero.
8. Sort final prototypes by stable label order and lexicographic vector order.

Use mean squared Euclidean distance in scaled feature space and reject invalid options with `RangeError`.

- [ ] **Step 5: Run builder, existing feature, and type verification**

Run:

```bash
npm test -- test/recognition/prototype-builder.test.ts test/recognition/classify.test.ts
npm run typecheck
```

Expected: new tests and the unchanged historical classification test PASS; TypeScript exits 0. The new builder is parallel and does not alter `buildPrototypeSet()`.

- [ ] **Step 6: Commit the deterministic builder**

```bash
git add src/recognition/prototype-bank.ts scripts/recognition/prototype-builder.ts test/recognition/prototype-builder.test.ts
git commit -m "feat: build deterministic prototype bank"
```

---

### Task 3: Classify Across Distinct Labels with Two Confidence Gates

**Files:**
- Create: `src/recognition/multi-classify.ts`
- Create: `src/recognition/multi-recognize.ts`
- Modify: `src/recognition/types.ts`
- Test: `test/recognition/multi-classify.test.ts`
- Test: `test/recognition/multi-recognize.test.ts`

**Interfaces:**
- Consumes: `PrototypeBank`, raw feature vector
- Produces: `MultiClassificationResult` with distinct-label candidates and `certain`; `recognizeBoardWithBank()` using bank thresholds

- [ ] **Step 1: Add failing distinct-label and absolute-distance tests**

Create `test/recognition/multi-classify.test.ts`. Include these complete helpers before the tests:

```ts
import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import { classifyCellWithBank } from "../../src/recognition/multi-classify.js";
import type { BankPrototype, PrototypeBank } from "../../src/recognition/prototype-bank.js";
import type { CellLabel } from "../../src/recognition/types.js";

function feature(value: number): Float64Array {
  return new Float64Array(FEATURE_LENGTH).fill(value);
}

function prototype(label: CellLabel, value: number): BankPrototype {
  return { label, vector: feature(value) };
}

function syntheticBank(input: {
  readonly prototypes: readonly BankPrototype[];
  readonly thresholds: PrototypeBank["thresholds"];
}): PrototypeBank {
  return {
    formatVersion: 1,
    featureVersion: "features-v1",
    scaler: { center: feature(0), scale: feature(1) },
    prototypes: input.prototypes,
    thresholds: input.thresholds,
  };
}

it("ranks distinct labels instead of sibling prototypes", () => {
  const bank = syntheticBank({
    prototypes: [prototype("flag", 0), prototype("flag", 0.1), prototype(3, 2)],
    thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
  });
  const result = classifyCellWithBank(new Float64Array(FEATURE_LENGTH), bank);
  expect(result.candidates.map((item) => item.label)).toEqual(["flag", 3]);
});

it("requires both the label margin and absolute distance", () => {
  const ambiguous = classifyCellWithBank(feature(0.45), syntheticBank({
    prototypes: [prototype(1, 0), prototype(2, 1)],
    thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
  }));
  const far = classifyCellWithBank(feature(100), syntheticBank({
    prototypes: [prototype(1, 0), prototype(2, 20)],
    thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
  }));
  expect(ambiguous.certain).toBe(false);
  expect(far.certain).toBe(false);
});

it("returns an uncertain null result for non-finite features", () => {
  const result = classifyCellWithBank(feature(Number.NaN), syntheticBank({
    prototypes: [prototype(1, 0), prototype(2, 1)],
    thresholds: { relativeMargin: 0.25, absoluteDistance: 10 },
  }));
  expect(result).toMatchObject({ label: null, certain: false, candidates: [] });
});
```

Create `test/recognition/multi-recognize.test.ts`. Reuse the existing synthetic grid-image helper from `test/recognition/grid.test.ts` by moving that helper to `test/recognition/synthetic-grid.ts`, then add a `recognizeBoardWithBank()` regression whose bank passes the relative gate but fails the absolute gate for every cell. Assert `needs-review` and all row-major indices. Keep `test/recognition/grid.test.ts` importing the moved helper so it remains behaviorally unchanged.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
npm test -- test/recognition/multi-classify.test.ts test/recognition/multi-recognize.test.ts
```

Expected: FAIL because the parallel classifier and recognizer do not exist.

- [ ] **Step 3: Implement distinct-label classification**

Create `src/recognition/multi-classify.ts` with:

```ts
export interface MultiClassificationResult {
  readonly label: CellLabel | null;
  readonly relativeMargin: number;
  readonly bestDistance: number;
  readonly certain: boolean;
  readonly candidates: readonly CellCandidate[];
}

export function classifyCellWithBank(features: Float64Array, bank: PrototypeBank): MultiClassificationResult;
```

Implementation:

1. Call `validatePrototypeBank(bank)`. If raw features contain a non-finite value, return `label: null`, empty candidates, `relativeMargin: 0`, `bestDistance: Infinity`, and `certain: false`; otherwise call `scaleFeatures()`.
2. Compute mean squared distance to every prototype.
3. Keep only the minimum distance for each label.
4. Sort by distance, then stable label order.
5. If there are no candidate labels, return the same null uncertain result. If there is exactly one, return its label with `relativeMargin: 0` and `certain: false`.
6. With at least two labels, calculate `relativeMargin = second.distance === 0 ? 0 : clamp(1 - best.distance / second.distance, 0, 1)`.
7. Set `certain` only when `relativeMargin >= bank.thresholds.relativeMargin` and `best.distance <= bank.thresholds.absoluteDistance`.

- [ ] **Step 4: Make recognition consume classifier certainty**

Create `src/recognition/multi-recognize.ts` by retaining the grid/crop/normalize loop from `recognize.ts` and exporting `RecognitionRequest`, `RecognitionResult`, and:

```ts
export function recognizeBoardWithBank(
  request: RecognitionRequest,
  bank: PrototypeBank,
): RecognitionResult;
```

In the parallel recognizer:

- call `classifyCellWithBank()`;
- widen `RecognizedCell.label` in `src/recognition/types.ts` to `CellLabel | null` and `RecognizedCell.candidates` to `readonly CellCandidate[]`;
- set `RecognizedCell.confidence` to `relativeMargin` for UI compatibility;
- append the index to `uncertainCellIndices` when `classification.certain` is false;
- preserve row-major processing and the existing result statuses.

Do not modify `classify.ts`, `recognize.ts`, or their historical tests in this task. Do not branch on browser engine, expected label, elapsed time, or cell position.

- [ ] **Step 5: Run classifier, recognition contract, and type verification**

Run:

```bash
npm test -- test/recognition/multi-classify.test.ts test/recognition/multi-recognize.test.ts test/recognition/classify.test.ts
npm run typecheck
```

Expected: parallel contract tests and the unchanged historical classification test PASS; TypeScript exits 0. The already-recorded historical mandatory acceptance failures may still appear only when the full suite is run.

- [ ] **Step 6: Commit runtime multi-prototype classification**

```bash
git add src/recognition/multi-classify.ts src/recognition/multi-recognize.ts src/recognition/types.ts test/recognition/multi-classify.test.ts test/recognition/multi-recognize.test.ts test/recognition/synthetic-grid.ts test/recognition/grid.test.ts
git commit -m "feat: classify with multiple prototypes"
```

---

### Task 4: Calibrate Shared Threshold Pairs Deterministically

**Files:**
- Create: `scripts/recognition/calibrate.ts`
- Test: `test/recognition/calibrate.test.ts`

**Interfaces:**
- Consumes: unthresholded cell distances and truth available only to offline evaluation
- Produces: `ThresholdPair`、`CalibrationCase`、`ThresholdEvaluation`、`evaluateThresholdPairs()`、`selectThresholdPair()`

- [ ] **Step 1: Write failing calibration tests**

Create `test/recognition/calibrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  evaluateThresholdPairs,
  selectThresholdPair,
  type CalibrationCase,
} from "../../scripts/recognition/calibrate.js";

const casesWithError: readonly CalibrationCase[] = [{
  id: "source-a",
  kind: "source",
  cells: [
    { correct: true, relativeMargin: 0.8, bestDistance: 0.5 },
    { correct: false, relativeMargin: 0.2, bestDistance: 8 },
  ],
}];

const tieCases: readonly CalibrationCase[] = [{
  id: "transformed-a",
  kind: "transformed",
  cells: [{ correct: true, relativeMargin: 0.8, bestDistance: 0.5 }],
}];

it("selects only pairs with zero wrong certain cells", () => {
  const pairs = [
    { relativeMargin: 0.1, absoluteDistance: 16 },
    { relativeMargin: 0.5, absoluteDistance: 2 },
  ] as const;
  const evaluations = evaluateThresholdPairs(casesWithError, pairs);
  expect(evaluations[0]?.wrongCertainCells).toBe(1);
  expect(evaluations[1]?.wrongCertainCells).toBe(0);
});

it("uses deterministic uncertainty and threshold tie breaking", () => {
  const selected = selectThresholdPair(tieCases, [
    { relativeMargin: 0.5, absoluteDistance: 4 },
    { relativeMargin: 0.5, absoluteDistance: 2 },
  ]);
  expect(selected).toEqual({ relativeMargin: 0.5, absoluteDistance: 4 });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm test -- test/recognition/calibrate.test.ts
```

Expected: FAIL because `calibrate.ts` does not exist.

- [ ] **Step 3: Implement the fixed threshold grid and evaluator**

Create `scripts/recognition/calibrate.ts` with:

```ts
export interface ThresholdPair {
  readonly relativeMargin: number;
  readonly absoluteDistance: number;
}

export interface CalibrationCell {
  readonly correct: boolean;
  readonly relativeMargin: number;
  readonly bestDistance: number;
}

export interface CalibrationCase {
  readonly id: string;
  readonly kind: "source" | "transformed";
  readonly cells: readonly CalibrationCell[];
}

export const RELATIVE_MARGIN_CANDIDATES = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95] as const;
export const ABSOLUTE_DISTANCE_CANDIDATES = [0.015625, 0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;
```

Generate the Cartesian threshold grid in stable source order. For each pair, certainty is the same conjunction used at runtime. Record:

```ts
export interface ThresholdEvaluation extends ThresholdPair {
  readonly wrongCertainCells: number;
  readonly uncertainSourceCells: number;
  readonly totalUncertainCells: number;
  readonly maximumUncertainCells: number;
  readonly passes: boolean;
}
```

`passes` requires zero wrong certain cells, zero uncertain source cells, and maximum transformed uncertainty at most four. `selectThresholdPair()` sorts passing evaluations by maximum uncertainty, total uncertainty, lower relative margin, then higher absolute-distance ceiling, and returns `null` if no pair passes.

- [ ] **Step 4: Run calibration and type verification**

Run:

```bash
npm test -- test/recognition/calibrate.test.ts
npm run typecheck
```

Expected: calibration tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit calibration**

```bash
git add scripts/recognition/calibrate.ts test/recognition/calibrate.test.ts
git commit -m "feat: calibrate recognition thresholds"
```

---

### Task 5: Evaluate Whole-Screen Holdout Folds

**Files:**
- Modify: `test/recognition/samples.ts`
- Create: `src/recognition/prototype-bank-codec.ts`
- Create: `scripts/recognition/encode-prototype-bank.ts`
- Create: `scripts/recognition/evaluate-folds.ts`
- Test: `test/recognition/prototype-bank-codec.test.ts`
- Test: `test/recognition/folds.test.ts`

**Interfaces:**
- Consumes: fixtures, Chromium derivatives, prototype builder, classifier, calibrator
- Produces: browser-safe `SerializedPrototypeBank`/`decodePrototypeBank()`、Node-only `encodePrototypeBank()`、`FoldResult`、`evaluateLeaveOneScreenOut()`

- [ ] **Step 1: Write a failing exact-codec round-trip test**

Create `test/recognition/prototype-bank-codec.test.ts` with a complete two-label synthetic bank and these assertions:

```ts
import { decodePrototypeBank } from "../../src/recognition/prototype-bank-codec.js";
import { encodePrototypeBank } from "../../scripts/recognition/encode-prototype-bank.js";

const first = encodePrototypeBank(syntheticPrototypeBank());
const decoded = decodePrototypeBank(first);
const second = encodePrototypeBank(decoded);

expect(second).toEqual(first);
expect(decoded.scaler.center).toBeInstanceOf(Float64Array);
expect(decoded.prototypes.every((item) => item.vector instanceof Float64Array)).toBe(true);
```

`syntheticPrototypeBank()` must return format version 1, feature version `features-v1`, feature-length scaler arrays, two distinct labels, and finite thresholds.

Run:

```bash
npm test -- test/recognition/prototype-bank-codec.test.ts
```

Expected: FAIL because the codec files do not exist.

- [ ] **Step 2: Implement the browser-safe decoder and Node-only encoder**

Create `src/recognition/prototype-bank-codec.ts` with:

```ts
export interface SerializedPrototypeBank {
  readonly formatVersion: 1;
  readonly featureVersion: "features-v1";
  readonly featureLength: number;
  readonly thresholds: ConfidenceThresholds;
  readonly labels: readonly CellLabel[];
  readonly prototypeCounts: readonly number[];
  readonly centerBase64: string;
  readonly scaleBase64: string;
  readonly prototypeBase64: string;
  readonly sha256: string;
}

export function decodePrototypeBank(serialized: SerializedPrototypeBank): PrototypeBank;
```

Decode little-endian Float32 base64 with browser APIs (`atob`) when available and a local character-to-byte loop; do not import any `node:` module or Buffer in this runtime file. Create `scripts/recognition/encode-prototype-bank.ts` with:

```ts
export function encodePrototypeBank(bank: PrototypeBank): SerializedPrototypeBank;
```

The Node-only encoder performs Float32 conversion, base64 encoding, and SHA-256. The decoder validates format/feature versions, feature length, ordered label/count shape, payload byte lengths, hash syntax, finite decoded values, and the reconstructed bank. It does not recompute SHA-256 in the browser.

Run:

```bash
npm test -- test/recognition/prototype-bank-codec.test.ts
npm run typecheck
```

Expected: codec test PASS and TypeScript exits 0.

- [ ] **Step 3: Add fixture-owned sample metadata**

Modify `test/recognition/samples.ts` to preserve ownership for evaluation without exposing it to runtime:

```ts
export interface FixtureFeatureSample extends LabeledFeatureSample {
  readonly fixtureId: FixtureCase["id"];
  readonly cellIndex: number;
}

export async function buildFixtureSamples(
  fixtures: readonly FixtureCase[],
): Promise<readonly FixtureFeatureSample[]>;
```

Add a focused assertion to `test/recognition/fixture-manifest.test.ts` that each fixture contributes exactly 480 uniquely indexed samples.

- [ ] **Step 4: Write the failing leakage and fold-result tests**

Create `test/recognition/folds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateLeaveOneScreenOut } from "../../scripts/recognition/evaluate-folds.js";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("whole-screen holdout", () => {
  it("never includes the held-out fixture in fitting or calibration", async () => {
    const results = await evaluateLeaveOneScreenOut(await loadFixtureCases(), "chromium");
    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.trainingFixtureIds).not.toContain(result.heldOutFixtureId);
      expect(result.calibrationFixtureIds).not.toContain(result.heldOutFixtureId);
      expect(result.evaluationCases).toHaveLength(4);
      expect(result.prototypeCounts.every((count) => count <= 12)).toBe(true);
    }
  }, 180_000);
});
```

- [ ] **Step 5: Run the fold test to verify RED**

Run:

```bash
npm test -- test/recognition/folds.test.ts
```

Expected: FAIL because `evaluate-folds.ts` does not exist.

- [ ] **Step 6: Implement fold evaluation**

Create `scripts/recognition/evaluate-folds.ts`:

```ts
export interface FoldCaseResult {
  readonly id: string;
  readonly kind: "source" | "transformed";
  readonly correctCells: number;
  readonly wrongCertainCells: number;
  readonly uncertainCells: number;
  readonly elapsedMs: number;
}

export interface FoldResult {
  readonly heldOutFixtureId: FixtureCase["id"];
  readonly trainingFixtureIds: readonly FixtureCase["id"][];
  readonly calibrationFixtureIds: readonly FixtureCase["id"][];
  readonly absentTrainingLabels: readonly CellLabel[];
  readonly prototypeCounts: readonly number[];
  readonly thresholds: ThresholdPair | null;
  readonly evaluationCases: readonly FoldCaseResult[];
  readonly passes: boolean;
}
```

This evaluator is an offline Node script and may import the Node-only `encodePrototypeBank()` together with the browser-safe `decodePrototypeBank()`. No module under `src/recognition/` imports the encoder, and the generated browser runtime imports only the decoder.

For each fold:

1. Build geometry from source samples belonging to the other three fixtures.
2. Attach a temporary permissive threshold pair, call `encodePrototypeBank()` and `decodePrototypeBank()`, and use that exact decoded geometry for calibration and evaluation so every fold reflects committed-bank Float32 precision.
3. Generate Chromium source and three derivatives for training fixtures and use their truth only for offline threshold calibration.
4. Build a thresholded bank from the selected pair; if selection returns `null`, record a failed fold without forcing thresholds.
5. Evaluate only the held-out fixture's four Chromium cases.
6. Mark the fold passing only when all four grids exist, wrong certain cells are zero, uncertain cells are at most four per image, and a threshold pair exists.

Do not import held-out samples into scaler, prototypes, or calibration.

- [ ] **Step 7: Run fold evaluation and inspect the result without weakening it**

Run:

```bash
npm test -- test/recognition/folds.test.ts
npm run typecheck
```

Expected: structural/leakage assertions PASS. If any fold's formal conditions fail, preserve the measured failure for Task 7; do not change truth, prototype caps, or per-fixture behavior.

- [ ] **Step 8: Commit codec and fold evaluation**

```bash
git add src/recognition/prototype-bank-codec.ts scripts/recognition/encode-prototype-bank.ts test/recognition/prototype-bank-codec.test.ts test/recognition/samples.ts test/recognition/fixture-manifest.test.ts scripts/recognition/evaluate-folds.ts test/recognition/folds.test.ts
git commit -m "test: add whole-screen recognition folds"
```

---

### Task 6: Serialize the Final Bank and Run Formal Chromium Acceptance

**Files:**
- Create: `src/recognition/generated/prototype-bank.ts`
- Create: `scripts/recognition/generate-prototype-bank.ts`
- Modify if adopted: `src/recognition/classify.ts`
- Modify if adopted: `src/recognition/recognize.ts`
- Modify if adopted: `src/recognition/prototypes.ts`
- Modify if adopted: `test/recognition/classify.test.ts`
- Modify: `test/recognition/recognize.test.ts`
- Test: `test/recognition/generated-bank.test.ts`

**Interfaces:**
- Consumes: all source samples, Chromium calibration cases
- Produces: `GENERATED_PROTOTYPE_BANK`、deterministic bank hash、formal Chromium decision input

- [ ] **Step 1: Write the failing generated-bank reproducibility test**

Create `test/recognition/generated-bank.test.ts` without a static import of the generated module. Import `access`, `mkdtemp`, `readFile`, and cleanup helpers from `node:fs/promises`; `tmpdir` from `node:os`; `join` from `node:path`; `fileURLToPath` from `node:url`; Vitest hooks/assertions; and `NoPassingThresholdError` plus `generatePrototypeBank()` from the generator:

```ts
it("reproduces the committed bank or records deterministic rejection", async () => {
  const temporaryPath = join(await mkdtemp(join(tmpdir(), "prototype-bank-")), "prototype-bank.ts");
  const committedPath = fileURLToPath(new URL("../../src/recognition/generated/prototype-bank.ts", import.meta.url));
  try {
    const serialized = await generatePrototypeBank({ outputPath: temporaryPath });
    expect(await readFile(temporaryPath, "utf8")).toBe(await readFile(committedPath, "utf8"));
    expect(Math.max(...serialized.prototypeCounts)).toBeLessThanOrEqual(12);
    expect(serialized.labels).not.toContain(7);
    expect(serialized.labels).not.toContain(8);
  } catch (error) {
    expect(error).toBeInstanceOf(NoPassingThresholdError);
    await expect(access(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(committedPath)).rejects.toMatchObject({ code: "ENOENT" });
  }
}, 180_000);
```

The test must clean up only its `mkdtemp()` directory in `afterEach`. `generatePrototypeBank()` accepts an explicit output path so tests never overwrite the committed module.

- [ ] **Step 2: Run the generated-bank test to verify RED**

Run:

```bash
npm test -- test/recognition/generated-bank.test.ts
```

Expected: FAIL because the generator and committed generated module do not exist.

- [ ] **Step 3: Implement the final-bank generator**

Create `scripts/recognition/generate-prototype-bank.ts` with:

```ts
export interface FinalBankCandidate {
  readonly geometry: PrototypeGeometry;
  readonly calibration: readonly ThresholdEvaluation[];
  readonly thresholds: ThresholdPair | null;
  readonly bank: PrototypeBank | null;
}

export class NoPassingThresholdError extends Error {
  override readonly name = "NoPassingThresholdError";
}

export async function buildFinalBankCandidate(): Promise<FinalBankCandidate>;
export async function generatePrototypeBank(options: { readonly outputPath: string }): Promise<SerializedPrototypeBank>;
```

Keep both exports side-effect-free and add a current-module `main()` guard. The implementation must:

1. Build geometry from all source fixtures.
2. Round-trip geometry through `encodePrototypeBank()` and `decodePrototypeBank()` before calculating classification distances.
3. Generate all formal Chromium cases.
4. Select thresholds through `selectThresholdPair()`.
5. Return `bank: null` from `buildFinalBankCandidate()` when no pair passes; make `generatePrototypeBank()` throw `NoPassingThresholdError` and leave `outputPath` absent in that case.
6. Encode the passing bank and mechanically write `src/recognition/generated/prototype-bank.ts`. The module imports `decodePrototypeBank` and `SerializedPrototypeBank`, exports the fully populated literal as `SERIALIZED_PROTOTYPE_BANK` using `satisfies SerializedPrototypeBank`, and exports its decoded value as `GENERATED_PROTOTYPE_BANK`.

The serialized form comes from Task 5 and includes format/feature versions, thresholds, ordered labels, prototype counts, little-endian Float32 base64 payloads, and a Node-generated SHA-256. Sort object keys and labels deterministically before rendering the module.

- [ ] **Step 4: Update formal recognition acceptance**

First run the generator. If it throws `NoPassingThresholdError`, do not create a substitute module and skip the adoption-only migration below; retain the measured failure for Task 7.

If generation succeeds, replace the historical single-prototype acceptance setup in `test/recognition/recognize.test.ts` with `GENERATED_PROTOTYPE_BANK`, `recognizeBoardWithBank()`, and `deriveBrowserImages("chromium", ...)`. Delete the obsolete single-threshold calibration tests from that file. For every result, use explicit assertions:

```ts
expect(result.status).not.toBe("grid-not-found");
expect(wrongCertain).toEqual([]);
if (derived.name === "source") {
  expect(result.uncertainCellIndices).toEqual([]);
} else {
  expect(result.uncertainCellIndices.length).toBeLessThanOrEqual(4);
}
```

Then make the adopted public API explicit:

- replace `src/recognition/classify.ts` with named re-exports of `classifyCellWithBank` as `classifyCell` and `MultiClassificationResult` as `ClassificationResult`;
- replace `src/recognition/recognize.ts` with named re-exports of `recognizeBoardWithBank` as `recognizeBoard`, `RecognitionRequest`, and `RecognitionResult`;
- reduce `src/recognition/prototypes.ts` to the `LabeledFeatureSample` interface used by offline fixture extraction; remove `CellPrototype`, `PrototypeSet`, and `buildPrototypeSet()`;
- update `test/recognition/classify.test.ts` to import the generated bank and public `classifyCell`, preserving normalization tests and every source-label assertion.

No compatibility wrapper accepts the removed single-prototype shape.

- [ ] **Step 5: Generate and verify the candidate bank**

Run:

```bash
npx tsx scripts/recognition/generate-prototype-bank.ts
npm test -- test/recognition/prototype-bank-codec.test.ts test/recognition/generated-bank.test.ts test/recognition/multi-classify.test.ts test/recognition/multi-recognize.test.ts test/recognition/classify.test.ts test/recognition/recognize.test.ts
npm run typecheck
```

Expected when the approach is viable: all tests PASS, the generated module is stable, and all sixteen Chromium cases meet the formal conditions. If generation exits 1 or acceptance fails, preserve the failure and continue only far enough to produce the rejection report in Task 7.

- [ ] **Step 6: Commit final-bank generation and acceptance**

Always commit the generator and its deterministic outcome test. When adopted, also stage the generated bank and public-API migration:

```bash
git add scripts/recognition/generate-prototype-bank.ts test/recognition/generated-bank.test.ts
git add src/recognition/generated/prototype-bank.ts src/recognition/classify.ts src/recognition/recognize.ts src/recognition/prototypes.ts test/recognition/classify.test.ts test/recognition/recognize.test.ts  # adopted only
git commit -m "feat: generate formal recognition bank"
```

When rejected, the outcome test must pass by confirming `NoPassingThresholdError` and the absence of both output files; stage only the first `git add` line. Never `git add` a path that was not generated.

---

### Task 7: Produce Compatibility Artifacts and the Adoption Report

**Files:**
- Create: `scripts/run-multi-prototype-spike.ts`
- Modify: `package.json`
- Modify: `scripts/run-recognition-spike.ts`
- Test: `test/recognition/multi-prototype-runner.test.ts`
- Create: `docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md`
- Modify only if adopted: `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md`

**Interfaces:**
- Consumes: final-bank candidate, fold results, Chromium/Firefox/WebKit derivatives, Sharp derivatives
- Produces: ignored artifacts, compatibility matrix, one decision identifier

- [ ] **Step 1: Write a failing runner summary test**

Create `test/recognition/multi-prototype-runner.test.ts` around an exported pure summary function:

```ts
import { describe, expect, it } from "vitest";
import {
  summarizeEngine,
  type EngineCaseMeasurement,
} from "../../scripts/run-multi-prototype-spike.js";

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

it("keeps compatibility failure separate from Chromium adoption", () => {
  const chromium = summarizeEngine("chromium", [measurement()]);
  const firefox = summarizeEngine("firefox", [measurement({ wrongCertainCells: 1 })]);
  expect(chromium.formalPassed).toBe(true);
  expect(firefox.compatibility).toBe("not-guaranteed");
  expect(chromium.formalPassed).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm test -- test/recognition/multi-prototype-runner.test.ts
```

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the runner without import-time side effects**

Create `scripts/run-multi-prototype-spike.ts` with exported pure summary helpers and an explicit `main()` guarded by the current module URL. Reuse `recreateArtifactDirectory()` and `renderOverlay()`.

```ts
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

export function summarizeEngine(
  engine: EngineSummary["engine"],
  cases: readonly EngineCaseMeasurement[],
): EngineSummary;
```

For an evaluated engine, `guaranteed` means every grid is found, wrong-certain count is zero, source uncertainty is zero, and transformed uncertainty is at most four per image. `limited` means every grid is found and wrong-certain count is zero but an uncertainty budget is exceeded. A missing grid or any wrong-certain cell is `not-guaranteed`. Only Chromium sets `formalPassed`, using the same per-case rules; the runner later conjoins that value with all fold results.

The runner must:

1. Recreate only `test/artifacts/recognition/` after symlink and containment checks.
2. Call `buildFinalBankCandidate()`; when a bank exists, run it over Chromium, Firefox, WebKit, and Sharp cases.
3. Run all four leave-one-screen-out folds.
4. Write engine/case JSON and PNG overlays.
5. Write `summary.json` with environment versions, candidate status, bank hash or `null`, prototype counts, thresholds or `null`, formal metrics, fold metrics, compatibility metrics, and elapsed min/median/max.
6. Set Chromium `formalPassed` only from Chromium and fold formal conditions.
7. Label evaluated Firefox/WebKit/Sharp results as `guaranteed`, `limited`, or `not-guaranteed` without changing Chromium `formalPassed`; use `not-run` only when no final bank exists.
8. Exit 1 only when Chromium formal acceptance or folds fail; compatibility-only failures exit 0.

When no final bank exists, skip engine image evaluation, record each engine as `not-run`, set Chromium `formalPassed` false, still record calibration and fold evidence, write the report inputs, then exit 1. Do not import `src/recognition/generated/prototype-bank.ts` unconditionally; the rejection path must compile when that file is absent.

Make the historical `scripts/run-recognition-spike.ts` a non-destructive forwarding wrapper to `main()` or remove its old single-prototype calibration logic. Update `package.json`:

```json
{
  "scripts": {
    "spike:recognition": "tsx scripts/run-multi-prototype-spike.ts"
  }
}
```

- [ ] **Step 4: Run the complete spike and inspect overlays**

Run:

```bash
npm test -- test/recognition/multi-prototype-runner.test.ts
npm run spike:recognition
npm run typecheck
```

When a bank exists, inspect all four Chromium source overlays, every Chromium transformed overlay with an uncertain or incorrect cell, and at least one source plus each derivative kind for Firefox and WebKit. Record exact mismatches even if compatibility results do not affect adoption. When no bank exists, record that visual inspection was skipped because there was no thresholded candidate.

Expected when adopted: runner exit 0, Chromium and folds pass, artifacts exist, and typecheck exits 0. Firefox/WebKit/Sharp may have any documented compatibility result.

- [ ] **Step 5: Run full regression verification**

Run:

```bash
npm test
git diff --check
git status --short
```

Expected when adopted: all tests PASS, generated artifacts remain ignored, and only planned documentation changes remain. If formal acceptance is rejected, tests preserving the failed gate may remain red and the report must state their exact names and outputs.

- [ ] **Step 6: Write the report and decision**

Create `docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md` with these headings:

```markdown
# Multi-Prototype Recognition Spike Report
## Decision
## Environment
## Prototype Bank
## Chromium Formal Results
## Whole-Screen Holdout Results
## Compatibility Matrix
## Visual Inspection
## Performance
## Coverage Limits
## Follow-up
```

Under `Decision`, write exactly one identifier:

- `multi-prototype-adopted` only when Chromium final-bank and every fold pass;
- `multi-prototype-rejected` otherwise.

Record all measured values from the fresh `summary.json`. State explicitly that Playwright WebKit is not Safari and that digits 7 and 8 remain unsupported. Include one next action only.

If adopted, minimally update `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md` to select the generated multi-prototype bank, list the Chromium guarantee range, and list Firefox/WebKit compatibility limits. If rejected, do not make the full product design claim adoption.

- [ ] **Step 7: Scan and commit the evidence**

Run:

```bash
rg -n -i 'T[B]D|T[O]DO|F[I]XME|REPLACE[_]ME|WRITE[_]HERE' docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md
git diff --check
```

Expected: placeholder scan has no matches and diff check succeeds.

Commit only source, tests, runner, report, package files, generated bank, and an evidence-required full-design update. Do not stage `test/artifacts/recognition/`.

```bash
git add package.json package-lock.json scripts/run-recognition-spike.ts scripts/run-multi-prototype-spike.ts test/recognition/multi-prototype-runner.test.ts docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md
git add docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md  # only when adopted
git commit -m "docs: record multi-prototype recognition result"
```

---

## Execution Stop

Stop after Task 7 and an independent whole-branch review. The decision gates a later product implementation plan. Do not continue directly into UI, solver, screen capture, clipboard, upload, OpenCV.js, or model work.
