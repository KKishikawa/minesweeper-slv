# Canonical grid fallback: amended coarse-pitch gate record

## Initial Gate

The formal Chromium evidence gate failed on `3:canvas-scale-075`.

The strict attempt was `ambiguous` with 397 compatible refined pairs. The fixed complete-link rule selected the `29–30` family: vertical pitch 30 had normalized score 1.0000000000, horizontal pitch 29 had normalized score 0.8661677576, and the family score was 0.8661677576. Its score-weighted pitch was 29.536, which is below the inclusive lower bound of 30, so `estimateCanonicalPitch()` returned `null`.

Relevant alternatives were vertical 32 / horizontal 32 (family score 0.6623065724) and vertical 33 / horizontal 33 (family score 0.6635431172). The selected family exceeded the strongest alternate by 23.39%, so the failure was the fixed pitch-range decision rather than the five-percent score-separation decision.

## Amended Gate

The approved supported-boundary correction changed only the selected compatible `29/30` pair at the lower canonical boundary: its weighted estimate remains 29.536, but because one selected axis lands exactly on 30 and the pair remains within the existing five-percent compatibility rule, `estimateCanonicalPitch()` now quantizes that result to 30. The family construction, score threshold, score separation, compatibility ratio, and `[30, 50]` canonical range were not changed.

The complete Chromium matrix now has 11 direct `found` cases and five direct failures with non-null pitch hints. In particular, `3:canvas-scale-075` remains direct `ambiguous` with 397 refined pairs, while its coarse pitch result changes exactly from `null` to `30` (`29/30 -> 30`). No second estimator amendment was made.

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
| 3:canvas-scale-075 | ambiguous | 30 | 397 |
| 3:canvas-scale-125 | found | 49.5504617589 | 528 |
| 3:canvas-jpeg-q75 | found | 39.5314707578 | 1057 |

## Negative Matrix

The browser evidence test's ambiguous two-pitch synthetic image produced no pitch hint. The deterministic-noise synthetic image also produced no pitch hint. These assertions passed in the failing browser test run.

## Compatibility

Before the browser gate, the moved-fixture grid suite passed with 20 tests. After the strict attempt extraction, the grid and pure evidence suites passed with 28 tests, and `npm run typecheck` exited zero. `detectGrid()` remains direct-only: it returns geometry only when `detectStrictGridAttempt()` returns `found`; no canonical fallback is connected.

## Preliminary Strict-Only Timing

The Node-only evaluator decoded and retained all sixteen Chromium RGBA inputs before timing, then ran one warmup pass and three measured passes. It measured only `detectStrictGridAttempt()` plus `estimateCanonicalPitch()`. Across the 48 measured case samples, the median was `230.53743750000012 ms` and the worst sample was `339.6667500000003 ms`.

These values are preliminary diagnostic context only. They are not the later paired same-process performance denominator; that comparison remains the responsibility of the later performance task.

## Decision

coarse-pitch-gate-passed

The initial failed-gate history above is retained. The fixed `0.65`, `0.05`, `[30, 50]`, and complete-link rules were not tuned; the only amendment was the approved supported-boundary quantization described above.
