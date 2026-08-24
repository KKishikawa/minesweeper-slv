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

### Task 2 canonical resampling (in progress)

The pure canonical resampler passed its hand-authored byte, mapping, validation, allocation-cap, and three-run deterministic 30/50-pixel-pitch hash tests. Its current Node hashes are `baa44fda75b839c3ac0262d0ea8a9e909976a4876c73e6e6fd28d0e86c8f3862` (30px, 129 by 87) and `19888b0a715a288a8074eaba92bfb52426c041271313ee3c316be24d51848634` (50px, 126 by 84).

The installed TypeScript 7 package does not provide the legacy `typescript.transpileModule()` API. Under the approved compatibility ruling, the browser evaluator transforms the exact `src/recognition/grid-resample.ts` source with the installed Vite 8 `transformWithOxc` targeting ES2022, then imports that transformed source as a Blob module. This preserves exact-production-module execution without copied browser algorithm code or dependency/configuration changes.

The chunked direct Chromium evaluator then established exact byte equality using Chromium `151.0.7922.34`: the 2 by 2 fixture returned matching 3 by 3 dimensions, byte array, and SHA-256 `9c92f19e969ad7aea15e674e822ef22c8071c911c1b63d61e3746faf360e6823`; the 30px formal derivative matched at 2560 by 1440 and `28e5a9523bfc57dbd182fc77874feb431116062a4fd3bf2b7f1aaf2a6b17c0c7`; and the 50px derivative matched at 2560 by 1440 and `e5d8200bd9f7e1dee9646ab62689c90a00d026048237eb0109764947a0a1eede`.

The required Vitest Chromium test initially exposed Vite SSR's rewrite of literal Blob `import(url)` to `__vite_ssr_dynamic_import__(url)`. The test-only page loader now creates an indirect importer with `new Function("moduleUrl", "return import(moduleUrl)")`, preserving execution of the same exact Oxc-transformed Blob module without copied resampler code. Fresh controller verification of `npm test -- test/recognition/browser-grid-resample.test.ts` exited 0 with one file and all three tests passing in 49.52 seconds, so Chromium formal byte equality is **PASS**. Firefox and Playwright WebKit are separately collected informational compatibility evidence; Playwright WebKit is not Safari. Vite Oxc `8.2.1` was the exact-source transformer. No browser setting, threshold, fallback integration, classifier, or UI behavior was changed.

| Engine | Role | Case | Dimensions | Expected hash = actual hash | Equality |
| --- | --- | --- | --- | --- | --- |
| Chromium 151.0.7922.34 | formal | unit 2 by 2 at 1.5 | 3 by 3 | `9c92f19e969ad7aea15e674e822ef22c8071c911c1b63d61e3746faf360e6823` | true; exact returned bytes true |
| Chromium 151.0.7922.34 | formal | 30px derivative | 2560 by 1440 | `28e5a9523bfc57dbd182fc77874feb431116062a4fd3bf2b7f1aaf2a6b17c0c7` | true |
| Chromium 151.0.7922.34 | formal | 50px derivative | 2560 by 1440 | `e5d8200bd9f7e1dee9646ab62689c90a00d026048237eb0109764947a0a1eede` | true |
| Firefox 153.0 | informational | unit 2 by 2 at 1.5 | 3 by 3 | `9c92f19e969ad7aea15e674e822ef22c8071c911c1b63d61e3746faf360e6823` | true; exact returned bytes true |
| Firefox 153.0 | informational | 30px derivative | 2560 by 1440 | `28e5a9523bfc57dbd182fc77874feb431116062a4fd3bf2b7f1aaf2a6b17c0c7` | true |
| Firefox 153.0 | informational | 50px derivative | 2560 by 1440 | `e5d8200bd9f7e1dee9646ab62689c90a00d026048237eb0109764947a0a1eede` | true |
| Playwright WebKit 26.5 | informational proxy, not Safari | unit 2 by 2 at 1.5 | 3 by 3 | `9c92f19e969ad7aea15e674e822ef22c8071c911c1b63d61e3746faf360e6823` | true; exact returned bytes true |
| Playwright WebKit 26.5 | informational proxy, not Safari | 30px derivative | 2560 by 1440 | `28e5a9523bfc57dbd182fc77874feb431116062a4fd3bf2b7f1aaf2a6b17c0c7` | true |
| Playwright WebKit 26.5 | informational proxy, not Safari | 50px derivative | 2560 by 1440 | `e5d8200bd9f7e1dee9646ab62689c90a00d026048237eb0109764947a0a1eede` | true |

## Preliminary Strict-Only Timing

The Node-only evaluator decoded and retained all sixteen Chromium RGBA inputs before timing, then ran one warmup pass and three measured passes. It measured only `detectStrictGridAttempt()` plus `estimateCanonicalPitch()`. Across the 48 measured case samples, the median was `230.53743750000012 ms` and the worst sample was `339.6667500000003 ms`.

These values are preliminary diagnostic context only. They are not the later paired same-process performance denominator; that comparison remains the responsibility of the later performance task.

## Decision

coarse-pitch-gate-passed

The initial failed-gate history above is retained. The fixed `0.65`, `0.05`, `[30, 50]`, and complete-link rules were not tuned; the only amendment was the approved supported-boundary quantization described above.
