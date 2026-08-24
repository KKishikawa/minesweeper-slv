# Canonical Grid Fallback UX Performance Amendment Plan

> Execute with subagent-driven development, TDD, independent task review, and final whole-plan review.

**Goal:** Re-evaluate the committed 14/16 partial fallback against absolute desktop import latency, then run recognition as measurement-only evidence.

**Spec:** `docs/superpowers/specs/2026-08-24-canonical-grid-ux-performance-amendment-design.md`

**Base:** `fb69495`, which contains the exact functional matrix, deterministic evaluator, failed relative performance evidence, and retained-input verification.

## Design checkpoint

After independent design review, commit only this spec and plan with the existing signing configuration:

```bash
git add docs/superpowers/specs/2026-08-24-canonical-grid-ux-performance-amendment-design.md docs/superpowers/plans/2026-08-24-canonical-grid-ux-performance-amendment.md
git commit -m "docs: adopt grid fallback UX latency gate"
```

---

### Task 1: Verify the Absolute UX Performance Gate

**Files:**
- Modify: `test/recognition/evaluate-grid-fallback.test.ts`
- Modify: `scripts/recognition/evaluate-grid-fallback.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`

1. Extract or add a pure UX-decision helper and write RED assertions that the evaluator reports absolute thresholds (`500` median, `1000` worst), absolute pass/fail fields, and the separate UX decision while retaining ratio fields and the earlier failure evidence.
   - Ratios above their former limits with absolute latency inside `500/1000` must pass the UX latency decision.
   - Ratios inside their former limits with either absolute latency over its limit must fail.
   - The final partial-adoption decision must be the conjunction of exact functional matrix, negative safety, determinism, budget, and absolute latency; set each input false in turn and assert failure.
2. Do not change acquisition, warmup, interleaving, run count, timing boundaries, detector code, or formal matrix.
3. Run:

   ```bash
   npm test -- test/recognition/evaluate-grid-fallback.test.ts
   npx tsx scripts/recognition/evaluate-grid-fallback.ts
   ```

4. Require exact 11/3/2 paths, determinism, pair budget, complete median `<= 500`, and complete worst `<= 1000`.
5. Update the report without deleting the earlier ratio-gate failure.
   - On a compliant pass, add `canonical-grid-fallback-ux-performance-passed` and final `canonical-grid-fallback-partial-adoption-passed`.
   - On failure, add `canonical-grid-fallback-ux-performance-failed`, keep `canonical-grid-fallback-partial-adoption-failed`, commit the measured failure evidence, and stop before Task 2.
6. Verify:

   ```bash
   npm test -- test/recognition/browser-grid-evidence.test.ts test/recognition/browser-grid-fallback.test.ts test/recognition/evaluate-grid-fallback.test.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts
   npm run typecheck
   git diff --check
   ```

7. Commit the three specified files:

   ```bash
   git add test/recognition/evaluate-grid-fallback.test.ts scripts/recognition/evaluate-grid-fallback.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
   git commit -m "test: verify grid fallback UX latency"
   ```

8. Independent task review is required. Stop on any failed functional, safety, determinism, budget, or absolute latency gate.

---

### Task 2: Re-run Recognition as Measurement Only

**Files:**
- Modify: `docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md`
- Modify only for literal measured expectations: `test/recognition/generated-bank.test.ts`, `test/recognition/folds.test.ts`

1. Run:

   ```bash
   npm test -- test/recognition/generated-bank.test.ts test/recognition/folds.test.ts
   npm run spike:recognition
   ```

2. `npm run spike:recognition` is expected to exit `1` with `multi-prototype-rejected`. Treat that exact non-zero result as measured evidence, inspect the updated report and ignored artifacts, and continue this task. Exit `0`, a different decision, or an incidental error is unexpected and stops for review.
3. Require `1:canvas-scale-075` and `2:canvas-scale-075` to remain grid-not-found. Record all other recognition and fold results exactly.
4. Preserve or record `multi-prototype-rejected`. Do not create a product prototype bank or modify classifier, recognition, prototypes, or product design claims.
5. Run:

   ```bash
   npm test
   npm run typecheck
   git diff --check
   git status --short
   ```

6. Scan reports for placeholders, then commit only measured reports and literal expectation changes:

   ```bash
   rg -n -i 'T[B]D|T[O]DO|F[I]XME|REPLACE[_]ME|WRITE[_]HERE' docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md
   git add docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md test/recognition/generated-bank.test.ts test/recognition/folds.test.ts
   git commit -m "docs: record partial grid fallback result"
   ```

7. Request independent task review and a final whole-plan review. Stop after evidence delivery; no UI, solver, capture, clipboard, upload, or unrelated refactoring is authorized.
