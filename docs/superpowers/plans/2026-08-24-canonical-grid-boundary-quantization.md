# Canonical Grid Boundary Quantization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct integer-axis quantization at the supported 30px and 50px pitch boundaries, rerun the fixed Chromium evidence gate, and restore the baseline evidence needed to resume canonical fallback implementation.

**Architecture:** Keep family construction, score gates, ambiguity rejection, and the `[30, 50]` supported range unchanged. After a unique family passes those gates, correct only a selected `29/30` pair to 30 or a `50/51` pair to 50; pairs whose two buckets are outside the supported range remain rejected. If the amended gate passes, create the deferred strict-only evaluation harness and hand execution back to Task 2 of the canonical fallback plan.

**Tech Stack:** TypeScript ES modules, Vitest, Playwright Chromium, deterministic RGBA processing, Node.js 22.12+.

**Spec:** `docs/superpowers/specs/2026-08-24-canonical-grid-fallback-design.md`

## Global Constraints

- Preserve `detectGrid(image, dimensions): GridGeometry | null` and the existing `cellRect()` contract.
- Do not change strict grid thresholds, candidate ordering, axis sequence-count limits, retained-axis-candidate limits, or the 20,000-pair behavior.
- Keep complete-link family construction, the minimum family score `0.65`, the five-percent family-score separation, and X/Y five-percent compatibility unchanged.
- Keep the supported returned pitch range `[30, 50]`; the correction must not admit `29/29`, `51/51`, or another pair whose two buckets are outside this range.
- The lower correction requires one selected bucket exactly 30 and the other below 30 within five percent. The upper correction requires one selected bucket exactly 50 and the other above 50 within five percent.
- Boundary correction happens only after unique-family selection and cannot resolve ambiguity.
- Runtime recognition uses RGBA arrays and deterministic TypeScript only; do not use Canvas, Sharp, browser-engine identifiers, fixture identifiers, expected bounds, expected labels, or platform-native image APIs.
- Chromium is the formal browser decision. Firefox and Playwright WebKit remain compatibility information and do not override it.
- If the amended evidence gate fails, stop this plan without another correction or threshold change.
- This plan does not authorize canonical resampling, shared-budget integration, fallback orchestration, source-space revalidation, classifier, prototype, UI, solver, or capture changes.
- Respect the repository's Git signing configuration; never disable signing to make a commit succeed.

---

### Task 1: Correct Supported-Boundary Quantization and Re-run the Gate

**Files:**
- Modify: `src/recognition/grid-evidence.ts`
- Modify: `test/recognition/grid-evidence.test.ts`
- Test: `test/recognition/browser-grid-evidence.test.ts`

**Interfaces:**
- Consumes: the existing `AxisPitchBucket`, `CoarsePitchEvidence`, complete-link family selection, and `estimateCanonicalPitch(evidence): number | null`.
- Produces: the same public estimator signature, with a narrow post-selection boundary correction; a passing sixteen-case Chromium evidence gate or the existing fail-closed stop result.

- [ ] **Step 1: Write failing lower/upper boundary tests and supported-range regressions**

Append these cases to `test/recognition/grid-evidence.test.ts`, using its existing `evidence(vertical, horizontal)` helper:

```ts
it("corrects a selected 29/30 boundary family to 30", () => {
  expect(estimateCanonicalPitch(evidence(
    [{ pitch: 30, normalizedScore: 1, candidateCount: 3 }],
    [{ pitch: 29, normalizedScore: 0.8661677576, candidateCount: 2 }],
  ))).toBe(30);
});

it("corrects a selected 50/51 boundary family to 50", () => {
  expect(estimateCanonicalPitch(evidence(
    [{ pitch: 50, normalizedScore: 0.9, candidateCount: 2 }],
    [{ pitch: 51, normalizedScore: 1, candidateCount: 2 }],
  ))).toBe(50);
});

it("does not correct a family whose two buckets are below the supported range", () => {
  expect(estimateCanonicalPitch(evidence(
    [{ pitch: 29, normalizedScore: 1, candidateCount: 2 }],
    [{ pitch: 29, normalizedScore: 1, candidateCount: 2 }],
  ))).toBeNull();
});

it("does not correct a family whose two buckets are above the supported range", () => {
  expect(estimateCanonicalPitch(evidence(
    [{ pitch: 51, normalizedScore: 1, candidateCount: 2 }],
    [{ pitch: 51, normalizedScore: 1, candidateCount: 2 }],
  ))).toBeNull();
});

it("does not correct a boundary pair outside five-percent compatibility", () => {
  expect(estimateCanonicalPitch(evidence(
    [{ pitch: 30, normalizedScore: 1, candidateCount: 2 }],
    [{ pitch: 28, normalizedScore: 1, candidateCount: 2 }],
  ))).toBeNull();
});
```

The first two assertions catch removal of the correction. The remaining assertions catch accidental expansion of the supported pitch range.

- [ ] **Step 2: Run the pure estimator test to verify RED**

Run:

```bash
npm test -- test/recognition/grid-evidence.test.ts
```

Expected: exactly the new `29/30` and `50/51` acceptance cases FAIL because the current weighted estimates are below 30 and above 50. Existing family, ambiguity, input-validation, and supported-range tests remain green.

- [ ] **Step 3: Implement the minimal post-selection correction**

In `src/recognition/grid-evidence.ts`, keep every step through weighted-estimate calculation unchanged. Add an internal helper with this behavior:

```ts
function supportedPitchAfterBoundaryCorrection(
  estimate: number,
  verticalPitch: number,
  horizontalPitch: number,
): number | null {
  if (estimate >= MIN_CANONICAL_PITCH && estimate <= MAX_CANONICAL_PITCH) return estimate;

  const touchesLowerBoundary = (
    (verticalPitch === MIN_CANONICAL_PITCH && horizontalPitch < MIN_CANONICAL_PITCH)
    || (horizontalPitch === MIN_CANONICAL_PITCH && verticalPitch < MIN_CANONICAL_PITCH)
  );
  if (
    estimate < MIN_CANONICAL_PITCH
    && touchesLowerBoundary
    && pitchesAreCompatible(verticalPitch, horizontalPitch)
  ) return MIN_CANONICAL_PITCH;

  const touchesUpperBoundary = (
    (verticalPitch === MAX_CANONICAL_PITCH && horizontalPitch > MAX_CANONICAL_PITCH)
    || (horizontalPitch === MAX_CANONICAL_PITCH && verticalPitch > MAX_CANONICAL_PITCH)
  );
  if (
    estimate > MAX_CANONICAL_PITCH
    && touchesUpperBoundary
    && pitchesAreCompatible(verticalPitch, horizontalPitch)
  ) return MAX_CANONICAL_PITCH;

  return null;
}
```

Replace only the final range-return expression:

```ts
return pitchesAreCompatible(best.vertical.pitch, best.horizontal.pitch)
  ? supportedPitchAfterBoundaryCorrection(estimate, best.vertical.pitch, best.horizontal.pitch)
  : null;
```

Do not round arbitrary estimates, widen `MIN_CANONICAL_PITCH` or `MAX_CANONICAL_PITCH`, or change family scoring.

- [ ] **Step 4: Run pure tests and typecheck to verify GREEN**

Run:

```bash
npm test -- test/recognition/grid-evidence.test.ts test/recognition/grid.test.ts
npm run typecheck
```

Expected: all estimator and strict-grid tests PASS; TypeScript exits zero. The existing `30/31` weighted estimate remains approximately 30.5 rather than being rounded.

- [ ] **Step 5: Re-run the formal Chromium evidence gate**

Run outside the macOS sandbox where required:

```bash
npm test -- test/recognition/browser-grid-evidence.test.ts
```

Expected: both tests PASS. The matrix evaluates all sixteen cases, asserts all eleven direct successes, and supplies hints for these five direct failures:

```text
1:canvas-scale-075 -> 30
1:canvas-scale-125 -> 50
2:canvas-scale-075 -> 30
2:canvas-scale-125 -> 50
3:canvas-scale-075 -> 30
```

The ambiguous two-pitch image and deterministic noise still produce `null`.

If this command fails, record the exact case, selected pair, estimate, and family scores in the spike report; record `coarse-pitch-gate-failed-after-boundary-amendment`; commit the tests, minimal correction, and failed result; then stop this plan. Do not attempt a second estimator change.

- [ ] **Step 6: Verify and commit Task 1**

Run:

```bash
npm test -- test/recognition/grid-evidence.test.ts test/recognition/grid.test.ts test/recognition/browser-grid-evidence.test.ts
npm run typecheck
git diff --check
```

Expected: 100 percent of the focused tests PASS, TypeScript exits zero, and the diff is whitespace-clean.

Commit:

```bash
git add src/recognition/grid-evidence.ts test/recognition/grid-evidence.test.ts test/recognition/browser-grid-evidence.test.ts
git commit -m "fix: handle grid pitch boundary quantization"
```

---

### Task 2: Restore the Deferred Strict-Only Evidence Baseline

**Files:**
- Create: `scripts/recognition/evaluate-grid-fallback.ts`
- Create: `test/recognition/evaluate-grid-fallback.test.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`

**Interfaces:**
- Consumes: `detectStrictGridAttempt()`, `estimateCanonicalPitch()`, `deriveBrowserImages("chromium", imagePath)`, and all sixteen formal cases after Task 1 passes.
- Produces: `evaluateGridEvidence(options): Promise<GridEvidenceEvaluationSummary>`, executable JSON diagnostics, a measured preliminary strict-only baseline, and literal decision `coarse-pitch-gate-passed`.

- [ ] **Step 1: Write the failing evaluator contract test**

Create `test/recognition/evaluate-grid-fallback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateGridEvidence } from "../../scripts/recognition/evaluate-grid-fallback.js";

describe("strict-only grid evidence evaluator", () => {
  it("evaluates the complete Chromium matrix in stable order", async () => {
    const summary = await evaluateGridEvidence({ warmupPasses: 0, measuredPasses: 1 });

    expect(summary.cases).toHaveLength(16);
    expect(summary.cases.map((value) => value.caseId)).toEqual([
      "0:source", "0:canvas-scale-075", "0:canvas-scale-125", "0:canvas-jpeg-q75",
      "1:source", "1:canvas-scale-075", "1:canvas-scale-125", "1:canvas-jpeg-q75",
      "2:source", "2:canvas-scale-075", "2:canvas-scale-125", "2:canvas-jpeg-q75",
      "3:source", "3:canvas-scale-075", "3:canvas-scale-125", "3:canvas-jpeg-q75",
    ]);
    expect(summary.cases.filter((value) => value.directStatus === "found")).toHaveLength(11);
    expect(summary.cases.filter((value) => value.pitchHint !== null)).toHaveLength(16);
    expect(summary.cases.every((value) => value.samplesMilliseconds.length === 1)).toBe(true);
    expect(Number.isFinite(summary.medianMilliseconds)).toBe(true);
    expect(Number.isFinite(summary.worstMilliseconds)).toBe(true);
  }, 120_000);
});
```

This test catches missing formal cases, unstable ordering, lost pitch evidence, and missing measurements. It does not assert exact elapsed times.

- [ ] **Step 2: Run the evaluator test to verify RED**

Run:

```bash
npm test -- test/recognition/evaluate-grid-fallback.test.ts
```

Expected: FAIL because `scripts/recognition/evaluate-grid-fallback.ts` does not exist.

- [ ] **Step 3: Implement the strict-only evaluator**

Create `scripts/recognition/evaluate-grid-fallback.ts` with these exports:

```ts
export interface GridEvidenceEvaluationCase {
  readonly caseId: string;
  readonly pixelHash: string;
  readonly directStatus: "found" | "rejected" | "ambiguous" | "budget-exhausted";
  readonly pitchHint: number | null;
  readonly geometry: GridGeometry | null;
  readonly refinedPairCount: number;
  readonly samplesMilliseconds: readonly number[];
}

export interface GridEvidenceEvaluationSummary {
  readonly engine: "chromium";
  readonly warmupPasses: number;
  readonly measuredPasses: number;
  readonly cases: readonly GridEvidenceEvaluationCase[];
  readonly medianMilliseconds: number;
  readonly worstMilliseconds: number;
}

export async function evaluateGridEvidence(options?: {
  readonly warmupPasses?: number;
  readonly measuredPasses?: number;
}): Promise<GridEvidenceEvaluationSummary>;
```

Implementation requirements:

1. Default to one warmup pass and three measured passes. Validate both options as non-negative safe integers and require `measuredPasses >= 1`.
2. Load fixtures in manifest order and generate Chromium derivatives once. Retain the sixteen decoded RGBA buffers so browser decoding is outside measured detection time.
3. For every warmup and measured call, run `detectStrictGridAttempt(image, fixture)` and derive `pitchHint` only from its returned `coarseEvidence`.
4. Measure only the strict attempt plus pitch estimation with `performance.now()`; elapsed time never affects control flow.
5. Hash input RGBA bytes with Node SHA-256 and emit lowercase hexadecimal.
6. Require status, geometry, hint, refined-pair count, and input hash to remain identical across measured passes; throw an explicit error naming the case and field on drift.
7. Calculate median over all measured case samples using sorted numeric values; use the maximum sample as worst.
8. When executed directly, print `JSON.stringify(await evaluateGridEvidence(), null, 2)` followed by one newline. Do not write tracked or generated files.

Node-only imports remain under `scripts/`; no module under `src/recognition/` imports this evaluator.

- [ ] **Step 4: Run the evaluator test to verify GREEN**

Run outside the sandbox where required:

```bash
npm test -- test/recognition/evaluate-grid-fallback.test.ts
npm run typecheck
```

Expected: the evaluator contract test PASS and TypeScript exits zero.

- [ ] **Step 5: Capture the three-pass baseline**

Run:

```bash
npx tsx scripts/recognition/evaluate-grid-fallback.ts
```

Expected: valid JSON with `engine: "chromium"`, one warmup pass, three measured passes, sixteen cases in stable order, eleven `found` direct statuses, five direct failures with non-null hints, and finite median/worst milliseconds.

- [ ] **Step 6: Update the gate report from measured output**

Update `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`:

- retain the initial failed-gate evidence under `Initial Gate`;
- add `Amended Gate` describing the exact `29/30 -> 30` correction;
- update the baseline matrix so `3:canvas-scale-075` has pitch hint 30;
- record the measured strict-only median and worst values as preliminary diagnostic context, explicitly not the later performance denominator;
- retain the ambiguous/noise negative outcomes;
- set the literal final decision to `coarse-pitch-gate-passed`.

Do not erase or rewrite the historical reason the first gate failed.

- [ ] **Step 7: Verify and commit Task 2**

Run:

```bash
npm test -- test/recognition/grid.test.ts test/recognition/grid-evidence.test.ts test/recognition/browser-grid-evidence.test.ts test/recognition/evaluate-grid-fallback.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests PASS, TypeScript exits zero, the report has no placeholder text, and the final report decision is `coarse-pitch-gate-passed`.

Commit:

```bash
git add scripts/recognition/evaluate-grid-fallback.ts test/recognition/evaluate-grid-fallback.test.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
git commit -m "test: record amended grid evidence gate"
```

---

## Execution Handoff

If Task 1 fails, stop after its failed-gate commit and return to design review. If Tasks 1 and 2 pass and both task reviews are clean, mark this supplemental plan complete and resume at **Task 2: Add Deterministic Canonical Resampling** in `docs/superpowers/plans/2026-08-24-canonical-grid-fallback.md`. Do not repeat that plan's completed Task 1 strict extraction.
