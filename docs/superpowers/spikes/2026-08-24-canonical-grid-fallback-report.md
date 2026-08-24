# Canonical grid fallback: Task 1 gate record

## Gate

The formal Chromium evidence gate failed on `3:canvas-scale-075`.

The strict attempt was `ambiguous` with 397 compatible refined pairs. The fixed complete-link rule selected the `29–30` family: vertical pitch 30 had normalized score 1.0000000000, horizontal pitch 29 had normalized score 0.8661677576, and the family score was 0.8661677576. Its score-weighted pitch was 29.536, which is below the inclusive lower bound of 30, so `estimateCanonicalPitch()` returned `null`.

Relevant alternatives were vertical 32 / horizontal 32 (family score 0.6623065724) and vertical 33 / horizontal 33 (family score 0.6635431172). The selected family exceeded the strongest alternate by 23.39%, so the failure was the fixed pitch-range decision rather than the five-percent score-separation decision.

## Baseline Matrix

| Case | Direct status | Pitch hint | Refined pairs |
| --- | --- | ---: | ---: |
| 0:source | found | 40 | 2240 |
| 0:canvas-scale-075 | found | 30 | 1392 |
| 0:canvas-scale-125 | found | 50 | 1640 |
| 0:canvas-jpeg-q75 | found | 40 | 2325 |
| 1:source | found | 40 | 2718 |
| 1:canvas-scale-075 | ambiguous | 30 | 2155 |
| 1:canvas-scale-125 | ambiguous | 50 | 1296 |
| 1:canvas-jpeg-q75 | found | 40 | 2791 |
| 2:source | found | 40 | 3251 |
| 2:canvas-scale-075 | ambiguous | 30 | 2207 |
| 2:canvas-scale-125 | ambiguous | 50 | 1825 |
| 2:canvas-jpeg-q75 | found | 40 | 3212 |
| 3:source | found | 39.5338816569 | 750 |
| 3:canvas-scale-075 | ambiguous | null | 397 |
| 3:canvas-scale-125 | found | 49.5504617589 | 528 |
| 3:canvas-jpeg-q75 | found | 39.5314707578 | 1057 |

## Negative Matrix

The browser evidence test's ambiguous two-pitch synthetic image produced no pitch hint. The deterministic-noise synthetic image also produced no pitch hint. These assertions passed in the failing browser test run.

## Compatibility

Before the browser gate, the moved-fixture grid suite passed with 20 tests. After the strict attempt extraction, the grid and pure evidence suites passed with 28 tests, and `npm run typecheck` exited zero. `detectGrid()` remains direct-only: it returns geometry only when `detectStrictGridAttempt()` returns `found`; no canonical fallback is connected.

## Performance

No performance measurement was recorded. The formal gate failed before the planned warmed-pass diagnostic evaluator was created, and Task 5 remains responsible for paired same-process comparison.

## Decision

coarse-pitch-gate-failed

The fixed `0.65`, `0.05`, `[30, 50]`, and complete-link rules were not tuned after this result. The task stops at design review with the strict refactor and failed-gate evidence committed.
