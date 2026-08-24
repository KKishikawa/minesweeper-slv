# Canonical Grid Ambiguity Revalidation Spike Design

## Status

Approved supplemental feasibility design. This document amends only the unresolved Task 4 boundary in `2026-08-24-canonical-grid-fallback-design.md`. It does not authorize classifier, UI, capture, solver, fixture-specific, browser-engine-specific, or threshold-calibration changes.

## Problem

The direct-first canonical fallback reaches 13 of 16 formal Chromium grids while preserving the focused negative matrix. The remaining cases expose two assumptions that do not hold after deterministic bilinear normalization:

- `1:canvas-scale-075`: canonical strict detection retains three distinct candidates. The best and a physical one-cell-shifted runner-up have range scores `40.03619233484499` and `39.226181882282994`, only about 2.02 percent apart. The unchanged five-percent score-separation rule therefore returns `ambiguous`, so original-space revalidation never runs.
- `2:canvas-scale-075` and `2:canvas-scale-125`: canonical strict detection succeeds. Mapped pitch, aspect, and original-space intersection support pass, but five periodic horizontal boundaries differ from the median mapped/refined offset by two pixels. The existing one-pixel original-space phase rule rejects both.

The first case is extent ambiguity, not pitch-family ambiguity. The second is deterministic resampling aliasing, not missing source evidence. Relaxing the global five-percent ambiguity threshold or the global one-pixel phase threshold would weaken the strict direct detector and is not allowed.

## Goal

Determine whether bounded canonical ambiguity can be resolved by unchanged original-image evidence, and whether the redundant mapped-phase check can be replaced by an alias-safe provenance check, while preserving every existing negative result.

The spike succeeds only if all sixteen formal Chromium grids pass through the public `detectGrid()` path and the complete focused negative matrix remains rejected.

## Decision

### 1. Preserve the direct strict detector

Direct `found`, `rejected`, `ambiguous`, and `budget-exhausted` behavior remains unchanged. Direct ambiguity is never resolved by the fallback itself; it only permits the already-approved pitch-estimation and normalization step.

No global score, support, phase, pitch, or outer-boundary constant changes.

### 2. Expose only final canonical ambiguity candidates

`StrictGridAttempt` may retain the final distinct candidates that already passed canonical strict phase, support, and weak-overlap filters when the terminal result is `ambiguous`.

Candidate evidence is separated from final geometry:

```ts
interface GridBoundaryCandidate {
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly rangeScore: number;
}

interface ValidatedGridCandidate extends GridBoundaryCandidate {
  readonly geometry: GridGeometry;
}
```

`found` retains its `ValidatedGridCandidate`. `ambiguous` exposes `readonly GridBoundaryCandidate[]`. Projection from a final refined candidate copies its canonical vertical/horizontal boundaries and range score only, and cannot fail after the existing shape invariants. `rejected` and `budget-exhausted` expose no candidates. The terminal status is decided from the full final list before the eight-candidate fallback cap is applied; the cap never truncates or changes strict status.

The exposed candidates:

- are `GridBoundaryCandidate` projections of already-refined candidates;
- remain in deterministic range-score order;
- consume no additional refinement budget;
- do not include candidates rejected by canonical phase, support, or weak-overlap gates;
- are internal and never enter the browser-facing API.

At most eight candidates may enter original-space revalidation. The limit is fail-closed: more than eight candidates rejects the fallback without truncation. The observed unresolved formal case has three candidates. The cap bounds additional linear validation work without changing candidate enumeration or ordering.

Canonical `rejected` with no final candidates, and canonical `budget-exhausted`, still reject immediately.

### 3. Revalidate every eligible canonical candidate against the same source context

For canonical `found`, revalidate its single candidate as before. For canonical `ambiguous`, revalidate every eligible final candidate against the original image and the `SourceGridValidationContext` retained by the direct attempt.

Both `CanonicalFallbackOperations.revalidate` and `revalidateMappedCandidate()` accept `GridBoundaryCandidate`, not `ValidatedGridCandidate`. The found candidate remains a valid subtype, while ambiguous candidates do not fabricate geometry merely to enter source revalidation.

The same scale, observed pitch, source profiles, and already-refined source candidates are used for every candidate. Revalidation must not resample again, rebuild profiles, enumerate axis candidates, or reserve refinement pairs.

Return a fallback geometry only when exactly one canonical candidate survives original-space validation. Zero survivors and two or more survivors return `null`. Geometries that are exactly identical after mapping still count as multiple survivors unless their canonical candidates were already deduplicated by strict detection.

### 4. Replace only the redundant mapped-phase comparison

Every eligible canonical candidate has already passed the unchanged canonical strict interior-phase rule. Original-space revalidation continues to map each boundary through the center-sampling inverse and may refine it only within the existing two-pixel boundary-refinement radius.

The mapped-phase median-offset check is replaced with a pure, directly tested provenance invariant:

- each refined source boundary must be finite and remain within the existing refinement radius of its mapped canonical boundary;
- boundary order must remain strictly increasing;
- the first and final boundaries must preserve the candidate extent and may not move by a full cell;
- mapped/source pitch disagreement remains at most 0.1 observed cell;
- X/Y pitch difference remains at most five percent.

An internal `hasMappedBoundaryProvenance(mapped, refined)` helper checks equal non-empty shape, finite values, strict increase, and displacement no greater than `BOUNDARY_REFINEMENT_RADIUS`. Revalidation calls it after local refinement. Tests call the pure helper directly so out-of-radius, non-finite, unequal-length, and non-monotonic results are constructible without injecting a production refiner.

This does not increase the refinement radius and does not alter the direct detector's one-pixel phase rule. It recognizes that canonical strict already established phase, while original-space local maxima can alternate by two pixels after scaling.

### 5. Preserve independent source safety evidence

Every survivor must still pass all of these original-space checks:

- at least 0.90 intersection support;
- outer-boundary distinctiveness and balance;
- minimum outer-boundary energy;
- mapped/coarse pitch agreement;
- X/Y pitch and aspect agreement;
- comparison with the direct attempt's already-refined competing extents;
- weak-overlap filtering and unchanged five-percent score separation in source space.

Removing or weakening any of these checks is outside this spike.

## Diagnostics

Internal diagnostics add `canonicalCandidateCount` and `sourceSurvivorCount`. They must not include fixture identifiers or expected geometry and must not alter control flow.

Both values are zero before a canonical attempt. A canonical `found` reports one candidate. A canonical `ambiguous` reports the complete final distinct count, including counts above eight. Cap rejection reports zero survivors. After revalidation, `sourceSurvivorCount` reports the complete number of non-null results; the orchestrator still accepts only exactly one.

The report records, per formal fallback case:

- canonical attempt status;
- canonical candidate count;
- source survivor count;
- direct/canonical refinement counts;
- final stage and geometry.

## Tests

### Pure orchestration

- canonical `found` revalidates one candidate;
- canonical `ambiguous` with one survivor returns that geometry;
- canonical `ambiguous` with zero or multiple survivors fails closed;
- nine candidates fail closed without calling revalidation;
- direct success, missing evidence, normalization failure, and budget exhaustion remain unchanged;
- the same source context and budget lineage are retained.

### Revalidation

- accept a canonical-phase-validated candidate whose source local maxima have the measured periodic two-pixel alias pattern but remain within the refinement radius;
- reject non-monotonic, non-finite, or out-of-radius mapped/refined boundaries;
- retain projected-line, displaced competing-grid, weak outer-boundary, pitch disagreement, aspect disagreement, and ambiguous competing-extent rejection;
- retain the unchanged direct one-pixel phase tests.

### Formal Chromium gate

- all sixteen public-path geometries are non-null and within the existing bound/pitch tolerances;
- the unresolved canonical ambiguity has exactly one source survivor;
- both periodic-phase cases pass through fallback;
- every existing focused grid negative remains `null`;
- total direct plus canonical refinement pairs remain at most 20,000.

Firefox and Playwright WebKit may be measured later as informational compatibility evidence. Chromium alone decides this spike.

## Stop Conditions

Stop and record the spike as failed without further threshold tuning if any of these occurs:

- the unresolved canonical ambiguity has zero or multiple source survivors;
- any existing negative returns geometry;
- any formal Chromium case remains `null`;
- more than eight canonical candidates are required;
- a second normalization, new candidate enumeration, fixture branch, or global threshold change is required;
- the shared 20,000-pair budget is exceeded.

Task 5 performance and Task 6 recognition decisions resume only after this supplemental gate passes and receives independent review.
