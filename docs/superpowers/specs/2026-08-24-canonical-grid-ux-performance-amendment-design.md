# Canonical Grid Fallback UX Performance Amendment

## Status

Approved direction, pending independent design review. This amendment changes only the performance acceptance criterion for the reviewed 14/16 fail-closed partial adoption.

## Evidence

The paired same-process gate passed function, safety, determinism, and budget checks but failed the relative median criterion:

- strict-only median: about 233 ms;
- complete-path median: about 316 ms;
- median ratio: about 1.36, above 1.25;
- complete-path worst: about 604 ms;
- worst ratio: about 1.66, below 2.0.

Independent fresh runs reproduced median ratios around 1.34. The relative failure remains valid and must stay recorded as `canonical-grid-fallback-partial-adoption-failed` under the earlier gate.

## Product Context

Grid detection runs once after the user imports or captures an image. It is not an animation-frame, pointer-move, or solver-step operation. For this desktop workflow, absolute wait time is the relevant UX boundary; the strict-only implementation is an engineering comparison rather than a user-visible baseline.

## Decision

Adopt these absolute complete-path limits for the partial fallback:

- median detection time at most 500 ms;
- worst detection time at most 1,000 ms.

Continue to calculate and report strict-only median/worst and both ratios. Ratios remain diagnostic and may guide later optimization, but do not decide adoption under this amendment.

The measurement method remains unchanged:

- all sixteen Chromium-derived RGBA buffers are acquired before timing and retained;
- strict-only and complete paths are warmed;
- three measured runs use identical case order;
- strict/complete measurements are adjacent per case and their order alternates by run;
- browser acquisition, hashing, assertions, and report generation are outside detector timing;
- elapsed time never changes runtime control flow.

## Acceptance

The partial fallback passes only when all of these hold in one compliant run:

- exact 11 direct / 3 fallback / 2 source-revalidation-rejected matrix;
- three-run deterministic hashes, geometry or null, stages, candidate/survivor counts, and pair counts;
- every direct plus canonical pair count at most 20,000;
- focused negative matrix remains rejected;
- complete-path median at most 500 ms;
- complete-path worst at most 1,000 ms.

On pass, append the separate decision `canonical-grid-fallback-ux-performance-passed` and set the partial-adoption conclusion to `canonical-grid-fallback-partial-adoption-passed`. Preserve the earlier relative-gate failure and its literal.

On failure, record `canonical-grid-fallback-ux-performance-failed`, keep partial adoption failed, and stop before recognition measurement.

## Scope

This amendment authorizes no detector optimization, caching, threshold change, browser branch, classifier adoption, UI implementation, or additional image cases. Recognition remains measurement-only and must remain rejected because two formal inputs are still grid-not-found.
