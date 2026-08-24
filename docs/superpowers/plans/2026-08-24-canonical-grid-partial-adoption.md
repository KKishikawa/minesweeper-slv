# Canonical Grid Fallback Partial Adoption Implementation Plan

> Execute with subagent-driven development, TDD, independent task review, and final whole-plan review.

**Goal:** Adopt the verified 14/16 fail-closed grid fallback, preserve the two deterministic formal rejections, prove performance, and rerun recognition as measurement-only evidence.

**Architecture:** Commit the existing direct-first fallback after changing only its formal acceptance assertions and reporting. Then perform paired same-process performance/determinism evaluation across all sixteen cases. Finally rerun recognition without authorizing classifier adoption.

**Spec:** `docs/superpowers/specs/2026-08-24-canonical-grid-partial-adoption-design.md`

**Base:** Reviewed design checkpoint `de610d0`, plus the intentionally uncommitted parent Task 4 implementation and supplemental ambiguity-revalidation work.

## Global constraints

- No global threshold, filter, ordering, radius, pitch-range, or budget changes.
- No fixture ID, expected bound, browser engine, platform, or Node/browser runtime branch in production.
- Preserve the historical failed-spike decision and add a separate partial-adoption decision.
- Exact formal matrix: 11 direct success, 3 fallback success, 2 source-revalidation rejection.
- Chromium is formal. Firefox and Playwright WebKit remain informational.
- Classifier/prototype-bank adoption is forbidden in this plan.

## Reviewed design checkpoint

After independent design review, stage and commit only this spec and plan:

```bash
git add docs/superpowers/specs/2026-08-24-canonical-grid-partial-adoption-design.md docs/superpowers/plans/2026-08-24-canonical-grid-partial-adoption.md
git commit -m "docs: design partial grid fallback adoption"
```

Leave the production/test/report working diff unstaged.

---

### Task 1: Amend and Commit the Functional Gate

**Files:**
- Modify: `test/recognition/browser-grid-fallback.test.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`
- Existing uncommitted implementation: `src/recognition/grid.ts`, `src/recognition/grid-strict.ts`, `src/recognition/grid-fallback.ts`, `test/recognition/grid.test.ts`, `test/recognition/grid-fallback.test.ts`

1. Write/adjust the browser assertions before changing the report:
   - fourteen exact cases return public geometry within existing tolerance;
   - eleven exact cases remain `direct`;
   - `1:canvas-scale-125`, `2:canvas-scale-125`, and `3:canvas-scale-075` are `fallback`;
   - `1:canvas-scale-075` and `2:canvas-scale-075` are `source-revalidation-rejected` and public `null`;
   - their diagnostic candidate/survivor counts remain `3/3` and `1/0` respectively;
   - every case's direct plus canonical pair count is at most 20,000.
2. Run Chromium:

   ```bash
   npm test -- test/recognition/browser-grid-fallback.test.ts
   ```

   Expected: the exact partial-adoption matrix passes. Any different success or rejection is a stop, not an automatic expectation update.
3. Run the complete focused unit/negative matrix:

   ```bash
   npm test -- test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-budget.test.ts test/recognition/grid-resample.test.ts test/recognition/grid-evidence.test.ts
   npm run typecheck
   git diff --check
   ```

4. Update the report with a `Partial Adoption` section. Retain `canonical-ambiguity-revalidation-failed`; record the exact matrix and literal `canonical-grid-fallback-partial-adoption-functional-gate-passed`. This is not yet the final performance-qualified decision.
5. Stage only the implementation, tests, and report listed above. Respect commit signing and commit:

   ```bash
   git add src/recognition/grid.ts src/recognition/grid-strict.ts src/recognition/grid-fallback.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/browser-grid-fallback.test.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
   git commit -m "feat: add fail-closed canonical grid fallback"
   ```

6. Generate a review package from `7951258` through the implementation commit. A fresh reviewer must verify the complete parent Task 4, both supplemental design commits, ambiguity/provenance, and partial-gate changes. Return findings to the same implementer before Task 2.

---

### Task 2: Prove Determinism, Budget, and Performance

**Files:**
- Modify: `test/recognition/browser-grid-fallback.test.ts`
- Modify: `test/recognition/evaluate-grid-fallback.test.ts`
- Modify: `scripts/recognition/evaluate-grid-fallback.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`

1. Acquire the Chromium derivatives with the existing browser helper, retain the sixteen RGBA buffers, and run the detection matrix three times in one Node/test process. The helper may retain its current per-source Chromium launch lifecycle. Assert deterministic input/normalized hashes, geometry or null, stage, candidate/survivor counts, and pair counts.
2. Assert the exact 11 direct / 3 fallback / 2 source-revalidation-rejected paths on every run.
3. First extend `evaluate-grid-fallback.test.ts` with RED assertions for retained input reuse, alternating strict/complete execution order, three measured runs, null-geometry normalized hashes, pair fields, timing aggregates, and ratio fields. Then update the evaluator to decode and retain all sixteen buffers, warm strict-only and complete paths, alternate execution order, and measure three interleaved runs in identical case order.
4. Require every pair total `<= 20_000`, median ratio `<= 1.25`, and worst ratio `<= 2.0`.
5. Run:

   ```bash
   npm test -- test/recognition/evaluate-grid-fallback.test.ts
   npm test -- test/recognition/browser-grid-fallback.test.ts
   npx tsx scripts/recognition/evaluate-grid-fallback.ts
   ```

6. Persist all sixteen rows, three-run hashes, timings, ratios, compatibility evidence, and exact negative outcomes. Set `canonical-grid-fallback-partial-adoption-passed` only when every gate passes; otherwise set `canonical-grid-fallback-partial-adoption-failed` and stop before Task 3.
7. Verify and commit:

   ```bash
   npm test -- test/recognition/browser-grid-evidence.test.ts test/recognition/browser-grid-fallback.test.ts test/recognition/evaluate-grid-fallback.test.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts
   npm run typecheck
   git diff --check
   git add test/recognition/browser-grid-fallback.test.ts test/recognition/evaluate-grid-fallback.test.ts scripts/recognition/evaluate-grid-fallback.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
   git commit -m "test: verify partial grid fallback adoption"
   ```

8. Independent task review is required before recognition measurement.

---

### Task 3: Re-run Recognition as Measurement Only

**Files:**
- Modify: `docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md`
- Modify only for literal measured expectations: `test/recognition/generated-bank.test.ts`, `test/recognition/folds.test.ts`

1. Run:

   ```bash
   npm test -- test/recognition/generated-bank.test.ts test/recognition/folds.test.ts
   npm run spike:recognition
   ```

2. Require the two formal grid rejections to remain `grid-not-found`. Record all other threshold/fold outcomes exactly.
3. Record `multi-prototype-rejected`. Do not create a generated product bank and do not modify runtime classifier, recognition, prototypes, or product design claims.
4. Run the default suite and static checks:

   ```bash
   npm test
   npm run typecheck
   git diff --check
   git status --short
   ```

5. Scan reports for placeholders and commit only measured reports/expectation changes:

   ```bash
   rg -n -i 'T[B]D|T[O]DO|F[I]XME|REPLACE[_]ME|WRITE[_]HERE' docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md
   git add docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md test/recognition/generated-bank.test.ts test/recognition/folds.test.ts
   git commit -m "docs: record partial grid fallback result"
   ```

6. Independent task review and final whole-plan review are required. Stop after evidence delivery; UI, solver, capture, clipboard, upload, and unrelated refactoring remain outside this plan.
