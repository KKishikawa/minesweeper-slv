# Canonical Grid Fallback Design

## Status

Approved for implementation planning, with the coarse-pitch evidence gate still pending. This document scopes the grid-detection follow-up to the rejected multi-prototype recognition spike. It does not authorize UI, solver, capture, clipboard, upload, classifier, or product-bank work.

## Problem

The formal Chromium matrix contains sixteen 30 by 16 board images: four source screens, each evaluated as source pixels, 0.75x Canvas resize, 1.25x Canvas resize, and Canvas JPEG. The current detector finds eleven grids and rejects five Canvas-resized cases:

- `1:canvas-scale-075`;
- `1:canvas-scale-125`;
- `2:canvas-scale-075`;
- `2:canvas-scale-125`;
- `3:canvas-scale-075`.

The browser-generated pixels are deterministic and match the recorded hashes. Every failed case has the expected pitch and a candidate within three pixels of the expected bounds. Axis enumeration succeeds, refinement work remains between 397 and 3,251 candidate pairs, and the 20,000-pair work limit is not involved.

The failures occur after correct candidates have been generated:

- three candidates fail the fixed 0.90 intersection-support gate after Canvas scaling spreads local edge energy;
- one correct candidate is treated as ambiguous against a near-duplicate extent because their score separation is 1.10 percent rather than five percent;
- one correct candidate fails a fixed one-pixel interior-phase consistency check.

Simple threshold changes are unsafe or incomplete. A larger support window recovers only two cases in the full comparison, candidate clustering that preserves negative cases recovers none, and a permissive pyramid finds all sixteen grids but accepts two wrong-grid negative cases.

The root problem is that strict validation uses fixed-pixel evidence after candidates have been generated at different observed cell pitches. The correction must normalize scale without weakening wrong-grid rejection.

## Goals

- Preserve the existing `detectGrid(image, dimensions): GridGeometry | null` API.
- Preserve the current strict detector as the first and authoritative path.
- Find all sixteen formal Chromium grids with no fixture-specific coordinates or labels.
- Keep every existing wrong-grid and ambiguity protection.
- Normalize at most once, using a pitch inferred from image evidence.
- Revalidate the normalized result against the original pixels before returning it.
- Share a 20,000-pair refinement budget across every stage.
- Keep median detection time within 1.25 times baseline and worst-case time within two times baseline.
- Produce deterministic pixels and geometry across supported JavaScript runtimes.

## Non-Goals

- Changing cell classification, prototype geometry, threshold calibration, or fold rules.
- Adopting or generating a product prototype bank merely because grids improve.
- Supporting observed cell pitches outside 30 through 50 pixels in the fallback path.
- Adding a general image pyramid or retrying arbitrary scales.
- Using browser Canvas, Sharp, platform-native image APIs, fixture identifiers, expected bounds, or expected labels in runtime grid detection.
- Extending the product UI, solver, or capture workflow.

## Decision

Use a direct-first, fail-closed, two-stage detector:

1. Run the existing strict detector on the original RGBA image.
2. Return immediately when strict detection succeeds.
3. When strict detection rejects the image, reuse its coarse axis evidence to estimate one observed pitch.
4. Continue only when the estimate is unambiguous and lies from 30 through 50 pixels.
5. Resample the image once so the estimated pitch becomes 40 pixels.
6. Run the same strict detector on the canonical image using the remaining refinement budget.
7. Map the selected candidate and its boundary evidence back to original coordinates.
8. Revalidate the mapped candidate against original-image edge profiles.
9. Return the geometry only when original-space validation passes; otherwise return `null`.

Scale-aware relaxation inside the strict validator is rejected because it reached only thirteen of sixteen formal cases. A multi-scale pyramid is rejected because it accepted projected-line and displaced competing-grid negatives, could consume three refinement budgets, and exceeded the worst-case performance limit.

## Components

### Strict Detector

Extract the present strict path into an internal operation with this conceptual result:

```ts
type StrictGridAttempt =
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
```

`ValidatedGridCandidate` retains the refined vertical and horizontal boundaries and the validation measurements needed for original-space revalidation. `SourceGridValidationContext` retains the original edge profiles and the already-refined competing candidates from the first strict attempt. The fallback reuses this context; it does not rebuild profiles or enumerate candidates again. Both types remain internal and are not part of the browser-facing recognition contract.

The strict algorithm, thresholds, candidate ordering, and existing negative behavior do not change in this project except where refactoring is required to return evidence and account for work.

### Coarse Pitch Estimator

The estimator consumes only axis candidates already produced by the failed strict attempt. It must not scan pixels or enumerate a second candidate matrix.

For each axis, candidates are grouped into integer-pitch buckets. Each bucket retains its best boundary-sequence score normalized by the best score on that axis and its candidate count. Sorted buckets form a pitch family only while the minimum and maximum pitch in that family differ by at most five percent; this complete-link rule prevents a chain of adjacent pitches from merging a broad range. Origins and extents do not create additional pitch families.

A pitch estimate is usable only when:

- both axes have evidence;
- a family contains compatible X and Y buckets whose pitches differ by at most five percent;
- the family score, defined as the lower of its best normalized X and Y scores, is at least 0.65;
- `(bestFamilyScore - runnerUpFamilyScore) / bestFamilyScore` is at least `0.05`, or no competing family exists;
- the score-weighted X/Y pitch estimate differs by at most five percent;
- the combined estimate is between 30 and 50 pixels inclusive.

If more than one family remains plausible, the estimator returns no hint. It never selects an origin, extent, or final grid.

The estimated pitch is the score-weighted mean of the best X and Y pitch buckets in the unique family. Tests must pin the family construction, ambiguity handling, and boundary values before integration.

The five-percent family-separation rule has not yet been validated against the formal browser matrix. The first implementation-plan task is therefore an evidence gate, not production integration: expose the existing coarse evidence to offline tests and verify that this single fixed rule yields a hint for all five direct failures, does not alter the eleven direct successes, and yields no usable hint for ambiguous-pitch or noise negatives. Projected-line and displaced-grid negatives may contain a real dominant pitch; they are rejected later by strict canonical detection or original-space revalidation, not by inventing an extent decision in the pitch estimator. If the evidence gate fails, stop the plan and return to this design. Do not tune multiple thresholds while implementing the fallback; a different estimator requires a new reviewed design.

### Deterministic Canonical Resampler

The canonical scale is:

```text
scale = 40 / estimatedPitch
```

The resampler accepts RGBA pixels and produces RGBA pixels with:

```text
outputWidth  = round(inputWidth  * scale)
outputHeight = round(inputHeight * scale)
```

It uses bilinear center sampling. For output coordinate `o`, the unclamped input coordinate is:

```text
((o + 0.5) / scale) - 0.5
```

The coordinate is clamped to the valid input interval. Neighbor indices use floor and the next clamped integer. Each channel is interpolated in Float64 arithmetic, rounded to the nearest integer with `Math.round`, and clamped to 0 through 255. No Canvas, color conversion, gamma correction, or platform codec is involved.

The fallback refuses non-finite scales, invalid image shapes, integer overflow, zero-sized output, or normalized images above 4,000,000 pixels. Because accepted input pitch is 30 through 50, the scale is bounded from 0.8 through 1.333 recurring.

### Coordinate Mapping

Canonical boundary coordinates map back through the pixel-center inverse:

```text
original = ((canonical + 0.5) / scale) - 0.5
```

Mapped boundary evidence remains floating point until final geometry construction. Bounds use mapped first and last refined boundaries. Public integer rectangles continue to use the existing deterministic cell-tiling rules; no independent rounding policy is introduced for individual cells.

The maximum allowed disagreement between the mapped canonical pitch and the original coarse pitch is 0.1 cell. Greater disagreement returns `null`.

### Original-Space Revalidation

Original-space revalidation reuses the edge profiles and refined candidate evidence stored by the first strict attempt. It does not rebuild profiles or enumerate alternative grids. It applies the strict safety evidence to the mapped boundaries:

- outer-boundary distinctiveness and balance;
- minimum outer-boundary energy;
- at least 0.90 intersection support;
- X/Y pitch difference at most five percent;
- interior boundary-phase consistency using the existing original-space rule;
- competing-extent ambiguity rejection.

The revalidator may search only within the existing boundary-refinement radius around each mapped boundary. It compares the mapped candidate with the already-refined original candidates to preserve competing-extent ambiguity rejection, but cannot add candidates, change pitch family, move the origin by a full cell, change board dimensions, or change extent. Failure of any check returns `null`.

## Work Budget

The existing 20,000 grid-candidate refinement limit becomes one explicit per-call budget object. It records consumed refinement pairs and rejects any reservation exceeding the remaining amount.

- Original strict detection consumes its actual refined-pair count.
- Pitch estimation reuses coarse evidence and consumes no refinement pairs.
- Canonical strict detection may reserve only the remaining pairs.
- Original-space revalidation evaluates one mapped candidate and records diagnostic work separately, but cannot enumerate candidate pairs.

Axis sequence-count and retained-axis-candidate limits remain unchanged. A fallback cannot obtain a second independent 20,000-pair allowance.

## Failure Handling

Every new failure is fail-closed:

- missing or ambiguous coarse evidence;
- pitch outside the verified range;
- incompatible X/Y pitch;
- invalid or oversized normalized image;
- insufficient remaining budget;
- canonical strict rejection;
- inverse-mapping disagreement;
- original-space validation failure.

All return `null` from `detectGrid()`. Recognition continues to expose its existing `grid-not-found` result. No partial geometry is returned.

Internal diagnostics distinguish direct success, hint rejection, normalization rejection, canonical rejection, source revalidation rejection, and budget exhaustion. These diagnostics are available to tests and offline spike tooling only; the public runtime result remains unchanged.

The internal diagnostic entry point executes the same orchestration used by `detectGrid()` and returns the stage, direct and canonical refinement counts, and the normalized image when one was produced. The public wrapper only projects its `GridGeometry | null` result. Tests and measurement scripts must not duplicate the fallback control flow.

## Determinism and Compatibility

The algorithm operates only on RGBA arrays and ECMAScript numeric operations. It does not branch on browser engine, operating system, elapsed time, fixture identity, expected result, or cell content.

The same input pixels, dimensions, and budget must produce byte-identical normalized RGBA data and identical geometry in Chromium and Node. Run the same checks in Firefox and Playwright WebKit to measure compatibility, and persist their equality status and exact mismatch diagnostics in the spike report, but do not use their result as the formal acceptance decision. Playwright WebKit remains a compatibility proxy and is not called Safari.

## Testing Strategy

Implementation follows test-driven development.

### Unit Tests

- pitch-family grouping and five-percent compatibility;
- unique-family acceptance and ambiguous-family rejection;
- inclusive 30 and 50 pixel boundaries and out-of-range rejection;
- deterministic bilinear center sampling with fixed byte fixtures;
- output-size, overflow, and pixel-count guards;
- forward and inverse coordinate mapping;
- shared-budget accounting and exhaustion;
- original-space validation of a mapped candidate;
- preservation of direct success without invoking fallback.

Before resampler or fallback integration, run the coarse-estimator evidence gate described above. Failure of that gate stops implementation without changing `detectGrid()` behavior.

### Positive Integration Matrix

- All sixteen formal Chromium cases find a grid.
- Every returned bound is within 0.1 observed cell pitch of labeled bounds.
- X/Y pitch and aspect invariants remain satisfied.
- Existing source, JPEG, and deterministic Sharp derivative tests remain unchanged.
- Three repeated runs produce identical normalized hashes and geometry.

### Negative Integration Matrix

All existing negative grid tests must continue to return `null`, including deterministic noise, sparse or missing intersections, ambiguous competing extents, shifted boundaries, candidate overflow, and work-budget rejection.

Add fallback-specific negatives for:

- projected lines with less than 90 percent intersection support;
- competing grids displaced by two through four pixels;
- two plausible pitch families;
- a unique pitch outside 30 through 50 pixels;
- canonical success followed by original-space boundary failure;
- direct and canonical attempts whose combined refinement work exceeds 20,000.

### Performance

Measure the strict-only path and the complete direct-first fallback path in the same process, over the same already-decoded sixteen Chromium image buffers, with interleaved ordering and the same warm-up policy. The strict-only entry point is the extracted unchanged detector, so the comparison does not rely on timings saved by a previous process.

- Median grid-detection time must be no more than 1.25 times baseline.
- Worst-case time must be no more than two times baseline.
- Refinement pairs across direct and canonical stages must not exceed 20,000.
- Performance measurements never affect classification or control flow.

### Final Recognition Gate

After grid tests pass, rerun the complete recognition spike. Record the new final-bank, calibration, and four whole-screen holdout results in a fresh report.

Grid success does not imply classifier adoption. If threshold calibration or any fold still fails, preserve the rejection and stop. Do not change classifier labels, prototypes, thresholds, fold rules, UI, solver, or capture behavior in this project.

## Delivery Boundaries

This is a small architectural change because it introduces an internal coarse-evidence boundary, deterministic resampling stage, shared work-budget state, and original-space revalidation. It should be implemented as a separate plan on the existing feature branch or a child feature branch, with independent task reviews.

The product design may claim a new Chromium grid guarantee only after the full positive and negative matrices pass. Firefox and WebKit results remain compatibility information. The verified fallback pitch range remains 30 through 50 pixels until additional labeled fixtures expand it.
