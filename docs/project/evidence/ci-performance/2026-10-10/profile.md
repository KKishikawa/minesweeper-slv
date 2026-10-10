# 認識評価 heavy 6 のローカル profile（2026-10-10）

## 判断

今回は再計算削減を見送る。call-local な不変入力は既に保持されており、残りの大きな反復は独立した fitting/calibration、public/diagnostic の一致検証、strict/complete の UX 測定、別プロセスの CLI 契約である。入力だけの再取得削減を正当化できる未保持箇所は見つからなかった。評価実装、テスト、閾値、fixtures、fold 数、matrix、反復数、assertion、fail-closed 条件は変更しない。

## 固定条件と方法

- A: `1a01eac18f389e7933be9937ad7fa4aa8be476b7`。
- B: `eb7a326c54089a39b0cfbb2d6dc217cab64c69f6`（Task 3）。Task 4 は文書のみなので認識・評価について C も同一。
- `git archive` で `/tmp/ci-recognition-profile-20261010/baseline` に独立した snapshot を展開し、tracked ファイルを read-only にした。`.git` はない。評価コードを現行版へ置換していない。
- `/tmp/ci-recognition-profile-20261010/instrumented` は同じ A archive の計測専用 copy。別の B archive にも同じ [timing-only patch](profile-instrumentation.patch) を適用した。A/B の `src/recognition`、`scripts/recognition`、正式 runner、`test/recognition`、lockfile の tracked diff は空。計測対象ファイルの patch 後 bytes も一致した。CI config と repository-foundation test の差はプロファイル対象外。
- 実行は Node `22.12.0`、macOS arm64（Darwin `27.0.0`、Apple M3 Pro）、Chromium `151.0.7922.34`。既存の locked `node_modules` を symlink して使い、依存追加・更新なし。lockfile、patch、raw output の SHA-256 は [集計 JSON](profile-summary.json) に保存した。
- Vitest forks に `--execArgv=--cpu-prof` と `--execArgv=--cpu-prof-dir=...` を渡した。生成 CLI の tsx wrapper Node へも計測 copy 内だけで同じ CPU flags を渡した（実評価childへの非継承は下記参照）。6 ファイルは 1 本ずつ直列。`fileParallelism: false`、入力、認識呼出し、閾値候補、反復数は同じ。
- 各区間を `performance.now()` と `try/finally` で記録し、exit 時にまとめて保存。browser derivation と browser resample はブラウザ内 `performance.now()` も返して記録した。`grid-resample.ts` 自体はブラウザへ渡す独立 module なので変更せず、Node 呼出し側だけを包んだ。
- 通常比較の基準は Task 3 が記録した `test/artifacts/ci/baseline-local.json`（44 ファイル、374 テスト全成功）。CPU flags/timing hooks なし。profile 時間は CI 目標や A→C 改善判定に使わない。controller 指示により追加 plain 実行は進行中のファイル完了までで止め、残りの重複検証を省いた。

patch SHA-256: `3a01054a6328e6efb82692271661de96f007758cb3e88f70668c898c8e3124ba`。再現する場合は A/B を上記 SHA の `git archive` から作り、計測 copy のルートで `patch -p1 < profile-instrumentation.patch` を適用する。例えば次の2固定refをそれぞれ展開する（`/absolute/profile-instrumentation.patch` は本 artifact の絶対パス）。

```sh
mkdir -p /tmp/profile-a /tmp/profile-b
git archive 1a01eac18f389e7933be9937ad7fa4aa8be476b7 -o /tmp/profile-a.tar
git archive eb7a326c54089a39b0cfbb2d6dc217cab64c69f6 -o /tmp/profile-b.tar
tar -xf /tmp/profile-a.tar -C /tmp/profile-a
tar -xf /tmp/profile-b.tar -C /tmp/profile-b
(cd /tmp/profile-a && patch -p1 < /absolute/profile-instrumentation.patch)
(cd /tmp/profile-b && patch -p1 < /absolute/profile-instrumentation.patch)
```

patch は blank context 行の trailing-whitespace 警告を避けるため unified context 0 で保存した。上記 `patch -p1` は A/B 両 archive で実際に適用・bytes 一致を確認済み。`git apply` を使う場合は `git apply --unidiff-zero /absolute/profile-instrumentation.patch` とする。依存は各 archive の lockfile と同じ既存 installation を symlink または copy する。ファイルごとに次を実行する。生成 CLI の CPU directory と timing prefix は絶対パスにする。

```sh
PROFILE_TIMING_PREFIX=/absolute/output/timing PROFILE_CPU_DIR=/absolute/output \
  node node_modules/vitest/vitest.mjs run test/recognition/formal-runner.test.ts \
  --pool=forks --fileParallelism=false --reporter=default --reporter=json \
  --outputFile.json=/absolute/output/vitest.json \
  --execArgv=--cpu-prof --execArgv=--cpu-prof-dir=/absolute/output
```

raw `.cpuprofile`、timing JSON、Vitest JSON、stdout/stderr/run metadata はローカルの `test/artifacts/ci/profile-2026-10-10/instrumented/<file>/` に保持している（Git ignore）。集計 JSON は各 raw ファイルの SHA-256、CPU self samples、全 scope の inclusive/exclusive 時間と回数を保持する。

## 時間の読み方

Vitest file 時間は `endTime - startTime`、wall はプロセス起動・変換・終了も含む。計測区間の inclusive は子の時間を含む。exclusive は同 process 内で完全に包含される子 interval の **union** を引き、二重加算しない。異なる scope の inclusive 値を合計して全体時間とはしない。ブラウザ内数値は別の時計・別 process の metric なので exclusive 計算には混ぜない。

`browser.rpc` は Node から `page.evaluate` が完了するまでの実時間で、ブラウザ処理、待機、IPC、serialization/転送を含む。純粋な転送時間ではない。chunk hash 区間は出力 bytes の全 chunk 読出し＋hash を含む。CPU self sample の idle から転送時間を推定せず、この wall 計測で示す。browser launch/close は derivation/resample scope の exclusive に含まれる。非同期 `Promise.all` の同時 sibling scope は時間包含だけでは因果関係を区別できないため exclusive は interval coverage の補助値であり、call graph の厳密な self time ではない。ここでは module source の微小区間を合算の根拠にせず、明示した scope の実時間を使う。fallback の `operations.resample` は間接呼出しなので独立 wall hook はなく、formal/folds/grid fallback では grid inclusive に含まれる。そこでの resample 値は CPU sample の別集計のみを示し、包含 remainder を resample wall と断定しない。controller 判断により、この追加細分化では見送り判断が変わらないため重い再実行を避けた。

計測あり/なしの差には CPU profiler、hooks、source transform、runtime variability が混在する。同条件 repeated A/B ではないため、その差を純粋な instrumentation overhead と断定しない。後続 Task 5 の A/B/C 各 3 回以上の本番比較はこの patch と CPU flags なしで行う。

## 測定結果

| ファイル（`.test.ts`） | tests | 通常 file s | profile file s | profile wall s | profile差 % |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-runner | 1/1 | 83.716 | 87.823 | 88.675 | +4.91 |
| folds | 1/1 | 64.251 | 65.422 | 66.180 | +1.82 |
| browser-grid-resample | 3/3 | 52.762 | 56.409 | 57.047 | +6.91 |
| evaluate-grid-fallback | 16/16 | 46.793 | 49.459 | 50.114 | +5.70 |
| browser-grid-fallback | 1/1 | 40.720 | 42.950 | 43.599 | +5.48 |
| generated-bank | 2/2 | 37.347 | 38.109 | 38.842 | +2.04 |

差は **計測あり vs 既存通常 baseline＋実行間変動**。最適化による改善率ではない。24/24 テスト成功、各 Vitest process exit 0。formal の stderr は既存の progress marker のみ、他の出力にも新しい warning/error はない。

主要 scope の実時間（秒、I=inclusive、E=exclusive）。`—` はこのファイルで実行しない。下表の I 同士は合計しない。

| ファイル | candidate / folds I | samples I / fitting I | calibration recognition I / threshold pairs I | grid I | recognition grid外 E | input生成 I / RPC I | evidence write I |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| formal-runner | 21.536 / 66.087 | 3.219 / 8.431 | 55.047 / 0.015 | 35.119 | 36.165 | 7.140 / 5.878 | 0.096 |
| folds | — / 65.418 | 1.570 / 6.352 | 40.438 / — | 26.517 | 28.648 | 3.555 / 2.927 | — |
| browser-grid-resample | — / — | — / — | — / — | — | — | 0.945 / 55.579 | — |
| evaluate-grid-fallback | — / — | — / — | — / — | 45.774 | — | 3.579 / 2.938 | — |
| browser-grid-fallback | — / — | — / — | — / — | 38.717 | — | 3.552 / 2.906 | — |
| generated-bank | 37.651 / — | 3.029 / 2.759 | 24.462 / 0.029 | 14.788 | 12.106 | 7.164 / 5.877 | — |

- formal: samples 2 回（candidate/folds 各1）、geometry fitting 5 回（candidate1＋fold4）、認識80回（candidate16＋fold calibration48＋holdout16）。candidate と folds の独立性を維持。
- folds: samples1 回、derivation4 回（各fixture）、fitting4回、calibration48ケース＋holdout16ケース。sample/grid/recognition はそれぞれ包含する区間がある。
- evaluate-grid-fallback の grid 欄は strict/complete **別呼出し**の全 warmup/measured 時間の和。strict64回19.291秒＋complete64回26.483秒。入力取得は1回3.668秒、stable hash確認257回1.366秒（mutation拒否の小テスト1回も含む）。
- browser-grid-fallback の grid 欄は public48回＋diagnostic48回、計96回38.717秒。public の nested diagnostic を別途加算しない。保持入力の3反復は削減しない。
- generated-bank の candidate/samples/fitting/calibration wall は CLI child と Vitest 直接関数の **2つの独立評価**の和。CLI child にも timing を採取した。CPU flags は tsx wrapper へ届いたが、tsx の再spawn child（PID69476）には継承されなかったため、その child CPU は未取得。CPU表の評価関数は Vitest 直接 candidate 側のみで、wrapper idle を実評価CPUとみなさない。controller判断により補助再実行なし。

resample と browser 転送の区間:

| browser-grid-resample scope | 回数 | wall s |
| --- | ---: | ---: |
| formal input生成 | 1 | 0.946 |
| Node resample | 3 | 0.202 |
| Browser内 resample（ブラウザ時計） | 3 | 0.138 |
| browserResample（launch/close・RPC・hash含む） | 3 | 55.247 |
| 全出力 chunk読出し＋hash（小テスト2回も含む） | 5 | 54.005 |
| page.evaluate RPC（入力生成/cleanupも含む） | 458 | 55.579 |

Browser内 derivative生成は formal1.110秒/8回、folds0.556秒/4回、browser-resample0.146秒/1回、evaluate-fallback0.558秒/4回、browser-fallback0.555秒/4回、generated1.107秒/8回。RPCとの差はbrowser lifecycle、serialization、転送なども含み、純転送値には分解しない。

CPU self の主な値（秒、sampled attribution）：formal `assertFiniteVector`9.485 / `meanSquaredDistance`8.334 / `buildEdgeProfiles`5.232、folds `assertFiniteVector`7.007 / `meanSquaredDistance`6.847、evaluate-fallback `buildEdgeProfiles`7.064 / `intersectionSupportRatio`7.036、browser-fallback `buildEdgeProfiles`6.082 / `intersectionSupportRatio`5.782。browser-resample は Playwright core匿名関数41.939 / GC6.566秒で、Node resample0.193秒に対して transport/serialization が支配的。generated の直接 candidate は `validatePrototypeGeometry`2.392 / `meanSquaredDistance`1.858秒。

間接 resample のCPU inclusive sampleは formal2.446秒、folds1.964秒、evaluate-fallback1.957秒、browser-fallback2.933秒。generatedは直接candidate側のみ0.506秒。これらは wall時間でなく、別thread/native CPUを包括する値でもない。全process profileのsample合計にはidleや同時processも含むため、合計を全体CPU負荷/全体wallとみなさない。

## 保持する固有の検証と見送り理由

| 対象 | 入力保持と実評価 | 維持する検証 |
| --- | --- | --- |
| formal-runner | candidate と folds は独立評価。統合や評価結果 cache は対象外 | rejected decision、16 candidate cases、4 folds、atomic checkpoint/summary/report、browser version、RGBA hash、480 cell diagnostics、全証拠書込み完了 |
| folds | samples と fixture ごとの 4 derivatives は **呼出し内で 1 回**取得、4 folds に保持。bank は fold ごとに再 fitting | held-out truth が fitting/calibration へ入らない、training/calibration IDs、absent labels、prototype counts、4 ケースと全480セル、formal metrics、threshold null 時の fail-closed |
| browser-grid-resample | 3 inputs と module source は呼出し内で生成。Node と Chromium の resample は独立に実行 | unit/30/50 pixel 全 bytes hash、寸法一致、unit の返却 bytes 一致、chunk offset 順序、欠落 chunk 拒否 |
| evaluate-grid-fallback | 16 Chromium inputs を 1 回取得し保持。1 warmup＋3 alternating measured passes を変更しない | loaderCalls=1、same object identity、input mutation 拒否、全96 measured trace、strict/complete 三標本、stage/geometry/normalized hash/pair counts/20000 budget、UX exact boundaries・fail-closed |
| browser-grid-fallback | 16 inputs を事前保持し 3 回反復。public detectGrid と diagnostic call は同一結果の独立実検証 | 入力前後 hash、public/diagnostic geometry 一致、期待 stage と refined counts、source-revalidation rejection、normalized hash、bounds/pitch tolerance、budget、3回の決定性 |
| generated-bank | local tsx CLI と関数呼出しを独立実行。別呼出しを共有しない | CLI exit=1・stderr・stdout 空・出力なし、deterministic rejection、238 threshold pairs、16ケース順序、2 grid failure、version/hash/geometry/cell evidence、passing branch の encode/decode roundtrip |

samples の Node decode と browser derivation の read/decode は異なる image pipeline の検証であり、認識結果へ置換する余地はない。candidate の threshold-pair 集計と selection は同じ候補を再評価するが、入力生成/読込み再利用という今回の範囲外であり、支配的区間でもない。formal と standalone folds/generated-bank をまたいだ共有は独立実評価を省くので採用しない。grid の strict/complete/public/diagnostic を認識結果 cache で統合したり UX 反復を減らしたりしない。

後続の別設計候補として、全出力 byte/chunk 検証を保ったまま output serialization/transport の API を改善する余地はある。今回の承認範囲は入力再計算削減と CI job 分割なので transport API は変更しない。正式 runner/folds で目立つ bank validation/classification と grid refinement も production algorithm の範囲なので変更しない。

候補なしのため TDD regression の追加と production 変更は不要。既存 assertions をそのまま実行した profile 一巡を限定検証として保持し、完全回帰と CI A→C 性能評価は Task 5 で行う。
