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

## Supplemental canonical ambiguity revalidation gate

The supplemental Chromium gate retained the public `detectGrid()` 16-case geometry assertion and added a second diagnostic-only assertion through `detectGridWithDiagnostics()`. Production orchestration was not copied into the test. All sixteen cases remained within the shared 20,000-pair limit, and the focused negative matrix remained rejected (5 files, 77 tests passed).

The public result was 14/16, so the supplemental gate failed:

- `1:canvas-scale-075` returned `null`. Canonical strict exposed 3 candidates and original-space revalidation returned 3 survivors, so the exactly-one rule rejected the result. Pair counts were 2,155 direct plus 1,449 canonical (3,604 total).
- `2:canvas-scale-075` returned `null`. Canonical strict exposed 1 candidate and original-space revalidation returned 0 survivors. Pair counts were 2,207 direct plus 1,753 canonical (3,960 total).

The other three formal fallback cases succeeded:

| Case | Stage | Canonical candidates | Source survivors | Direct pairs | Canonical pairs | Total pairs |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `1:canvas-scale-125` | fallback | 1 | 1 | 1,296 | 1,632 | 2,928 |
| `2:canvas-scale-125` | fallback | 1 | 1 | 1,825 | 1,950 | 3,775 |
| `3:canvas-scale-075` | fallback | 1 | 1 | 397 | 1,012 | 1,409 |

No threshold, filter, ordering, refinement radius, or work budget was changed after this result. The failed gate stops the fallback spike before commit and returns the two formal failures to design review.

## Supplemental Decision

canonical-ambiguity-revalidation-failed

## Partial Adoption

The failed 16/16 ambiguity-revalidation decision above remains unchanged. Under the separately approved partial-adoption contract, the same production implementation passed the exact fail-closed functional matrix:

- Direct success (11): `0:source`, `0:canvas-scale-075`, `0:canvas-scale-125`, `0:canvas-jpeg-q75`, `1:source`, `1:canvas-jpeg-q75`, `2:source`, `2:canvas-jpeg-q75`, `3:source`, `3:canvas-scale-125`, `3:canvas-jpeg-q75`.
- Source-revalidated fallback success (3): `1:canvas-scale-125`, `2:canvas-scale-125`, `3:canvas-scale-075`.
- Fail-closed source revalidation (2): `1:canvas-scale-075` remained public `null` with 3 canonical candidates and 3 survivors; `2:canvas-scale-075` remained public `null` with 1 canonical candidate and 0 survivors.

All fourteen successes passed the existing bounds and pitch tolerances. An unexpected success or failure is rejected by the formal test rather than folded into the expectation. All sixteen cases remained within the shared 20,000-pair budget, and the focused unit/negative matrix passed 77/77 without threshold, filter, ordering, radius, pitch-range, budget, or runtime-branch changes.

This is the functional gate only. Determinism and paired same-process performance remain required before the final partial-adoption decision.

canonical-grid-fallback-partial-adoption-functional-gate-passed

## Partial-Adoption Determinism and Performance Gate

The formal Chromium evaluator acquired the sixteen RGBA inputs once, retained those exact buffers, warmed strict-only and complete direct-first detection, and then measured three case-interleaved runs in the fixed case order. The order was `strict-first`, `complete-first`, `strict-first`; within every run, the two paths for each case were adjacent. Input hashes were checked before and after every measurement. Chromium remained the only formal engine.

The browser regression separately reused its sixteen retained Chromium buffers for three runs. Every run produced the exact 11 direct / 3 fallback / 2 source-revalidation-rejected matrix. Input hashes, normalized hashes (including both public-null rejections), public and diagnostic geometry or null, stages, candidate/survivor counts, and direct/canonical/total pair counts were identical across all three runs.

The following are the literal compliant CLI rows. Hashes shown once were identical in all three runs. Geometry is `x,y,width,height` or `null`; timings are the three measured milliseconds in run order.

| Case | Input SHA-256 | Normalized SHA-256 | Geometry | Stage | Candidates / survivors | Pairs direct / canonical / total | Strict ms | Complete ms |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| `0:source` | `7bc3f140d111721f0234ec352c4561fa5b4aeb4671c4a52e6bb004ef69e57dde` | `null` | `645,381,1201,641` | direct | 0 / 0 | 2240 / 0 / 2240 | `269.17475000000013, 262.8567089999997, 262.1431250000023` | `263.4291659999999, 263.2875000000022, 263.5639169999995` |
| `0:canvas-scale-075` | `233ac472a180ad68be6adc290e8c464e5a797c403d218ee433a84e5d092dcd5c` | `null` | `484,286,900,481` | direct | 0 / 0 | 1392 / 0 / 1392 | `147.89120899999944, 146.62220799999704, 145.4874579999996` | `168.78304099999878, 145.3625409999986, 147.29254199999923` |
| `0:canvas-scale-125` | `29805069601c2097e84cd7e1a6b737e59b9b5e7a25981bfe768d47f10e7e5c0f` | `null` | `807,477,1500,801` | direct | 0 / 0 | 1640 / 0 / 1640 | `248.68020799999977, 246.69291599999997, 248.27074999999968` | `255.3145000000004, 247.5195840000015, 263.70479200000045` |
| `0:canvas-jpeg-q75` | `47415334fd11748ce8c572f3cb096e3a8da47856fba320128c82c2bac5889076` | `null` | `645,381,1200,641` | direct | 0 / 0 | 2325 / 0 / 2325 | `278.3374159999985, 272.7175000000025, 280.1658749999988` | `316.09879100000035, 273.7364170000001, 275.0404580000031` |
| `1:source` | `5518ba6bca87960661905b391be9fbf6f5ba07fd0149ea39035afb1c924add57` | `null` | `645,381,1201,641` | direct | 0 / 0 | 2718 / 0 / 2718 | `307.88158399999884, 310.83979199999885, 310.8304579999967` | `308.58608300000014, 309.58029199999874, 309.703333999998` |
| `1:canvas-scale-075` | `81a88ce7e964706d96c6e6ceb26c58eb8266db7e53372c0cf70469a9c5f09b05` | `a55c74e43ea4a793b19f21fb7df4c94861c26735aa7219d5175907806b8c5d49` | `null` | source-revalidation-rejected | 3 / 3 | 2155 / 1449 / 3604 | `211.29458299999897, 214.4312080000018, 212.2980830000015` | `498.76604100000077, 498.94695800000045, 499.69679200000246` |
| `1:canvas-scale-125` | `6c34c556c0f191936191daffab5ad3f499f38db2f6ad56f308b9129fa9469c3e` | `8c95f3088b174f618a24319622a22e9a0cf53383a6da59262f5a2896be8f50b9` | `809,479,1500,795` | fallback | 1 / 1 | 1296 / 1632 / 2928 | `217.00595899999826, 213.68254199999865, 212.88962500000343` | `514.2625829999997, 510.5557919999992, 509.5872079999972` |
| `1:canvas-jpeg-q75` | `4e04c887edd8a86cc5c760d71a568999b1579e62cfa257725075696847c75c5c` | `null` | `645,381,1201,641` | direct | 0 / 0 | 2791 / 0 / 2791 | `319.88866699999926, 318.8093749999971, 317.95412500000384` | `318.94783299999835, 319.356667, 318.6632080000054` |
| `2:source` | `cf4aa26bb95ec4772612846f3df7b1bd3654744d342d7b18e81c10a1a147ca45` | `null` | `645,381,1201,641` | direct | 0 / 0 | 3251 / 0 / 3251 | `363.19924999999785, 361.1465840000019, 362.8274999999994` | `363.7517079999998, 360.6536669999987, 363.0034999999989` |
| `2:canvas-scale-075` | `51cf36f83ae3bf72c4eccac622a0fbff04037b2b32b611a3383f36d2cd2bbe44` | `f99697afd82c0165051dce3640312f9021386df50ac2fe1e43e3f8438601d3e6` | `null` | source-revalidation-rejected | 1 / 0 | 2207 / 1753 / 3960 | `215.99787500000093, 218.79283299999952, 215.8732500000042` | `528.9767079999983, 526.0811670000003, 530.6452910000007` |
| `2:canvas-scale-125` | `06426304a294c6926c4c7aab0a31bc43a2d99a19c648f775e7decb59b007a0f1` | `75160b45e84f60d62946c3fdacdf7358121fbf32ed80cf4897ff1c637ccd923c` | `809,479,1500,795` | fallback | 1 / 1 | 1825 / 1950 / 3775 | `270.37829200000124, 284.5472499999996, 270.3210420000032` | `596.3248329999988, 603.8163329999988, 599.9552079999994` |
| `2:canvas-jpeg-q75` | `fdef4d9f0be8a08841c3da1abb324ac1c0e7a7235b0e30bf7dbe91f8181f4c45` | `null` | `645,381,1201,641` | direct | 0 / 0 | 3212 / 0 / 3212 | `362.390707999999, 362.6589160000003, 360.24524999999994` | `361.7362090000024, 359.3115409999991, 359.13554199999635` |
| `3:source` | `88720554e8cc759ceecc316a7cc8b9a829f8a3c49a625d2387b2aa6e14a73cde` | `null` | `671,563,1201,640` | direct | 0 / 0 | 750 / 0 / 750 | `124.2253750000018, 125.38574999999764, 123.69625000000087` | `123.56674999999814, 123.0591659999991, 122.5682500000039` |
| `3:canvas-scale-075` | `a4b291a4c40661bcd4ab3690e3263c9e29963a8969abaac7a9b2a98d3480f94d` | `1fb50d2c02d2a59c2d26999673acea6e883781afc08f6efd791d41546d3588e8` | `505,422,900,480` | fallback | 1 / 1 | 397 / 1012 / 1409 | `61.079791000000114, 62.36491699999897, 60.76858300000458` | `320.40179200000057, 315.5411669999994, 316.80391700000473` |
| `3:canvas-scale-125` | `d8cb5017fe192e44a0f7842c52fd95036682e7059b07e5da2a2b5d01c0d4e0eb` | `null` | `839,703,1501,800` | direct | 0 / 0 | 528 / 0 / 528 | `131.1104579999992, 137.10791700000118, 130.78729099999327` | `132.06341600000087, 132.93258399999831, 131.7835419999974` |
| `3:canvas-jpeg-q75` | `c02a67a117196092f4176bc094b8b40c08dfb2d02edecb9149b466b1838e260b` | `null` | `671,563,1201,640` | direct | 0 / 0 | 1057 / 0 / 1057 | `152.60562500000015, 152.87758299999768, 154.82200000000012` | `152.03908299999966, 153.24949999999808, 154.18545900000026` |

Aggregate results:

- strict-only median: `232.74287449999974 ms`;
- complete-path median: `315.8199789999999 ms`;
- median ratio: `1.3569480040086048` (required `<= 1.25`, **FAIL**);
- strict-only worst: `363.19924999999785 ms`;
- complete-path worst: `603.8163329999988 ms`;
- worst ratio: `1.6624933366464894` (required `<= 2.0`, PASS);
- maximum total pair count: `3960` (required `<= 20000`, PASS).

The exact negative outcomes remained `1:canvas-scale-075` at public `null`, normalized hash `a55c74e43ea4a793b19f21fb7df4c94861c26735aa7219d5175907806b8c5d49`, candidates/survivors `3/3`, and pairs `2155/1449/3604`; and `2:canvas-scale-075` at public `null`, normalized hash `f99697afd82c0165051dce3640312f9021386df50ac2fe1e43e3f8438601d3e6`, candidates/survivors `1/0`, and pairs `2207/1753/3960`.

No caching, threshold relaxation, production behavior change, or retry-based acceptance was introduced. Because the compliant formal median ratio exceeded the fixed gate, partial adoption stops before recognition measurement.

canonical-grid-fallback-partial-adoption-failed
