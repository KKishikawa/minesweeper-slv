# Canonical Grid Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, fail-closed canonical-scale fallback that finds all sixteen formal Chromium grids without weakening existing wrong-grid protections.

**Architecture:** Keep the current strict detector as the direct path, but move it behind an internal attempt result that preserves coarse pitch evidence and refinement work. When direct detection rejects an image and one unambiguous 30–50 pixel pitch family exists, resample once to a 40-pixel canonical pitch, run the same strict detector with the remaining shared budget, map the candidate back, and revalidate it against the original pixels.

**Tech Stack:** TypeScript ES modules, Vitest, Playwright Chromium, deterministic RGBA processing, Node.js 22.12+, existing recognition fixtures and artifact tooling.

**Spec:** `docs/superpowers/specs/2026-08-24-canonical-grid-fallback-design.md`

## Global Constraints

- Preserve `detectGrid(image, dimensions): GridGeometry | null` and the existing `cellRect()` contract.
- Run the existing strict detector first and return direct successes without invoking fallback.
- The fallback accepts only an unambiguous observed pitch from 30 through 50 pixels and normalizes it once to 40 pixels.
- Runtime recognition uses RGBA arrays and deterministic TypeScript only; do not use Canvas, Sharp, browser-engine identifiers, fixture identifiers, expected bounds, expected labels, or platform-native image APIs.
- Keep all current strict thresholds and wrong-grid protections unless this plan explicitly moves code without changing behavior.
- Share one 20,000-pair refinement budget across direct and canonical strict attempts; do not grant one budget per attempt.
- Refuse normalized images above 4,000,000 pixels and fail closed on invalid shapes, arithmetic overflow, ambiguity, insufficient budget, or source-space revalidation failure.
- Require at least 0.90 original-space intersection support, at most five-percent X/Y pitch difference, and at most 0.1-cell inverse-mapping disagreement.
- Preserve the current axis sequence-count and retained-axis-candidate limits.
- Require median runtime no more than 1.25 times baseline and worst-case runtime no more than two times baseline.
- Grid success does not authorize classifier, prototype, threshold, fold-rule, generated-bank, UI, solver, or capture changes.
- If Task 1's coarse-estimator evidence gate fails, stop this plan without integrating fallback or tuning a second estimator threshold.
- Formal Chromium tests may require execution outside the macOS sandbox; Firefox and Playwright WebKit remain compatibility information and Playwright WebKit is not Safari.
- Respect the repository's Git signing configuration; never disable signing to make a commit succeed.

---

### Task 1: Extract Strict Detection Evidence and Prove the Pitch Gate

**Files:**
- Create: `src/recognition/grid-evidence.ts`
- Create: `src/recognition/grid-strict.ts`
- Create: `test/recognition/grid-evidence.test.ts`
- Create: `test/recognition/browser-grid-evidence.test.ts`
- Create: `test/recognition/grid-fixtures.ts`
- Create: `scripts/recognition/evaluate-grid-fallback.ts`
- Create: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`
- Modify: `src/recognition/grid.ts`
- Modify: `test/recognition/grid.test.ts`

**Interfaces:**
- Consumes: current `detectGrid()`, current axis candidates and strict validation, `deriveBrowserImages("chromium", imagePath)`.
- Produces: `StrictGridAttempt`, `CoarsePitchEvidence`, `estimateCanonicalPitch()`, an unchanged public `detectGrid()`, and committed gate evidence. Formal performance comparison remains paired in Task 5.

- [ ] **Step 1: Move shared synthetic grid fixtures without changing behavior**

Move the reusable synthetic helpers from `test/recognition/grid.test.ts` into `test/recognition/grid-fixtures.ts` and export them with these names:

```ts
export function syntheticSparseIntersectionImage(
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): PixelImage;

export function syntheticTwoContrastGridImage(
  firstVerticalBoundaries: readonly number[],
  secondVerticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
  firstContrast: number,
  secondContrast: number,
): PixelImage;

export function syntheticCandidateOverflowImage(): PixelImage;
export function syntheticDeterministicNoiseImage(): PixelImage;
export function eraseIntersection(image: PixelImage, x: number, y: number): PixelImage;
```

Keep every existing assertion in `grid.test.ts`; change only imports and helper ownership.

- [ ] **Step 2: Run the unchanged grid suite**

Run:

```bash
npm test -- test/recognition/grid.test.ts
```

Expected: 20 tests PASS. A failure here is a fixture-move regression and must be fixed before continuing.

- [ ] **Step 3: Write failing pure pitch-estimator tests**

Create `test/recognition/grid-evidence.test.ts` with explicit evidence objects. Cover one unique family, a five-percent-compatible X/Y pair, a runner-up within five-percent separation, complete-link clustering that refuses a chained broad family, the inclusive 30/50 boundaries, out-of-range pitches, and a missing axis.

Use this contract:

```ts
import { describe, expect, it } from "vitest";
import {
  estimateCanonicalPitch,
  type CoarsePitchEvidence,
} from "../../src/recognition/grid-evidence.js";

function evidence(
  vertical: CoarsePitchEvidence["vertical"],
  horizontal: CoarsePitchEvidence["horizontal"],
): CoarsePitchEvidence {
  return { vertical, horizontal };
}

it("returns the score-weighted pitch of one separated family", () => {
  expect(estimateCanonicalPitch(evidence(
    [
      { pitch: 30, normalizedScore: 1, candidateCount: 4 },
      { pitch: 40, normalizedScore: 0.6, candidateCount: 1 },
    ],
    [
      { pitch: 31, normalizedScore: 1, candidateCount: 3 },
      { pitch: 40, normalizedScore: 0.6, candidateCount: 1 },
    ],
  ))).toBeCloseTo(30.5, 10);
});

it("rejects a runner-up inside the five-percent family-score margin", () => {
  expect(estimateCanonicalPitch(evidence(
    [
      { pitch: 30, normalizedScore: 1, candidateCount: 2 },
      { pitch: 40, normalizedScore: 0.97, candidateCount: 2 },
    ],
    [
      { pitch: 30, normalizedScore: 1, candidateCount: 2 },
      { pitch: 40, normalizedScore: 0.96, candidateCount: 2 },
    ],
  ))).toBeNull();
});
```

- [ ] **Step 4: Run the estimator test to verify RED**

Run:

```bash
npm test -- test/recognition/grid-evidence.test.ts
```

Expected: FAIL because `grid-evidence.ts` does not exist.

- [ ] **Step 5: Implement the fixed estimator rule**

Create `src/recognition/grid-evidence.ts` with these public module-level types and function:

```ts
export interface AxisPitchBucket {
  readonly pitch: number;
  readonly normalizedScore: number;
  readonly candidateCount: number;
}

export interface CoarsePitchEvidence {
  readonly vertical: readonly AxisPitchBucket[];
  readonly horizontal: readonly AxisPitchBucket[];
}

export function estimateCanonicalPitch(evidence: CoarsePitchEvidence): number | null;
```

Validate finite positive pitches, normalized scores from zero through one, and positive integer candidate counts. Sort without mutating input. Form complete-link pitch families whose minimum and maximum differ by at most five percent. For each family, select the best compatible X and Y bucket, require their pitch difference at most five percent, and score the family with `Math.min(x.normalizedScore, y.normalizedScore)`. Require a best score of at least `0.65` and either no runner-up or `(best - runnerUp) / best >= 0.05`. Return the score-weighted X/Y pitch only when it is in `[30, 50]` and the X/Y estimate difference is at most five percent; otherwise return `null`.

- [ ] **Step 6: Run the pure estimator tests to verify GREEN**

Run:

```bash
npm test -- test/recognition/grid-evidence.test.ts
```

Expected: all estimator tests PASS.

- [ ] **Step 7: Refactor the strict detector behind an internal attempt result**

Move the existing strict detection implementation and its private helpers from `grid.ts` to `grid-strict.ts`. Keep `cellRect()` and the public `detectGrid()` wrapper in `grid.ts`. Re-export `buildEdgeProfiles` and `countCompatibleGridCandidatePairs` from `grid.ts` so existing imports remain valid.

Export the internal `GridDimensions`, `EdgeProfiles`, and `RefinedGridCandidate` types from `grid-strict.ts` for use by sibling recognition modules and tests; do not re-export them from a browser product barrel. Define:

```ts
export interface ValidatedGridCandidate {
  readonly geometry: GridGeometry;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly rangeScore: number;
}

export interface SourceGridValidationContext {
  readonly profiles: EdgeProfiles;
  readonly refinedCandidates: readonly RefinedGridCandidate[];
}

export type StrictGridAttempt =
  | {
      readonly status: "found";
      readonly candidate: ValidatedGridCandidate;
      readonly geometry: GridGeometry;
      readonly coarseEvidence: CoarsePitchEvidence;
      readonly sourceContext: SourceGridValidationContext;
      readonly refinedPairCount: number;
    }
  | {
      readonly status: "rejected" | "ambiguous" | "budget-exhausted";
      readonly coarseEvidence: CoarsePitchEvidence | null;
      readonly sourceContext: SourceGridValidationContext | null;
      readonly refinedPairCount: number;
    };

export function detectStrictGridAttempt(
  image: PixelImage,
  dimensions: GridDimensions,
): StrictGridAttempt;
```

Build normalized pitch buckets from the already-selected axis candidates. Count compatible grid pairs before refinement. Preserve the original edge profiles and refined candidates in `SourceGridValidationContext` so a later fallback can revalidate without another original-space enumeration. For this task, `detectGrid()` calls `detectStrictGridAttempt()` once and returns its geometry only for `status === "found"`; fallback is not yet connected. Preserve every current threshold and final geometry calculation.

- [ ] **Step 8: Prove strict behavior preservation**

Run:

```bash
npm test -- test/recognition/grid.test.ts test/recognition/grid-evidence.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits zero.

- [ ] **Step 9: Write the formal browser evidence gate**

Create `test/recognition/browser-grid-evidence.test.ts`. Regenerate all sixteen Chromium cases. Assert that the eleven current direct successes remain `status: "found"`. For these exact five direct failures, assert a non-null estimate whose relative error from the observed pitch is at most five percent:

```ts
const expectedFallbackPitch = new Map<string, number>([
  ["1:canvas-scale-075", 30],
  ["1:canvas-scale-125", 50],
  ["2:canvas-scale-075", 30],
  ["2:canvas-scale-125", 50],
  ["3:canvas-scale-075", 30],
]);
```

Also assert `null` for an ambiguous two-pitch synthetic image and deterministic noise. Do not require `null` for projected-line or displaced-grid images; Task 4 must reject them after fallback validation.

- [ ] **Step 10: Run the evidence gate outside the sandbox**

Run:

```bash
npm test -- test/recognition/browser-grid-evidence.test.ts
```

Expected: the five direct failures receive the fixed-rule pitch hint, all eleven direct successes remain unchanged, and ambiguous/noise negatives receive no hint.

If this test fails, stop the entire plan. Record the failing family scores and literal decision `coarse-pitch-gate-failed` in `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`, verify the report has no placeholders, commit the Task 1 refactor and failed-gate evidence, leave `detectGrid()` as direct-only, and return to design review. Do not tune `0.65`, `0.05`, the pitch range, or the family algorithm in this implementation plan.

- [ ] **Step 11: Record the baseline and gate evidence**

Create `scripts/recognition/evaluate-grid-fallback.ts` to run three warmed Chromium passes and emit JSON containing case ID, pixel hash, direct status, pitch hint, geometry, refined-pair count, and elapsed milliseconds. Use the same fixture ordering on every run.

Write `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md` with headings `Gate`, `Baseline Matrix`, `Negative Matrix`, `Compatibility`, `Performance`, and `Decision`. Record preliminary strict-only timings for diagnostic context, but label them non-comparative. The formal performance ratios will use the paired same-process measurement in Task 5. Record the literal gate decision `coarse-pitch-gate-passed`.

- [ ] **Step 12: Verify and commit Task 1**

Run:

```bash
npm test -- test/recognition/grid.test.ts test/recognition/grid-evidence.test.ts test/recognition/browser-grid-evidence.test.ts
npm run typecheck
git diff --check
```

Expected: focused tests and typecheck PASS; the report has no placeholder text.

Commit:

```bash
git add src/recognition/grid.ts src/recognition/grid-strict.ts src/recognition/grid-evidence.ts test/recognition/grid.test.ts test/recognition/grid-fixtures.ts test/recognition/grid-evidence.test.ts test/recognition/browser-grid-evidence.test.ts scripts/recognition/evaluate-grid-fallback.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
git commit -m "refactor: expose coarse grid evidence"
```

---

### Task 2: Add Deterministic Canonical Resampling

**Files:**
- Create: `src/recognition/grid-resample.ts`
- Create: `test/recognition/grid-resample.test.ts`
- Create: `test/recognition/browser-grid-resample.test.ts`
- Create: `scripts/recognition/evaluate-grid-resample-compatibility.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`

**Interfaces:**
- Consumes: `PixelImage` and one estimated pitch from Task 1.
- Produces: `canonicalScale()`, `canonicalOutputSize()`, `resampleCanonicalGridImage()`, `mapCanonicalCoordinateToSource()`, and `mapSourceCoordinateToCanonical()`.

- [ ] **Step 1: Write failing size, byte, and mapping tests**

Create `test/recognition/grid-resample.test.ts` with this hand-authored 2 by 2 grayscale RGBA image:

```ts
const image: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 0, 0, 255,       60, 60, 60, 255,
    120, 120, 120, 255, 180, 180, 180, 255,
  ]),
};
```

Assert identity bytes at scale one and this exact 3 by 3 result at scale 1.5:

```ts
expect([...resampleCanonicalGridImage(image, 1.5).data]).toEqual([
  0, 0, 0, 255,    30, 30, 30, 255,   60, 60, 60, 255,
  60, 60, 60, 255, 90, 90, 90, 255,   120, 120, 120, 255,
  120, 120, 120, 255, 150, 150, 150, 255, 180, 180, 180, 255,
]);
```

Use a second 2 by 2 fixture with alpha values 0, 60, 120, and 180 to assert alpha interpolation, edge clamping, and inverse coordinate mapping.

Include validation cases:

```ts
expect(() => canonicalScale(29.999)).toThrow(RangeError);
expect(canonicalScale(30)).toBeCloseTo(4 / 3, 12);
expect(canonicalScale(40)).toBe(1);
expect(canonicalScale(50)).toBe(0.8);
expect(() => canonicalScale(50.001)).toThrow(RangeError);
```

Assert rejection of invalid RGBA length, non-positive dimensions, non-finite scale, zero output dimensions, unsafe multiplication, and output above 4,000,000 pixels.

Test overflow and the 4,000,000-pixel boundary directly through a pure `canonicalOutputSize(width, height, scale)` helper so the tests never allocate an unsafe or multi-gigabyte RGBA array.

- [ ] **Step 2: Run the resampler tests to verify RED**

Run:

```bash
npm test -- test/recognition/grid-resample.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic bilinear center sampling**

Create `src/recognition/grid-resample.ts`:

```ts
export const CANONICAL_GRID_PITCH = 40;
export const MIN_FALLBACK_PITCH = 30;
export const MAX_FALLBACK_PITCH = 50;
export const MAX_CANONICAL_PIXELS = 4_000_000;

export function canonicalScale(observedPitch: number): number;

export function canonicalOutputSize(
  width: number,
  height: number,
  scale: number,
): { readonly width: number; readonly height: number };

export function resampleCanonicalGridImage(
  image: PixelImage,
  scale: number,
): PixelImage;

export function mapCanonicalCoordinateToSource(
  coordinate: number,
  scale: number,
): number {
  return ((coordinate + 0.5) / scale) - 0.5;
}

export function mapSourceCoordinateToCanonical(
  coordinate: number,
  scale: number,
): number {
  return ((coordinate + 0.5) * scale) - 0.5;
}
```

Use `Math.round(image.width * scale)` and `Math.round(image.height * scale)`. For every output pixel center, map to the clamped input coordinate, interpolate each channel in Float64 arithmetic, apply `Math.round`, and clamp to byte range. Do not use a browser or image library.

- [ ] **Step 4: Run tests and typecheck to verify GREEN**

Run:

```bash
npm test -- test/recognition/grid-resample.test.ts
npm run typecheck
```

Expected: all resampler tests PASS and TypeScript exits zero.

- [ ] **Step 5: Add three-run Node determinism fixtures**

Use deterministic synthetic 30-pixel-pitch and 50-pixel-pitch RGBA grids that require no browser or image codec. Resample each three times and assert identical SHA-256 in the Node-only test. Store expected dimensions and hash literals in the test after the first reviewed GREEN run; do not read hashes from a mutable artifact at assertion time. The browser-generated formal derivatives remain in Step 6 so this pure test does not acquire a Playwright dependency.

- [ ] **Step 6: Verify the transpiled implementation in browser engines**

Create `test/recognition/browser-grid-resample.test.ts`. Generate one 30-pixel and one 50-pixel formal derivative with `deriveBrowserImages("chromium", imagePath)`. Read `src/recognition/grid-resample.ts`, compile that exact module with `typescript.transpileModule({ compilerOptions: { target: ES2022, module: ES2022 } })`, and load the resulting source from a Blob module inside Playwright Chromium, Firefox, and WebKit. Invoke `resampleCanonicalGridImage()` on the fixed unit fixture and the two generated formal derivative byte arrays. Compare width, height, and returned bytes with the Node results. Chromium equality is the formal assertion. Run Firefox and WebKit through the same helper and record equality or the exact incompatibility as compatibility evidence without changing the Chromium acceptance result.

Use this browser import shape so the test executes the production implementation rather than a copied algorithm:

```ts
const result = await page.evaluate(async ({ moduleSource, image, scale }) => {
  const url = URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }));
  try {
    const module = await import(url) as {
      resampleCanonicalGridImage(value: PixelImage, valueScale: number): PixelImage;
    };
    const output = module.resampleCanonicalGridImage({
      ...image,
      data: new Uint8ClampedArray(image.data),
    }, scale);
    return { width: output.width, height: output.height, data: [...output.data] };
  } finally {
    URL.revokeObjectURL(url);
  }
}, { moduleSource, image: { ...image, data: [...image.data] }, scale });
```

Run:

```bash
npm test -- test/recognition/browser-grid-resample.test.ts
npx tsx scripts/recognition/evaluate-grid-resample-compatibility.ts
```

Expected formal result: Chromium bytes match Node exactly. Record whether Firefox and WebKit match; a mismatch does not fail the formal Chromium decision. Playwright WebKit is recorded as a compatibility proxy, not Safari.

Create `scripts/recognition/evaluate-grid-resample-compatibility.ts` around the same helper and emit structured JSON with engine, case ID, expected hash, actual hash, dimensions, equality, and any launch/evaluation error. Copy the measured engine rows into the report's `Compatibility` section. Only Chromium equality participates in the formal result.

- [ ] **Step 7: Commit Task 2**

Run `git diff --check`, then commit:

```bash
git add src/recognition/grid-resample.ts test/recognition/grid-resample.test.ts test/recognition/browser-grid-resample.test.ts scripts/recognition/evaluate-grid-resample-compatibility.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
git commit -m "feat: add deterministic grid resampling"
```

---

### Task 3: Enforce One Shared Refinement Budget

**Files:**
- Create: `src/recognition/grid-budget.ts`
- Create: `test/recognition/grid-budget.test.ts`
- Modify: `src/recognition/grid.ts`
- Modify: `src/recognition/grid-strict.ts`
- Modify: `test/recognition/grid.test.ts`
- Modify: `test/recognition/browser-grid-evidence.test.ts`
- Modify: `scripts/recognition/evaluate-grid-fallback.ts`

**Interfaces:**
- Consumes: compatible grid-pair counts from `detectStrictGridAttempt()`.
- Produces: `GridRefinementBudget` with `reserve()` and `remaining`, used by both direct and canonical attempts.

- [ ] **Step 1: Write failing budget tests**

Create `test/recognition/grid-budget.test.ts`:

```ts
import { expect, it } from "vitest";
import { GridRefinementBudget } from "../../src/recognition/grid-budget.js";

it("shares one limit across reservations", () => {
  const budget = new GridRefinementBudget(20_000);
  expect(budget.reserve(3_251)).toBe(true);
  expect(budget.reserve(16_749)).toBe(true);
  expect(budget.remaining).toBe(0);
  expect(budget.reserve(1)).toBe(false);
  expect(budget.consumed).toBe(20_000);
});
```

Also test negative, non-integer, and non-finite reservations; they must throw without changing state.

- [ ] **Step 2: Run the budget test to verify RED**

Run:

```bash
npm test -- test/recognition/grid-budget.test.ts
```

Expected: FAIL because the class does not exist.

- [ ] **Step 3: Implement the budget object**

Create:

```ts
export class GridRefinementBudget {
  #consumed = 0;

  constructor(readonly limit: number = 20_000) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Grid refinement limit must be a non-negative safe integer.");
  }

  get consumed(): number { return this.#consumed; }
  get remaining(): number { return this.limit - this.#consumed; }

  reserve(count: number): boolean {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Grid refinement reservation must be a non-negative safe integer.");
    if (count > this.remaining) return false;
    this.#consumed += count;
    return true;
  }
}
```

- [ ] **Step 4: Wire the strict attempt to reserve before refinement**

Add a required `GridRefinementBudget` parameter to `detectStrictGridAttempt()`. After compatible pair counting and before `refineGridCandidates()`, call `reserve(pairCount)`. Return `status: "budget-exhausted"` without refinement when it returns false. Preserve `refinedPairCount` as the amount reserved by this attempt, not cumulative budget consumption.

Update every Task 1 call site in `grid.ts`, `browser-grid-evidence.test.ts`, and `evaluate-grid-fallback.ts` to create or receive an explicit budget. The public direct-only wrapper creates `new GridRefinementBudget(20_000)` once per call. No optional/default budget is allowed on the internal strict attempt.

Add a `grid.test.ts` assertion whose first call consumes part of a small budget and whose second call returns `budget-exhausted` without increasing `consumed` beyond its limit.

- [ ] **Step 5: Verify focused behavior**

Run:

```bash
npm test -- test/recognition/grid-budget.test.ts test/recognition/grid.test.ts test/recognition/grid-evidence.test.ts
npm run typecheck
```

Expected: all tests PASS; public direct geometries remain unchanged.

- [ ] **Step 6: Commit Task 3**

Run `git diff --check`, then commit:

```bash
git add src/recognition/grid-budget.ts src/recognition/grid.ts src/recognition/grid-strict.ts test/recognition/grid-budget.test.ts test/recognition/grid.test.ts test/recognition/browser-grid-evidence.test.ts scripts/recognition/evaluate-grid-fallback.ts
git commit -m "refactor: share grid refinement budget"
```

---

### Task 4: Integrate the Fail-Closed Canonical Fallback

**Files:**
- Create: `src/recognition/grid-fallback.ts`
- Create: `test/recognition/grid-fallback.test.ts`
- Create: `test/recognition/browser-grid-fallback.test.ts`
- Modify: `src/recognition/grid.ts`
- Modify: `src/recognition/grid-strict.ts`
- Modify: `test/recognition/grid.test.ts`

**Interfaces:**
- Consumes: Task 1 strict attempts and pitch evidence, Task 2 resampling/mapping, Task 3 shared budget.
- Produces: `detectGridDirectFirst()`, `detectGridWithDiagnostics()`, and `revalidateMappedCandidate()`; `detectGrid()` becomes a projection of the same direct-first orchestration without changing its signature.

- [ ] **Step 1: Write failing orchestration tests with injected operations**

Create `test/recognition/grid-fallback.test.ts` around an exported orchestration function whose image operations are injectable for pure tests:

```ts
export interface CanonicalFallbackOperations {
  readonly strictAttempt: (
    image: PixelImage,
    dimensions: GridDimensions,
    budget: GridRefinementBudget,
  ) => StrictGridAttempt;
  readonly estimatePitch: (evidence: CoarsePitchEvidence) => number | null;
  readonly resample: (image: PixelImage, scale: number) => PixelImage;
  readonly revalidate: (
    source: PixelImage,
    dimensions: GridDimensions,
    sourceContext: SourceGridValidationContext,
    candidate: ValidatedGridCandidate,
    scale: number,
    observedPitch: number,
  ) => GridGeometry | null;
}
```

Assert:

- direct success returns a `stage: "direct"` result without calling estimator or resampler;
- missing evidence, ambiguous pitch, and out-of-range pitch return a diagnostic result with `geometry: null`;
- missing original `sourceContext` fails closed before resampling or revalidation;
- a canonical strict failure returns a diagnostic result with `geometry: null`;
- the second strict attempt uses the same budget instance;
- source revalidation failure returns a diagnostic result with `geometry: null`;
- only a revalidated mapped geometry is exposed in the result.

- [ ] **Step 2: Run orchestration tests to verify RED**

Run:

```bash
npm test -- test/recognition/grid-fallback.test.ts
```

Expected: FAIL because `grid-fallback.ts` does not exist.

- [ ] **Step 3: Write the failing formal public-path regression**

Create `test/recognition/browser-grid-fallback.test.ts` over all four fixtures and four Chromium derivative kinds. Call the public `detectGrid()` and assert non-null geometry for all sixteen. Compare each bound to `fixture.expectedBoardBounds * derived.scale` with tolerance `0.1 * expectedPitch * derived.scale`, and require X/Y pitch difference at most five percent.

Run:

```bash
npm test -- test/recognition/browser-grid-fallback.test.ts
```

Expected RED: the existing eleven direct cases PASS and the five recorded Canvas-scale failures remain `null`. If any of the existing eleven regress or an unexpected case changes before implementation, diagnose that discrepancy before continuing.

- [ ] **Step 4: Implement direct-first orchestration and shared diagnostics**

Create:

```ts
export interface GridDetectionDiagnosticResult {
  readonly geometry: GridGeometry | null;
  readonly stage:
    | "direct"
    | "hint-rejected"
    | "normalization-rejected"
    | "canonical-rejected"
    | "source-revalidation-rejected"
    | "budget-exhausted"
    | "fallback";
  readonly directRefinedPairCount: number;
  readonly canonicalRefinedPairCount: number;
  readonly normalizedImage: PixelImage | null;
}

export function detectGridDirectFirst(
  image: PixelImage,
  dimensions: GridDimensions,
  operations: CanonicalFallbackOperations,
  budget: GridRefinementBudget = new GridRefinementBudget(),
): GridDetectionDiagnosticResult;

export function detectGridWithDiagnostics(
  image: PixelImage,
  dimensions: GridDimensions,
): GridDetectionDiagnosticResult;
```

Call strict once. Return a direct diagnostic result immediately on success. For a rejected or ambiguous attempt with evidence, estimate pitch, derive `canonicalScale()`, resample once, and call strict with the same budget. Do not fallback after `budget-exhausted`. Map and revalidate only a canonical `found` candidate. The diagnostic entry point and public wrapper execute this same function; `detectGrid()` returns only `.geometry`. Do not copy orchestration into tests or scripts.

- [ ] **Step 5: Write failing original-space revalidation tests**

Use a valid synthetic grid, resample it to a canonical image, and construct the mapped candidate. Assert acceptance. Then use the existing projected-line and two-through-four-pixel displaced competing-grid fixtures and assert rejection after canonical strict success. Pass the `SourceGridValidationContext` retained by the original strict attempt so competing extents are compared without another candidate enumeration.

Also assert rejection for:

- less than 0.90 intersection support;
- more than five-percent X/Y pitch difference;
- more than 0.1-cell mapped/coarse pitch disagreement;
- weak outer-boundary evidence;
- an ambiguous competing extent.

- [ ] **Step 6: Extract strict source-candidate validation**

In `grid-strict.ts`, extract the validation of one already-mapped candidate without candidate enumeration:

```ts
export function revalidateMappedCandidate(
  image: PixelImage,
  dimensions: GridDimensions,
  sourceContext: SourceGridValidationContext,
  candidate: ValidatedGridCandidate,
  scale: number,
  observedPitch: number,
): GridGeometry | null;
```

Map the canonical refined boundaries through the center-sampling inverse. Search only within the existing boundary-refinement radius. Reuse the stored original profiles for outer-boundary metrics, intersection support, interior phase, and pitch/aspect checks. Compare against the stored refined candidates for competing-extent safety without creating new candidates. Do not change pitch family, dimensions, or extent by a full cell. Require mapped pitch disagreement at most `0.1 * observedPitch`.

- [ ] **Step 7: Connect the public wrapper**

In `grid.ts`, validate image and dimensions exactly as before, call `detectGridWithDiagnostics()` once, and return only `.geometry`. The diagnostic entry point creates one `GridRefinementBudget(20_000)` and calls `detectGridDirectFirst()` with production operations. Keep `cellRect()` unchanged.

- [ ] **Step 8: Verify all synthetic positives, negatives, and the formal public path**

Run:

```bash
npm test -- test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-budget.test.ts test/recognition/grid-resample.test.ts test/recognition/grid-evidence.test.ts test/recognition/browser-grid-fallback.test.ts
npm run typecheck
```

Expected: all tests PASS, including the sixteen-case Chromium public-path regression. Projected-line, displaced-grid, competing extent, and noise tests remain `null`.

- [ ] **Step 9: Commit Task 4**

Run `git diff --check`, then commit:

```bash
git add src/recognition/grid.ts src/recognition/grid-strict.ts src/recognition/grid-fallback.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/browser-grid-fallback.test.ts
git commit -m "feat: add canonical grid fallback"
```

---

### Task 5: Prove the Formal Matrix, Safety Matrix, and Performance Gate

**Files:**
- Modify: `test/recognition/browser-grid-fallback.test.ts`
- Modify: `scripts/recognition/evaluate-grid-fallback.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`

**Interfaces:**
- Consumes: production `detectGrid()`, the extracted strict-only path, all sixteen Chromium derivatives, and the existing negative fixtures.
- Produces: formal 16/16 evidence, deterministic geometry/hash evidence, shared-budget metrics, and measured performance ratios.

- [ ] **Step 1: Extend the formal Chromium regression with path assertions**

Keep the public-path 16/16 geometry assertions from Task 4. In a second diagnostic-only assertion, call `detectGridWithDiagnostics()` on the same bytes to record the internal path without changing the public result.

Record whether each result used direct or fallback in test-only diagnostics. Assert exactly the previous eleven cases remain direct and the five recorded failures use fallback. Do not branch production behavior on these IDs.

- [ ] **Step 2: Add deterministic and budget assertions**

Run the sixteen-case matrix three times in one browser-test process. For each case, hash the input RGBA bytes and normalized bytes when fallback runs. Assert each hash and geometry equals the first run. Assert the sum of direct and canonical refined pairs is at most 20,000 for every case.

- [ ] **Step 3: Run the formal test outside the sandbox**

Run:

```bash
npm test -- test/recognition/browser-grid-fallback.test.ts
```

Expected: 16/16 grids PASS on all three runs; five use fallback; bounds, pitch, determinism, and budget assertions PASS.

- [ ] **Step 4: Run the complete negative matrix**

Run:

```bash
npm test -- test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts
```

Expected: all negatives remain `null`, including projected-line and two-through-four-pixel displaced competing grids.

- [ ] **Step 5: Measure paired same-process performance**

Update `evaluate-grid-fallback.ts` to retain all sixteen decoded Chromium RGBA buffers, then measure the extracted strict-only entry point and `detectGridWithDiagnostics()` in the same process. Warm both paths, alternate which path runs first per case/pass, and use the identical image order and three-run aggregation. Record direct/fallback stage timings and pair counts without branching on elapsed time. Task 1's saved timing is diagnostic only and is not the denominator.

Run:

```bash
npx tsx scripts/recognition/evaluate-grid-fallback.ts
```

Calculate fallback-path median divided by the paired strict-only median and fallback-path worst divided by the paired strict-only worst. Require ratios `<= 1.25` and `<= 2.0` respectively. If either fails, stop before Task 6 and report `performance-gate-failed`; do not add caching or relax the gate in this plan.

- [ ] **Step 6: Update the fallback report from measured JSON**

Update `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md` with:

- Chromium version and platform;
- all sixteen direct/fallback outcomes and bounds errors;
- all negative outcomes;
- three-run determinism hashes;
- the structured Chromium, Firefox, and WebKit resampler compatibility rows from Task 2, explicitly marked formal or informational;
- direct/canonical/total pair counts;
- paired strict-only baseline and fallback-candidate median/worst times and ratios;
- literal decision `canonical-grid-fallback-passed` only when every functional and performance gate passes.

- [ ] **Step 7: Run focused verification and commit Task 5**

Run:

```bash
npm test -- test/recognition/browser-grid-evidence.test.ts test/recognition/browser-grid-fallback.test.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests PASS, typecheck exits zero, and the report contains no placeholder text.

Commit:

```bash
git add test/recognition/browser-grid-fallback.test.ts scripts/recognition/evaluate-grid-fallback.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
git commit -m "test: verify canonical grid fallback"
```

---

### Task 6: Re-run the Recognition Decision Without Expanding Scope

**Files:**
- Modify: `docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md`
- Modify if measured expectations change: `test/recognition/generated-bank.test.ts`
- Modify if measured expectations change: `test/recognition/folds.test.ts`
- Create only if the existing generator and every formal gate pass: `src/recognition/generated/prototype-bank.ts`
- Modify only on adoption: `src/recognition/classify.ts`
- Modify only on adoption: `src/recognition/recognize.ts`
- Modify only on adoption: `src/recognition/prototypes.ts`
- Modify only on adoption: `test/recognition/classify.test.ts`
- Modify only on adoption: `test/recognition/recognize.test.ts`
- Modify only on adoption: `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md`

**Interfaces:**
- Consumes: the completed grid fallback, existing final-bank candidate generator, four holdout folds, and the existing recognition runner.
- Produces: one fresh recognition decision and final regression evidence; no classifier changes.

- [ ] **Step 1: Run the final candidate and fold suites**

Run outside the sandbox where required:

```bash
npm test -- test/recognition/generated-bank.test.ts test/recognition/folds.test.ts
```

Expected: grid-not-found no longer appears in the sixteen final Chromium cases. Threshold or fold assertions may still preserve a formal rejection; record the exact result rather than changing classifier behavior.

- [ ] **Step 2: Run the complete recognition runner once**

Run:

```bash
npm run spike:recognition
```

Expected: the runner writes fresh ignored artifacts and updates `docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md`. Exit zero only if final Chromium acceptance and all four folds pass; otherwise exit one with `multi-prototype-rejected`.

- [ ] **Step 3: Inspect the decision boundary**

If rejected, verify that no generated product bank or public runtime migration was added. Record the remaining threshold/fold failures and stop classifier work.

If adopted, follow only the already-approved adoption branch of the multi-prototype plan: verify the serialized bank, inspect the required overlays, and update the product design claim. Do not begin UI, solver, or capture work.

- [ ] **Step 4: Run the default full suite and static checks**

Run:

```bash
npm test
npm run typecheck
git diff --check
git status --short
```

Expected when recognition remains rejected: every new grid fallback test PASS; only formally documented recognition-gate failures may remain. Expected when adopted: all tests PASS. The default suite remains file-serial and has no incidental timeout failures.

- [ ] **Step 5: Scan reports and commit the final decision**

Run:

```bash
rg -n -i 'T[B]D|T[O]DO|F[I]XME|REPLACE[_]ME|WRITE[_]HERE' docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md
```

Expected: no matches.

Commit the measured reports and any literal measured expectation updates:

```bash
git add docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md test/recognition/generated-bank.test.ts test/recognition/folds.test.ts
git add src/recognition/generated/prototype-bank.ts src/recognition/classify.ts src/recognition/recognize.ts src/recognition/prototypes.ts test/recognition/classify.test.ts test/recognition/recognize.test.ts docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md  # adopted only; never run this line on rejection
git commit -m "docs: record canonical grid fallback result"
```

---

## Execution Stop

Stop after Task 6 and an independent whole-plan review. A passing grid fallback is evidence for recognition, not authorization to implement UI, solver, capture, clipboard, upload, or unrelated refactoring.
