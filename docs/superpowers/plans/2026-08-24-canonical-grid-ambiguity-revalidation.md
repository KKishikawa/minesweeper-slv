# Canonical Grid Ambiguity Revalidation Spike Implementation Plan

> Execute with subagent-driven development. Use TDD for every behavior change and independent review before resuming the parent plan.

**Goal:** Resolve the three remaining formal Chromium grids through bounded original-space candidate disambiguation and alias-safe boundary provenance, without changing global strict thresholds or existing negative behavior.

**Architecture:** Preserve direct strict detection. Let a canonical ambiguous attempt expose only its final, already-validated distinct candidates. Revalidate at most eight candidates against one retained source context and accept only exactly one survivor. Replace only the fallback mapped-phase median-offset check with bounded provenance checks; keep source support, outer-boundary, pitch, and competition gates.

**Spec:** `docs/superpowers/specs/2026-08-24-canonical-grid-ambiguity-revalidation-design.md`

**Base state:** Parent-plan Tasks 1–3 are committed through `7951258`. Parent Task 4 has an intentionally uncommitted 13/16 implementation and tests. Preserve that working diff; this plan either completes it for one reviewed Task 4 commit or leaves it uncommitted on a stop condition.

After independent design review, commit this spec and plan alone before resuming production edits. The later review package spans from `7951258` through the final Task 4 commit, so it contains both the reviewed design commit and implementation.

## Global constraints

- Do not change global score, support, phase, pitch, outer-boundary, or work-budget constants.
- Do not add fixture, expected-bound, browser-engine, operating-system, or Node/browser runtime branches.
- Do not resample more than once or enumerate a second source candidate matrix.
- Do not truncate ambiguity candidates: more than eight fails closed.
- Direct strict behavior and public API remain unchanged.
- Chromium is formal; other engines remain informational.
- A failed supplemental gate stops the parent plan before Tasks 5–6.

## Reviewed design checkpoint

After the design review is clean, run `git diff --check`, stage only the new supplemental spec and plan, and commit them with the existing signing configuration:

```bash
git add docs/superpowers/specs/2026-08-24-canonical-grid-ambiguity-revalidation-design.md docs/superpowers/plans/2026-08-24-canonical-grid-ambiguity-revalidation.md
git commit -m "docs: design canonical ambiguity revalidation"
```

The existing Task 4 production/test diff remains unstaged during this checkpoint.

---

### Task 1: Surface Bounded Final Ambiguity Candidates

**Files:**
- Modify: `src/recognition/grid-strict.ts`
- Modify: `test/recognition/grid.test.ts`
- Modify: `test/recognition/grid-fallback.test.ts`

**Produces:** An internal canonical ambiguity candidate list made only from the final distinct candidates already computed by strict detection.

1. Write RED tests proving:
   - an ambiguous strict attempt exposes deterministic range-score-ordered `GridBoundaryCandidate` values;
   - candidates rejected by phase/support/weak-overlap filters are not exposed;
   - `found` still exposes exactly its selected candidate;
   - `rejected` and `budget-exhausted` do not invent candidates;
   - direct public geometry remains unchanged;
   - a paired strict-only characterization fixes the existing one-pixel interior-phase acceptance boundary and two-pixel rejection boundary without invoking fallback.
2. Run:

   ```bash
   npm test -- test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts
   ```

   Expected RED: the ambiguity candidate field/operation does not exist.
3. Add `GridBoundaryCandidate` containing canonical vertical/horizontal boundaries and range score. Keep `ValidatedGridCandidate extends GridBoundaryCandidate` with its existing geometry. `found` retains the validated candidate; `ambiguous` receives `readonly GridBoundaryCandidate[]`; rejected and exhausted attempts receive none.
4. Project ambiguous candidates only after existing phase, support, weak-overlap, and distinct filtering. Projection copies canonical boundaries and range score and cannot perform endpoint reconciliation or create geometry. Determine strict status from the full candidate list. Do not change `hasSeparatedScore()` or candidate ordering.
5. Run the focused tests and `npm run typecheck`. Expected GREEN with unchanged direct results.

Stop immediately if obtaining candidates requires repeating refinement or weakening a strict filter.

---

### Task 2: Revalidate Ambiguity and Replace Mapped-Phase Duplication

**Files:**
- Modify: `src/recognition/grid-fallback.ts`
- Modify: `src/recognition/grid-strict.ts`
- Modify: `test/recognition/grid-fallback.test.ts`

**Produces:** Exactly-one-survivor orchestration and alias-safe mapped-boundary provenance.

1. Write pure orchestration RED tests:
   - canonical `ambiguous` with one source survivor returns `stage: "fallback"`;
   - zero and two survivors return `stage: "source-revalidation-rejected"`;
   - canonical `ambiguous` with nine candidates returns `stage: "canonical-rejected"` without revalidation;
   - candidate order cannot change the exactly-one result;
   - canonical `found` behavior remains unchanged.
2. Implement one helper that revalidates the eligible candidate list using the existing `revalidate` operation. It must collect all survivors before deciding; do not return the first success. Candidate count must be from 1 through 8, otherwise fail closed.
   - Change the candidate parameter of `CanonicalFallbackOperations.revalidate` and `revalidateMappedCandidate()` from `ValidatedGridCandidate` to `GridBoundaryCandidate`. `ValidatedGridCandidate` remains a subtype for canonical `found`; do not fabricate geometry for ambiguous candidates.
   - Return `{ geometry, survivorCount }` internally.
   - Add `canonicalCandidateCount` and `sourceSurvivorCount` to `GridDetectionDiagnosticResult`.
   - Define every stage explicitly: both are zero before canonical execution; found reports one candidate; ambiguous reports its complete final count; cap rejection reports zero survivors; completed revalidation reports every non-null survivor.
3. Write revalidation RED tests for:
   - the measured periodic two-pixel mapped/refined horizontal offset pattern;
   - a boundary outside the two-pixel refinement radius;
   - non-monotonic boundaries;
   - existing projected-line, displaced competing-grid, weak outer-boundary, pitch/aspect, and competing-extent negatives.
4. Extract and directly test `hasMappedBoundaryProvenance(mapped, refined)`. It checks equal non-empty shapes, finite values, strict increase on both arrays, and absolute displacement within `BOUNDARY_REFINEMENT_RADIUS`. Replace `hasConsistentMappedBoundaryPhase()` only in fallback source revalidation with this helper. Keep canonical strict and direct strict phase checks unchanged.
5. Retain all original-space support, outer-boundary, pitch, mapped/coarse disagreement, weak-overlap, competition, and score-separation checks.
6. Run:

   ```bash
   npm test -- test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-budget.test.ts test/recognition/grid-resample.test.ts test/recognition/grid-evidence.test.ts
   npm run typecheck
   git diff --check
   ```

Expected: all focused unit/negative tests PASS.

Stop if any existing negative must be weakened or relabeled.

---

### Task 3: Run the Supplemental Chromium Gate

**Files:**
- Modify: `test/recognition/browser-grid-fallback.test.ts`
- Modify: `src/recognition/grid-fallback.ts`
- Modify: `docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md`
- Modify: `.superpowers/sdd/2026-08-24-canonical-grid-fallback/task-4-report.md` (untracked execution record only)

1. Extend the browser diagnostic assertions to record canonical candidate count and source survivor count without duplicating orchestration.
2. Run the formal gate outside the sandbox if Chromium launch requires it:

   ```bash
   npm test -- test/recognition/browser-grid-fallback.test.ts
   ```

3. Require:
   - 16/16 public `detectGrid()` geometries within the existing tolerances;
   - exactly one source survivor for `1:canvas-scale-075`;
   - fallback success for `2:canvas-scale-075` and `2:canvas-scale-125`;
   - direct + canonical refined pairs at most 20,000 for every case.
4. Re-run the complete focused negative matrix. Any accepted negative stops the plan.
5. Update the spike report with the literal decision:
   - `canonical-ambiguity-revalidation-passed` only if every requirement passes;
   - otherwise `canonical-ambiguity-revalidation-failed`, including exact survivor counts and failing negatives.
6. On PASS, run:

   ```bash
   npm test -- test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-budget.test.ts test/recognition/grid-resample.test.ts test/recognition/grid-evidence.test.ts test/recognition/browser-grid-fallback.test.ts
   npm run typecheck
   git diff --check
   ```

7. Commit the completed parent Task 4 implementation and supplemental evidence with the existing signing configuration:

   ```bash
   git add src/recognition/grid.ts src/recognition/grid-strict.ts src/recognition/grid-fallback.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/browser-grid-fallback.test.ts docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md
   git commit -m "feat: add canonical grid fallback"
   ```

Do not commit a partial production fallback on FAIL. Preserve the diagnostic report and return to design review.

---

### Task 4: Independent Review and Parent-Plan Resume

1. Generate a review package from `7951258` through the Task 4 commit.
2. Use a fresh reviewer to verify spec compliance, fail-closed candidate handling, phase/provenance separation, all negative gates, browser evidence, and absence of runtime branches.
3. Return findings to the same implementer for TDD fixes, up to five rounds.
4. After a clean review, record this supplemental plan as complete and resume parent-plan Task 5. Do not claim final recognition success before parent Task 6.
