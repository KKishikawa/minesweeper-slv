# Canonical Grid Fallback Partial Adoption Design

## Status

Approved direction, pending independent design review. This document changes the acceptance target after the reviewed 16-case fallback and ambiguity-revalidation spikes stopped safely at 14/16.

It does not reinterpret those spikes as passing. Their failure decisions remain part of the evidence. This design separately decides whether the verified fail-closed subset is useful and safe to adopt.

## Evidence

The current direct detector finds eleven of sixteen formal Chromium derivatives. The canonical fallback adds three deterministic successes:

- `1:canvas-scale-125`;
- `2:canvas-scale-125`;
- `3:canvas-scale-075`.

Two cases remain safely rejected:

- `1:canvas-scale-075`: three canonical candidates and three original-space survivors;
- `2:canvas-scale-075`: one canonical candidate and zero survivors because the unchanged original-space weak-overlap and outer-boundary competition rejects it.

All focused negative and unit tests pass (77/77), every case stays below the shared 20,000-pair budget, and no global threshold was changed.

## Decision

Adopt the canonical fallback as a fail-closed improvement from 11/16 to 14/16, subject to the unchanged performance gate and independent implementation review.

The product guarantee is not “all supported images are recognized.” It is:

- direct strict success remains authoritative;
- three measured scale derivatives additionally succeed through source-revalidated fallback;
- ambiguous or insufficiently supported images return `null` rather than a guessed grid;
- the two measured unresolved derivatives remain explicit formal rejections;
- manual board correction remains the eventual product fallback for grid-not-found results.

Runtime code must not branch on case IDs, fixture names, expected bounds, browser engines, or the expected 14/16 outcome.

## Formal Matrix

The Chromium regression retains all sixteen inputs.

- Eleven cases must return `stage: "direct"` and non-null public geometry.
- Three cases must return `stage: "fallback"` and non-null public geometry.
- `1:canvas-scale-075` and `2:canvas-scale-075` must return `stage: "source-revalidation-rejected"` and public `null`.

The exact two rejection IDs exist only in test data and reports. Production decisions continue to derive solely from image evidence.

For the fourteen successes, bounds and pitch use the existing tolerances. For the two rejections, diagnostics must remain deterministic: candidate count, survivor count, refinement counts, normalized hash, and stage equal the first run.

Any regression of a direct success, fallback success, or negative rejection stops adoption. An unresolved rejection becoming success also stops adoption until independently reviewed; the test must not silently broaden the guarantee.

## Safety Invariants

Partial adoption retains every invariant from the implemented fallback:

- one normalization at one evidence-derived pitch;
- canonical pitches only from 30 through 50 pixels;
- one shared 20,000-pair refinement budget;
- at most eight canonical ambiguity candidates, with no truncation;
- exactly one original-space survivor required;
- unchanged direct/canonical strict phase thresholds;
- original-space support, outer-boundary, pitch/aspect, competition, and score-separation checks;
- no second source candidate enumeration;
- invalid, ambiguous, over-budget, or unsupported input returns `null`.

The two formal rejections are accepted product limitations, not exceptions in the algorithm.

## Performance and Determinism

Acquire the Chromium-derived RGBA inputs through the existing browser helper, retain all sixteen buffers, and measure strict-only and complete direct-first detection over those identical buffers in the same Node/test process. This does not require one persistent Chromium launch; the current helper may launch per source fixture.

- median complete-path time / strict-only median must be at most 1.25;
- worst complete-path time / strict-only worst must be at most 2.0;
- all input hashes, normalized hashes, geometries or null results, stages, candidate/survivor counts, and pair counts must match across three runs;
- each case's direct plus canonical refinement count must be at most 20,000.

Performance failure stops adoption. Do not add caching or relax ratios in this plan.

## Recognition Decision

After the grid fallback passes the partial-adoption functional, safety, determinism, and performance gates, rerun the existing recognition candidate and fold suites for evidence.

The two formal grid rejections are expected to remain `grid-not-found`. Therefore this partial-adoption project cannot authorize prototype-bank or classifier adoption. The recognition result remains rejected unless a later separately reviewed grid design expands the formal guarantee.

Task 6 may update measured expectations and reports only. It must not create a generated product bank or modify runtime classifier, recognition, or prototype modules.

## Decisions and Reporting

Retain these historical decisions unchanged:

- `coarse-pitch-gate-passed`;
- `canonical-ambiguity-revalidation-failed`.

Add a separate partial-adoption decision:

- `canonical-grid-fallback-partial-adoption-passed` only after functional, safety, determinism, budget, and performance gates all pass;
- otherwise `canonical-grid-fallback-partial-adoption-failed`.

Do not replace a failed-spike literal with the partial-adoption literal.

## Stop Conditions

Stop before recognition measurement when:

- the result differs from the exact 11 direct / 3 fallback / 2 fail-closed matrix;
- any focused negative returns geometry;
- determinism, budget, median, or worst performance fails;
- implementation requires fixture/runtime branching or threshold changes.

Stop classifier work unconditionally after recognition measurement. This design does not contain an adoption branch for the classifier.
