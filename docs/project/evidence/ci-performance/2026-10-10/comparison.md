# CI performance comparison

比較状態: 事前指定した成功9 runは比較可能。旧失敗A1を含む全10 dispatch履歴は[除外run履歴](excluded-run-history.md)に保持。

条件別の値は中央値 (最小–最大)。canonical queueはAPI created_at→最初の選択検証job開始。workflow開始遅延はcreated_at→run_started_at、準備はrun_started_at→最初の検証開始で、queueの細分値。wallはA/B serial開始→終了、C最初のgroup開始→quality終了。queue込み総時間はcreated_at→その検証終了。runner分数はvalidateとqualityを含む、実行した全job時間の合計。

| 条件 | run数 | canonical queue秒 | workflow開始遅延秒 | 準備秒 | 検証wall秒 | queue込み総秒 | 総runner分数 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| A | 3 | 11.00 (10.00–11.00) | 0.00 (0.00–0.00) | 11.00 (10.00–11.00) | 662.00 (627.00–794.00) | 673.00 (637.00–805.00) | 11.10 (10.50–13.28) |
| B | 3 | 10.00 (9.00–11.00) | 0.00 (0.00–0.00) | 10.00 (9.00–11.00) | 793.00 (770.00–800.00) | 802.00 (780.00–811.00) | 13.25 (12.88–13.38) |
| C | 3 | 9.00 (8.00–9.00) | 0.00 (0.00–0.00) | 9.00 (8.00–9.00) | 257.00 (253.00–265.00) | 265.00 (262.00–274.00) | 15.95 (15.28–16.15) |

AtoB: -19.79%
BtoC: 67.59%
AtoC: 61.18%

歴史的記録: 12分35秒 (755秒)。別環境・過去runの参考値でありAの代用にはしない。目安8分48秒 (528秒) だけで完了判定しない。A→Cの3回以上の同条件比較が必要。

A/B評価実装は同一（Task 4で安全な再計算削減なし）。B/Cは同じtarget SHA。許容する差分はこのIssueの4既知CI unit testファイルの追加とfoundation構成assertionの追加/置換のみ。同一target SHA内の差は許容しない。全差分へ記録し、既存評価assertionの固定は別途diffで確認する。

## 比較を妨げる条件

- なし

## 重い6ファイル (elapsedとassertion合計を分離)

Vitest testResults[].endTime-startTimeは最早assertion開始→最終assertion終了のミリ秒（module import/transformや前後setup全体を含まない）。assertionResults[].duration合計はassertion時間でありelapsedの代用にしない。絶対checkoutパスはtest/から正規化。numTotalTestSuitesはファイル数として使用しない。

### A

| 固定ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) | 計測run数 | 欠測理由 |
| --- | --- | --- | --- | --- |
| test/recognition/formal-runner.test.ts | 132744.97 (116930.75–155280.41) | 132744.97 (116930.75–155280.41) | 3/3 | none |
| test/recognition/folds.test.ts | 96828.47 (87737.94–118105.63) | 96828.47 (87737.94–118105.63) | 3/3 | none |
| test/recognition/generated-bank.test.ts | 55636.35 (53042.55–67830.95) | 55636.72 (53042.38–67830.90) | 3/3 | none |
| test/recognition/browser-grid-resample.test.ts | 97771.50 (89816.23–119806.62) | 97771.44 (89816.24–119807.48) | 3/3 | none |
| test/recognition/browser-grid-fallback.test.ts | 73810.62 (66957.78–87321.57) | 73810.62 (66957.78–87321.57) | 3/3 | none |
| test/recognition/evaluate-grid-fallback.test.ts | 83380.62 (77123.83–102848.43) | 83379.68 (77123.03–102847.32) | 3/3 | none |

### B

| 固定ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) | 計測run数 | 欠測理由 |
| --- | --- | --- | --- | --- |
| test/recognition/formal-runner.test.ts | 155997.18 (149067.84–156492.53) | 155997.18 (149067.85–156492.53) | 3/3 | none |
| test/recognition/folds.test.ts | 116584.17 (113309.41–119560.40) | 116584.17 (113309.41–119560.40) | 3/3 | none |
| test/recognition/generated-bank.test.ts | 66504.41 (64584.57–66671.24) | 66504.50 (64584.39–66671.49) | 3/3 | none |
| test/recognition/browser-grid-resample.test.ts | 117222.99 (114474.20–118723.52) | 117222.52 (114474.29–118723.88) | 3/3 | none |
| test/recognition/browser-grid-fallback.test.ts | 84944.92 (82786.16–86652.95) | 84944.92 (82786.16–86652.95) | 3/3 | none |
| test/recognition/evaluate-grid-fallback.test.ts | 98127.43 (95779.71–102100.47) | 98126.18 (95779.57–102099.21) | 3/3 | none |

### C

| 固定ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) | 計測run数 | 欠測理由 |
| --- | --- | --- | --- | --- |
| test/recognition/formal-runner.test.ts | 154690.37 (152404.94–157990.40) | 154690.37 (152404.94–157990.40) | 3/3 | none |
| test/recognition/folds.test.ts | 115551.59 (94716.82–115714.48) | 115551.59 (94716.82–115714.48) | 3/3 | none |
| test/recognition/generated-bank.test.ts | 65795.83 (54948.59–66458.76) | 65796.22 (54948.50–66459.29) | 3/3 | none |
| test/recognition/browser-grid-resample.test.ts | 115797.47 (113885.82–118979.01) | 115797.78 (113885.96–118979.39) | 3/3 | none |
| test/recognition/browser-grid-fallback.test.ts | 86541.15 (83392.48–89982.80) | 86541.15 (83392.48–89982.80) | 3/3 | none |
| test/recognition/evaluate-grid-fallback.test.ts | 98230.48 (96558.24–98922.48) | 98229.64 (96557.85–98922.29) | 3/3 | none |

## 歴史的755秒に対する参考比較

対象は条件別の検証wall中央値。差秒=755−wall、率=(755−wall)/755×100。別環境・過去runの参考比較で、A→C判定から独立する。未測定または比較不可ならnull/未測定とし、成功runだけを選別しない。

| 条件 | 実測wall中央値 秒 | 歴史値との差秒 | 歴史値に対する短縮率 |
| --- | --- | --- | --- |
| A | 662.00 | 93.00 | 12.32% |
| B | 793.00 | -38.00 | -5.03% |
| C | 257.00 | 498.00 | 65.96% |

## 各jobの依存待ち時間（推定）

Actions APIはdependency-ready/enqueued時刻を提供しないため、依存ready推定→started_atを保存する。validate ready=workflow created_at（初期workflow schedulingを含む）、serial/regression ready=validate completed_at、quality ready=全5regressionの最遅completed_at。scheduleとrunner待ちを含むelapsed推定であり、純粋なrunner queue実測ではない。欠落/矛盾する依存時刻はnull/未測定、意図的skipは未実行。

| run:attempt | job | ready推定 UTC | start UTC | 待ち秒 | ready根拠 |
| --- | --- | --- | --- | --- | --- |
| 38057729631:1 | validate | 2026-10-10T13:57:41Z | 2026-10-10T13:57:46Z | 5.00 | workflow created_at |
| 38057729631:1 | Serial / A | 2026-10-10T13:57:49Z | 2026-10-10T13:57:52Z | 3.00 | validate completed_at |
| 38057729631:1 | Grouped / ${{ matrix.group }} | 未測定 | 2026-10-10T13:57:50Z | 未測定 | not executed |
| 38057729631:1 | Benchmark / quality | 未測定 | 2026-10-10T13:57:50Z | 未測定 | not executed |
| 38058646463:1 | validate | 2026-10-10T14:11:45Z | 2026-10-10T14:11:49Z | 4.00 | workflow created_at |
| 38058646463:1 | Serial / B | 2026-10-10T14:11:51Z | 2026-10-10T14:11:54Z | 3.00 | validate completed_at |
| 38058646463:1 | Grouped / ${{ matrix.group }} | 未測定 | 2026-10-10T14:11:52Z | 未測定 | not executed |
| 38058646463:1 | Benchmark / quality | 未測定 | 2026-10-10T14:11:52Z | 未測定 | not executed |
| 38059568524:1 | validate | 2026-10-10T14:25:51Z | 2026-10-10T14:25:54Z | 3.00 | workflow created_at |
| 38059568524:1 | Grouped / recognition | 2026-10-10T14:25:57Z | 2026-10-10T14:26:00Z | 3.00 | validate completed_at |
| 38059568524:1 | Grouped / holdout | 2026-10-10T14:25:57Z | 2026-10-10T14:25:59Z | 2.00 | validate completed_at |
| 38059568524:1 | Grouped / formal | 2026-10-10T14:25:57Z | 2026-10-10T14:26:00Z | 3.00 | validate completed_at |
| 38059568524:1 | Grouped / product | 2026-10-10T14:25:57Z | 2026-10-10T14:26:00Z | 3.00 | validate completed_at |
| 38059568524:1 | Grouped / grid-compatibility | 2026-10-10T14:25:57Z | 2026-10-10T14:26:00Z | 3.00 | validate completed_at |
| 38059568524:1 | Serial / ${{ needs.validate.outputs.condition }} | 未測定 | 2026-10-10T14:25:57Z | 未測定 | not executed |
| 38059568524:1 | Benchmark / quality | 2026-10-10T14:29:58Z | 2026-10-10T14:30:01Z | 3.00 | all regression completed_at |
| 38059903713:1 | validate | 2026-10-10T14:30:54Z | 2026-10-10T14:30:58Z | 4.00 | workflow created_at |
| 38059903713:1 | Serial / A | 2026-10-10T14:31:02Z | 2026-10-10T14:31:05Z | 3.00 | validate completed_at |
| 38059903713:1 | Grouped / ${{ matrix.group }} | 未測定 | 2026-10-10T14:31:03Z | 未測定 | not executed |
| 38059903713:1 | Benchmark / quality | 未測定 | 2026-10-10T14:31:03Z | 未測定 | not executed |
| 38060695233:1 | validate | 2026-10-10T14:42:41Z | 2026-10-10T14:42:44Z | 3.00 | workflow created_at |
| 38060695233:1 | Serial / B | 2026-10-10T14:42:47Z | 2026-10-10T14:42:51Z | 4.00 | validate completed_at |
| 38060695233:1 | Grouped / ${{ matrix.group }} | 未測定 | 2026-10-10T14:42:48Z | 未測定 | not executed |
| 38060695233:1 | Benchmark / quality | 未測定 | 2026-10-10T14:42:48Z | 未測定 | not executed |
| 38061573301:1 | validate | 2026-10-10T14:56:00Z | 2026-10-10T14:56:04Z | 4.00 | workflow created_at |
| 38061573301:1 | Grouped / grid-compatibility | 2026-10-10T14:56:06Z | 2026-10-10T14:56:09Z | 3.00 | validate completed_at |
| 38061573301:1 | Grouped / holdout | 2026-10-10T14:56:06Z | 2026-10-10T14:56:09Z | 3.00 | validate completed_at |
| 38061573301:1 | Grouped / formal | 2026-10-10T14:56:06Z | 2026-10-10T14:56:09Z | 3.00 | validate completed_at |
| 38061573301:1 | Grouped / product | 2026-10-10T14:56:06Z | 2026-10-10T14:56:09Z | 3.00 | validate completed_at |
| 38061573301:1 | Grouped / recognition | 2026-10-10T14:56:06Z | 2026-10-10T14:56:09Z | 3.00 | validate completed_at |
| 38061573301:1 | Serial / ${{ needs.validate.outputs.condition }} | 未測定 | 2026-10-10T14:56:07Z | 未測定 | not executed |
| 38061573301:1 | Benchmark / quality | 2026-10-10T15:00:08Z | 2026-10-10T15:00:11Z | 3.00 | all regression completed_at |
| 38061910284:1 | validate | 2026-10-10T15:01:03Z | 2026-10-10T15:01:07Z | 4.00 | workflow created_at |
| 38061910284:1 | Serial / A | 2026-10-10T15:01:10Z | 2026-10-10T15:01:13Z | 3.00 | validate completed_at |
| 38061910284:1 | Benchmark / quality | 未測定 | 2026-10-10T15:01:11Z | 未測定 | not executed |
| 38061910284:1 | Grouped / ${{ matrix.group }} | 未測定 | 2026-10-10T15:01:11Z | 未測定 | not executed |
| 38062641843:1 | validate | 2026-10-10T15:12:04Z | 2026-10-10T15:12:09Z | 5.00 | workflow created_at |
| 38062641843:1 | Serial / B | 2026-10-10T15:12:12Z | 2026-10-10T15:12:15Z | 3.00 | validate completed_at |
| 38062641843:1 | Grouped / ${{ matrix.group }} | 未測定 | 2026-10-10T15:12:13Z | 未測定 | not executed |
| 38062641843:1 | Benchmark / quality | 未測定 | 2026-10-10T15:12:13Z | 未測定 | not executed |
| 38063595644:1 | validate | 2026-10-10T15:26:10Z | 2026-10-10T15:26:14Z | 4.00 | workflow created_at |
| 38063595644:1 | Grouped / product | 2026-10-10T15:26:16Z | 2026-10-10T15:26:19Z | 3.00 | validate completed_at |
| 38063595644:1 | Grouped / grid-compatibility | 2026-10-10T15:26:16Z | 2026-10-10T15:26:19Z | 3.00 | validate completed_at |
| 38063595644:1 | Grouped / recognition | 2026-10-10T15:26:16Z | 2026-10-10T15:26:19Z | 3.00 | validate completed_at |
| 38063595644:1 | Grouped / formal | 2026-10-10T15:26:16Z | 2026-10-10T15:26:19Z | 3.00 | validate completed_at |
| 38063595644:1 | Grouped / holdout | 2026-10-10T15:26:16Z | 2026-10-10T15:26:19Z | 3.00 | validate completed_at |
| 38063595644:1 | Serial / ${{ needs.validate.outputs.condition }} | 未測定 | 2026-10-10T15:26:17Z | 未測定 | not executed |
| 38063595644:1 | Benchmark / quality | 2026-10-10T15:30:26Z | 2026-10-10T15:30:29Z | 3.00 | all regression completed_at |

## 共通既存ファイルと構成検証の時間

全runに共通する既存ファイル 43件（foundationと4既知CI unit testを除外）。各file時間は上記とJSONへ保持。合計はassertion-spanの和であり並列wall timeではない。

| 条件 | 共通file elapsed ms 合計 中央値 (範囲) | 構成検証 elapsed ms 合計 中央値 (範囲) |
| --- | --- | --- |
| A | 602734.15 (568602.61–737189.55) | 8.75 (8.59–11.79) |
| B | 723946.26 (702685.94–735198.73) | 7406.48 (7357.45–7595.45) |
| C | 715975.75 (689723.26–723270.57) | 7010.46 (5536.55–7575.51) |

## run別の記録

JSON詳細には全job/step UTC時刻、結論、再実行attempt、欠落artifact、ファイル時間/全assertion集合、RSS値とscopeを保存。RSSはGNU timeのcommandとwaited-for descendantsの最大値であり、全processの同時RSS合計ではない。

- run 38057729631:1, A, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1a01eac18f389e7933be9937ad7fa4aa8be476b7; queue=11.00s; preparation=11.00s; wall=794.00s; queue-inclusive total=805.00s; workflow-start delay=0.00s; runner=13.28min
  - all: child=754579.459579ms, RSS=989092KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38058646463:1, B, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1858c4a3d6fb7ca65a5dc1111e2fad9178d36429; queue=9.00s; preparation=9.00s; wall=793.00s; queue-inclusive total=802.00s; workflow-start delay=0.00s; runner=13.25min
  - all: child=749249.77984ms, RSS=973764KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38059568524:1, C, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1858c4a3d6fb7ca65a5dc1111e2fad9178d36429; queue=8.00s; preparation=8.00s; wall=257.00s; queue-inclusive total=265.00s; workflow-start delay=0.00s; runner=15.95min
  - grid-compatibility: child=198964.958678ms, RSS=882576KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - formal: child=155903.914667ms, RSS=964656KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - recognition: child=171850.678342ms, RSS=883476KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - holdout: child=183277.557185ms, RSS=925072KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - product: child=33392.892079ms, RSS=250364KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38059903713:1, A, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1a01eac18f389e7933be9937ad7fa4aa8be476b7; queue=11.00s; preparation=11.00s; wall=662.00s; queue-inclusive total=673.00s; workflow-start delay=0.00s; runner=11.10min
  - all: child=616722.461864ms, RSS=978484KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38060695233:1, B, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1858c4a3d6fb7ca65a5dc1111e2fad9178d36429; queue=10.00s; preparation=10.00s; wall=770.00s; queue-inclusive total=780.00s; workflow-start delay=0.00s; runner=12.88min
  - all: child=727641.1157890001ms, RSS=982124KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38061573301:1, C, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1858c4a3d6fb7ca65a5dc1111e2fad9178d36429; queue=9.00s; preparation=9.00s; wall=253.00s; queue-inclusive total=262.00s; workflow-start delay=0.00s; runner=15.28min
  - recognition: child=171315.456695ms, RSS=881804KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - formal: child=159275.670431ms, RSS=974520KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - holdout: child=151105.85084899998ms, RSS=941680KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - grid-compatibility: child=204098.159062ms, RSS=878928KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - product: child=28077.038517999998ms, RSS=255564KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38061910284:1, A, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1a01eac18f389e7933be9937ad7fa4aa8be476b7; queue=10.00s; preparation=10.00s; wall=627.00s; queue-inclusive total=637.00s; workflow-start delay=0.00s; runner=10.50min
  - all: child=582687.396782ms, RSS=961284KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38062641843:1, B, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1858c4a3d6fb7ca65a5dc1111e2fad9178d36429; queue=11.00s; preparation=11.00s; wall=800.00s; queue-inclusive total=811.00s; workflow-start delay=0.00s; runner=13.38min
  - all: child=760861.904963ms, RSS=978444KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
- run 38063595644:1, C, success; control=fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1; target=1858c4a3d6fb7ca65a5dc1111e2fad9178d36429; queue=9.00s; preparation=9.00s; wall=265.00s; queue-inclusive total=274.00s; workflow-start delay=0.00s; runner=16.15min
  - holdout: child=183824.457665ms, RSS=941164KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - recognition: child=168702.017231ms, RSS=879680KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - grid-compatibility: child=210774.119169ms, RSS=878944KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - formal: child=153583.283925ms, RSS=954268KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none
  - product: child=34842.249158ms, RSS=250484KiB; scope=GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes; unavailable=none

## 検証集合差

run 38058646463:1 (approved configuration difference)
- added file (CI unit test): test/ci/benchmark-report.test.ts
- added file (CI unit test): test/ci/quality-result.test.ts
- added file (CI unit test): test/ci/run-tests.test.ts
- added file (CI unit test): test/ci/test-groups.test.ts
- added: test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- added: test/ci/benchmark-report.test.ts :: benchmark report always reports the six specified heavy files, including missing values, regardless of rank
- added: test/ci/benchmark-report.test.ts :: benchmark report blocks missing group artifacts in directly supplied runs
- added: test/ci/benchmark-report.test.ts :: benchmark report collects paginated API jobs and known archive entries via an injected transport
- added: test/ci/benchmark-report.test.ts :: benchmark report computes the historical 755-second reference separately from A-to-C
- added: test/ci/benchmark-report.test.ts :: benchmark report detects an absent file even if it had no assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report preserves missing/expired artifacts and API errors rather than creating a success
- added: test/ci/benchmark-report.test.ts :: benchmark report reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions
- added: test/ci/benchmark-report.test.ts :: benchmark report records expired artifacts and missing Vitest entries
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files
- added: test/ci/benchmark-report.test.ts :: benchmark report reports file additions separately without treating identical files as identical assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report reports queue-inclusive total and dependency-ready waiting estimates for every job
- added: test/ci/benchmark-report.test.ts :: benchmark report retains cancelled runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains environment runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains failure runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains insufficient runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains missing JSON runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed control runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed target runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains quality skipped runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains rerun runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains test set runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains timeout runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains unmeasured state and historical baseline without a fabricated reduction
- added: test/ci/benchmark-report.test.ts :: benchmark report separates queue, preparation, wall and all executed runner minutes
- added: test/ci/benchmark-report.test.ts :: benchmark report uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "[]"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "not json"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "null"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":null}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"cancelled\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"failure\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"skipped\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"},\"extra\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"unknown\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs undefined
- added: test/ci/quality-result.test.ts :: required CI job aggregation accepts only the exact expected successful jobs
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects missing, empty, or extra job results
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result ""
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "SUCCESS"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "cancelled"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "failure"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "pending"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "skipped"
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess keeps a successful child exit and its actual JSON test records
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess preserves a real failing child exit despite saving reports
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.exit(7)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.kill(process.pid, "SIGTERM")
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess rejects an unknown group before creating artifacts or launching Vitest
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess runs external all against the target checkout and records the separate control ref
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (event)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (throw)
- added: test/ci/test-groups.test.ts :: CI test partition assigns new regular tests to the default groups
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-fallback.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-resample.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/evaluate-grid-fallback.test.ts as recognition
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/folds.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/formal-runner.test.ts as formal
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/generated-bank.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition covers all real regular test files exactly once with no empty group
- added: test/ci/test-groups.test.ts :: CI test partition excludes spike evidence from every group
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group product
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group recognition
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-fallback.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-resample.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/folds.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/formal-runner.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/generated-bank.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects repeated paths
- added: test/repository-foundation.test.ts :: repository foundation aggregates all isolated regression groups into the required quality check
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (failure/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/cancelled)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/failure)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/skipped)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmarks fixed targets without publishing or restricting the control branch
- added: test/repository-foundation.test.ts :: repository foundation preserves full regression and explicit approval before publishing Pages
- added: test/repository-foundation.test.ts :: repository foundation rejects unsafe benchmark refs before any target checkout
- added: test/repository-foundation.test.ts :: repository foundation retains timing artifacts for every ordinary regression group even on failure
- removed: test/repository-foundation.test.ts :: repository foundation defines one honest ordinary CI quality check
run 38059568524:1 (approved configuration difference)
- added file (CI unit test): test/ci/benchmark-report.test.ts
- added file (CI unit test): test/ci/quality-result.test.ts
- added file (CI unit test): test/ci/run-tests.test.ts
- added file (CI unit test): test/ci/test-groups.test.ts
- added: test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- added: test/ci/benchmark-report.test.ts :: benchmark report always reports the six specified heavy files, including missing values, regardless of rank
- added: test/ci/benchmark-report.test.ts :: benchmark report blocks missing group artifacts in directly supplied runs
- added: test/ci/benchmark-report.test.ts :: benchmark report collects paginated API jobs and known archive entries via an injected transport
- added: test/ci/benchmark-report.test.ts :: benchmark report computes the historical 755-second reference separately from A-to-C
- added: test/ci/benchmark-report.test.ts :: benchmark report detects an absent file even if it had no assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report preserves missing/expired artifacts and API errors rather than creating a success
- added: test/ci/benchmark-report.test.ts :: benchmark report reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions
- added: test/ci/benchmark-report.test.ts :: benchmark report records expired artifacts and missing Vitest entries
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files
- added: test/ci/benchmark-report.test.ts :: benchmark report reports file additions separately without treating identical files as identical assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report reports queue-inclusive total and dependency-ready waiting estimates for every job
- added: test/ci/benchmark-report.test.ts :: benchmark report retains cancelled runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains environment runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains failure runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains insufficient runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains missing JSON runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed control runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed target runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains quality skipped runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains rerun runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains test set runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains timeout runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains unmeasured state and historical baseline without a fabricated reduction
- added: test/ci/benchmark-report.test.ts :: benchmark report separates queue, preparation, wall and all executed runner minutes
- added: test/ci/benchmark-report.test.ts :: benchmark report uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "[]"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "not json"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "null"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":null}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"cancelled\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"failure\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"skipped\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"},\"extra\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"unknown\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs undefined
- added: test/ci/quality-result.test.ts :: required CI job aggregation accepts only the exact expected successful jobs
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects missing, empty, or extra job results
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result ""
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "SUCCESS"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "cancelled"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "failure"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "pending"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "skipped"
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess keeps a successful child exit and its actual JSON test records
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess preserves a real failing child exit despite saving reports
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.exit(7)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.kill(process.pid, "SIGTERM")
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess rejects an unknown group before creating artifacts or launching Vitest
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess runs external all against the target checkout and records the separate control ref
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (event)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (throw)
- added: test/ci/test-groups.test.ts :: CI test partition assigns new regular tests to the default groups
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-fallback.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-resample.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/evaluate-grid-fallback.test.ts as recognition
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/folds.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/formal-runner.test.ts as formal
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/generated-bank.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition covers all real regular test files exactly once with no empty group
- added: test/ci/test-groups.test.ts :: CI test partition excludes spike evidence from every group
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group product
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group recognition
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-fallback.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-resample.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/folds.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/formal-runner.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/generated-bank.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects repeated paths
- added: test/repository-foundation.test.ts :: repository foundation aggregates all isolated regression groups into the required quality check
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (failure/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/cancelled)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/failure)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/skipped)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmarks fixed targets without publishing or restricting the control branch
- added: test/repository-foundation.test.ts :: repository foundation preserves full regression and explicit approval before publishing Pages
- added: test/repository-foundation.test.ts :: repository foundation rejects unsafe benchmark refs before any target checkout
- added: test/repository-foundation.test.ts :: repository foundation retains timing artifacts for every ordinary regression group even on failure
- removed: test/repository-foundation.test.ts :: repository foundation defines one honest ordinary CI quality check
run 38060695233:1 (approved configuration difference)
- added file (CI unit test): test/ci/benchmark-report.test.ts
- added file (CI unit test): test/ci/quality-result.test.ts
- added file (CI unit test): test/ci/run-tests.test.ts
- added file (CI unit test): test/ci/test-groups.test.ts
- added: test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- added: test/ci/benchmark-report.test.ts :: benchmark report always reports the six specified heavy files, including missing values, regardless of rank
- added: test/ci/benchmark-report.test.ts :: benchmark report blocks missing group artifacts in directly supplied runs
- added: test/ci/benchmark-report.test.ts :: benchmark report collects paginated API jobs and known archive entries via an injected transport
- added: test/ci/benchmark-report.test.ts :: benchmark report computes the historical 755-second reference separately from A-to-C
- added: test/ci/benchmark-report.test.ts :: benchmark report detects an absent file even if it had no assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report preserves missing/expired artifacts and API errors rather than creating a success
- added: test/ci/benchmark-report.test.ts :: benchmark report reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions
- added: test/ci/benchmark-report.test.ts :: benchmark report records expired artifacts and missing Vitest entries
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files
- added: test/ci/benchmark-report.test.ts :: benchmark report reports file additions separately without treating identical files as identical assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report reports queue-inclusive total and dependency-ready waiting estimates for every job
- added: test/ci/benchmark-report.test.ts :: benchmark report retains cancelled runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains environment runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains failure runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains insufficient runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains missing JSON runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed control runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed target runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains quality skipped runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains rerun runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains test set runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains timeout runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains unmeasured state and historical baseline without a fabricated reduction
- added: test/ci/benchmark-report.test.ts :: benchmark report separates queue, preparation, wall and all executed runner minutes
- added: test/ci/benchmark-report.test.ts :: benchmark report uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "[]"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "not json"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "null"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":null}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"cancelled\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"failure\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"skipped\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"},\"extra\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"unknown\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs undefined
- added: test/ci/quality-result.test.ts :: required CI job aggregation accepts only the exact expected successful jobs
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects missing, empty, or extra job results
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result ""
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "SUCCESS"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "cancelled"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "failure"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "pending"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "skipped"
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess keeps a successful child exit and its actual JSON test records
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess preserves a real failing child exit despite saving reports
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.exit(7)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.kill(process.pid, "SIGTERM")
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess rejects an unknown group before creating artifacts or launching Vitest
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess runs external all against the target checkout and records the separate control ref
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (event)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (throw)
- added: test/ci/test-groups.test.ts :: CI test partition assigns new regular tests to the default groups
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-fallback.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-resample.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/evaluate-grid-fallback.test.ts as recognition
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/folds.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/formal-runner.test.ts as formal
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/generated-bank.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition covers all real regular test files exactly once with no empty group
- added: test/ci/test-groups.test.ts :: CI test partition excludes spike evidence from every group
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group product
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group recognition
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-fallback.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-resample.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/folds.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/formal-runner.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/generated-bank.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects repeated paths
- added: test/repository-foundation.test.ts :: repository foundation aggregates all isolated regression groups into the required quality check
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (failure/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/cancelled)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/failure)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/skipped)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmarks fixed targets without publishing or restricting the control branch
- added: test/repository-foundation.test.ts :: repository foundation preserves full regression and explicit approval before publishing Pages
- added: test/repository-foundation.test.ts :: repository foundation rejects unsafe benchmark refs before any target checkout
- added: test/repository-foundation.test.ts :: repository foundation retains timing artifacts for every ordinary regression group even on failure
- removed: test/repository-foundation.test.ts :: repository foundation defines one honest ordinary CI quality check
run 38061573301:1 (approved configuration difference)
- added file (CI unit test): test/ci/benchmark-report.test.ts
- added file (CI unit test): test/ci/quality-result.test.ts
- added file (CI unit test): test/ci/run-tests.test.ts
- added file (CI unit test): test/ci/test-groups.test.ts
- added: test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- added: test/ci/benchmark-report.test.ts :: benchmark report always reports the six specified heavy files, including missing values, regardless of rank
- added: test/ci/benchmark-report.test.ts :: benchmark report blocks missing group artifacts in directly supplied runs
- added: test/ci/benchmark-report.test.ts :: benchmark report collects paginated API jobs and known archive entries via an injected transport
- added: test/ci/benchmark-report.test.ts :: benchmark report computes the historical 755-second reference separately from A-to-C
- added: test/ci/benchmark-report.test.ts :: benchmark report detects an absent file even if it had no assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report preserves missing/expired artifacts and API errors rather than creating a success
- added: test/ci/benchmark-report.test.ts :: benchmark report reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions
- added: test/ci/benchmark-report.test.ts :: benchmark report records expired artifacts and missing Vitest entries
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files
- added: test/ci/benchmark-report.test.ts :: benchmark report reports file additions separately without treating identical files as identical assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report reports queue-inclusive total and dependency-ready waiting estimates for every job
- added: test/ci/benchmark-report.test.ts :: benchmark report retains cancelled runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains environment runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains failure runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains insufficient runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains missing JSON runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed control runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed target runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains quality skipped runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains rerun runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains test set runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains timeout runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains unmeasured state and historical baseline without a fabricated reduction
- added: test/ci/benchmark-report.test.ts :: benchmark report separates queue, preparation, wall and all executed runner minutes
- added: test/ci/benchmark-report.test.ts :: benchmark report uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "[]"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "not json"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "null"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":null}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"cancelled\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"failure\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"skipped\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"},\"extra\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"unknown\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs undefined
- added: test/ci/quality-result.test.ts :: required CI job aggregation accepts only the exact expected successful jobs
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects missing, empty, or extra job results
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result ""
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "SUCCESS"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "cancelled"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "failure"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "pending"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "skipped"
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess keeps a successful child exit and its actual JSON test records
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess preserves a real failing child exit despite saving reports
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.exit(7)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.kill(process.pid, "SIGTERM")
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess rejects an unknown group before creating artifacts or launching Vitest
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess runs external all against the target checkout and records the separate control ref
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (event)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (throw)
- added: test/ci/test-groups.test.ts :: CI test partition assigns new regular tests to the default groups
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-fallback.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-resample.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/evaluate-grid-fallback.test.ts as recognition
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/folds.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/formal-runner.test.ts as formal
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/generated-bank.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition covers all real regular test files exactly once with no empty group
- added: test/ci/test-groups.test.ts :: CI test partition excludes spike evidence from every group
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group product
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group recognition
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-fallback.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-resample.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/folds.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/formal-runner.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/generated-bank.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects repeated paths
- added: test/repository-foundation.test.ts :: repository foundation aggregates all isolated regression groups into the required quality check
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (failure/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/cancelled)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/failure)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/skipped)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmarks fixed targets without publishing or restricting the control branch
- added: test/repository-foundation.test.ts :: repository foundation preserves full regression and explicit approval before publishing Pages
- added: test/repository-foundation.test.ts :: repository foundation rejects unsafe benchmark refs before any target checkout
- added: test/repository-foundation.test.ts :: repository foundation retains timing artifacts for every ordinary regression group even on failure
- removed: test/repository-foundation.test.ts :: repository foundation defines one honest ordinary CI quality check
run 38062641843:1 (approved configuration difference)
- added file (CI unit test): test/ci/benchmark-report.test.ts
- added file (CI unit test): test/ci/quality-result.test.ts
- added file (CI unit test): test/ci/run-tests.test.ts
- added file (CI unit test): test/ci/test-groups.test.ts
- added: test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- added: test/ci/benchmark-report.test.ts :: benchmark report always reports the six specified heavy files, including missing values, regardless of rank
- added: test/ci/benchmark-report.test.ts :: benchmark report blocks missing group artifacts in directly supplied runs
- added: test/ci/benchmark-report.test.ts :: benchmark report collects paginated API jobs and known archive entries via an injected transport
- added: test/ci/benchmark-report.test.ts :: benchmark report computes the historical 755-second reference separately from A-to-C
- added: test/ci/benchmark-report.test.ts :: benchmark report detects an absent file even if it had no assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report preserves missing/expired artifacts and API errors rather than creating a success
- added: test/ci/benchmark-report.test.ts :: benchmark report reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions
- added: test/ci/benchmark-report.test.ts :: benchmark report records expired artifacts and missing Vitest entries
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files
- added: test/ci/benchmark-report.test.ts :: benchmark report reports file additions separately without treating identical files as identical assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report reports queue-inclusive total and dependency-ready waiting estimates for every job
- added: test/ci/benchmark-report.test.ts :: benchmark report retains cancelled runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains environment runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains failure runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains insufficient runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains missing JSON runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed control runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed target runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains quality skipped runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains rerun runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains test set runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains timeout runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains unmeasured state and historical baseline without a fabricated reduction
- added: test/ci/benchmark-report.test.ts :: benchmark report separates queue, preparation, wall and all executed runner minutes
- added: test/ci/benchmark-report.test.ts :: benchmark report uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "[]"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "not json"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "null"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":null}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"cancelled\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"failure\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"skipped\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"},\"extra\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"unknown\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs undefined
- added: test/ci/quality-result.test.ts :: required CI job aggregation accepts only the exact expected successful jobs
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects missing, empty, or extra job results
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result ""
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "SUCCESS"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "cancelled"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "failure"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "pending"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "skipped"
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess keeps a successful child exit and its actual JSON test records
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess preserves a real failing child exit despite saving reports
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.exit(7)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.kill(process.pid, "SIGTERM")
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess rejects an unknown group before creating artifacts or launching Vitest
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess runs external all against the target checkout and records the separate control ref
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (event)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (throw)
- added: test/ci/test-groups.test.ts :: CI test partition assigns new regular tests to the default groups
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-fallback.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-resample.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/evaluate-grid-fallback.test.ts as recognition
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/folds.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/formal-runner.test.ts as formal
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/generated-bank.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition covers all real regular test files exactly once with no empty group
- added: test/ci/test-groups.test.ts :: CI test partition excludes spike evidence from every group
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group product
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group recognition
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-fallback.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-resample.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/folds.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/formal-runner.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/generated-bank.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects repeated paths
- added: test/repository-foundation.test.ts :: repository foundation aggregates all isolated regression groups into the required quality check
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (failure/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/cancelled)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/failure)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/skipped)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmarks fixed targets without publishing or restricting the control branch
- added: test/repository-foundation.test.ts :: repository foundation preserves full regression and explicit approval before publishing Pages
- added: test/repository-foundation.test.ts :: repository foundation rejects unsafe benchmark refs before any target checkout
- added: test/repository-foundation.test.ts :: repository foundation retains timing artifacts for every ordinary regression group even on failure
- removed: test/repository-foundation.test.ts :: repository foundation defines one honest ordinary CI quality check
run 38063595644:1 (approved configuration difference)
- added file (CI unit test): test/ci/benchmark-report.test.ts
- added file (CI unit test): test/ci/quality-result.test.ts
- added file (CI unit test): test/ci/run-tests.test.ts
- added file (CI unit test): test/ci/test-groups.test.ts
- added: test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- added: test/ci/benchmark-report.test.ts :: benchmark report always reports the six specified heavy files, including missing values, regardless of rank
- added: test/ci/benchmark-report.test.ts :: benchmark report blocks missing group artifacts in directly supplied runs
- added: test/ci/benchmark-report.test.ts :: benchmark report collects paginated API jobs and known archive entries via an injected transport
- added: test/ci/benchmark-report.test.ts :: benchmark report computes the historical 755-second reference separately from A-to-C
- added: test/ci/benchmark-report.test.ts :: benchmark report detects an absent file even if it had no assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report preserves missing/expired artifacts and API errors rather than creating a success
- added: test/ci/benchmark-report.test.ts :: benchmark report reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions
- added: test/ci/benchmark-report.test.ts :: benchmark report records expired artifacts and missing Vitest entries
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- added: test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files
- added: test/ci/benchmark-report.test.ts :: benchmark report reports file additions separately without treating identical files as identical assertions
- added: test/ci/benchmark-report.test.ts :: benchmark report reports queue-inclusive total and dependency-ready waiting estimates for every job
- added: test/ci/benchmark-report.test.ts :: benchmark report retains cancelled runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains environment runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains failure runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains insufficient runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains missing JSON runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed control runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains mixed target runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains quality skipped runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains rerun runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains test set runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains timeout runs with an explicit comparison blocker
- added: test/ci/benchmark-report.test.ts :: benchmark report retains unmeasured state and historical baseline without a fabricated reduction
- added: test/ci/benchmark-report.test.ts :: benchmark report separates queue, preparation, wall and all executed runner minutes
- added: test/ci/benchmark-report.test.ts :: benchmark report uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "[]"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "not json"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "null"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":null}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"cancelled\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"failure\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"skipped\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"},\"extra\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"success\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{\"result\":\"unknown\"}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{\"regression\":{}}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs "{}"
- added: test/ci/quality-result.test.ts :: required CI job aggregation CLI returns the required exit code for needs undefined
- added: test/ci/quality-result.test.ts :: required CI job aggregation accepts only the exact expected successful jobs
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects missing, empty, or extra job results
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result ""
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "SUCCESS"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "cancelled"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "failure"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "pending"
- added: test/ci/quality-result.test.ts :: required CI job aggregation rejects the regression result "skipped"
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess keeps a successful child exit and its actual JSON test records
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess preserves a real failing child exit despite saving reports
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.exit(7)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess records missing JSON and nonzero termination for process.kill(process.pid, "SIGTERM")
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess rejects an unknown group before creating artifacts or launching Vitest
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess runs external all against the target checkout and records the separate control ref
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (event)
- added: test/ci/run-tests.test.ts :: recorded Vitest subprocess writes nonzero metadata for native process launch failure (throw)
- added: test/ci/test-groups.test.ts :: CI test partition assigns new regular tests to the default groups
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-fallback.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/browser-grid-resample.test.ts as grid-compatibility
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/evaluate-grid-fallback.test.ts as recognition
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/folds.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/formal-runner.test.ts as formal
- added: test/ci/test-groups.test.ts :: CI test partition classifies test/recognition/generated-bank.test.ts as holdout
- added: test/ci/test-groups.test.ts :: CI test partition covers all real regular test files exactly once with no empty group
- added: test/ci/test-groups.test.ts :: CI test partition excludes spike evidence from every group
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group product
- added: test/ci/test-groups.test.ts :: CI test partition rejects an empty default group recognition
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-fallback.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/browser-grid-resample.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/folds.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/formal-runner.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects missing explicit file test/recognition/generated-bank.test.ts
- added: test/ci/test-groups.test.ts :: CI test partition rejects repeated paths
- added: test/repository-foundation.test.ts :: repository foundation aggregates all isolated regression groups into the required quality check
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (failure/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/cancelled)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/failure)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/skipped)
- added: test/repository-foundation.test.ts :: repository foundation benchmark C aggregation requires successful selected jobs (success/success)
- added: test/repository-foundation.test.ts :: repository foundation benchmarks fixed targets without publishing or restricting the control branch
- added: test/repository-foundation.test.ts :: repository foundation preserves full regression and explicit approval before publishing Pages
- added: test/repository-foundation.test.ts :: repository foundation rejects unsafe benchmark refs before any target checkout
- added: test/repository-foundation.test.ts :: repository foundation retains timing artifacts for every ordinary regression group even on failure
- removed: test/repository-foundation.test.ts :: repository foundation defines one honest ordinary CI quality check

## 判定と測定条件

A→Cの検証wall中央値は662→257秒で61.18%短縮し、Issue #32の30%以上という目標を達成した。A/B/C各3回、全9 run成功、artifact・測定値欠落なし。Cの257秒は歴史的755秒に対して65.96%短いが、歴史値は別環境の参考値であり主判定には使わない。528秒の目安も主判定の代用ではない。

A→Bは662→793秒（19.79%増）、B→Cは793→257秒（67.59%短縮）。A/Bで評価実装は同一なので、A→Bの増加を認識計算の改悪と断定できない。共通既存43ファイルのassertion-span合計中央値もA約602.7秒、B約723.9秒、C約716.0秒と変動した。新CI構成検証のassertion-span合計はB約7.4秒で、A/B wall差131秒をそれだけでは説明できない。runner環境の変動など原因の切り分けはこの9回ではできない。Cの短縮は5グループの並列実行によるwall短縮として解釈し、評価関数自体の高速化とは呼ばない。

runner分数中央値はA 11.10、B 13.25、C 15.95。A→Cは43.69%増加する。これは実行したvalidate、検証、quality各jobの時間合計であり、Cの並列化によるrunner消費増を伴う。CのRSSは5グループ各Vitest commandのGNU time最大常駐量で、同時processのRSS合計やworkflow全体のピークではない。値とscopeはrun別記録とJSONに保存した。

基準SHAは `1a01eac18f389e7933be9937ad7fa4aa8be476b7`、変更後SHAは `1858c4a3d6fb7ca65a5dc1111e2fad9178d36429`、制御SHAは `fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1`。全9 runのmetadataで制御SHAと対象SHAを確認した。Nodeは全run `v22.12.0`、Chromiumは全run `Google Chrome for Testing 151.0.7922.34`。保存した全jobログでrunner image `ubuntu-24.04` / `20261004.327.1` とcheckout/setup-node/upload-artifactの固定Action SHAが一致した。新9 runのdispatchは直前runの完了から16.6〜41.3秒後で並走しない。生ログとAPI取得記録はローカルの `.superpowers/sdd/2026-10-10-ci-recognition-performance/benchmark-runs/<run ID>/` に保存した。

baselineと変更後の `src/`、`test/recognition/`、`package-lock.json`、`.node-version`、Pages workflowに差分はない。通常テストはA 44 files/374 assertions、B/C 48 files/457 assertions。追加は4つのCI unit testファイルとfoundationの構成assertionだけで、B/Cの集合は各runで同一、既存の評価assertion欠落なし。比較CLIの`comparable=true`、`reasons=[]`、各runの`issues=[]`/`missingArtifacts=[]`を[JSON](comparison.md.json)に保存した。別途、故意のproduct失敗時は他4グループが成功しqualityが失敗、取消時もqualityが失敗することを[Actions検証](actions-verification.md)で確認済み。

9 runでtimeout、取消、retry、artifact欠落、テスト失敗は観測されなかった。この有限回の観測は将来のflaky不在を証明しない。Vitest JSONにretryCountがないため、単一成功artifactだけから一時的失敗の有無は判断しない。

## ローカル最終検証（Actions比較とは別）

以下は初回candidate `781035f` の検証記録。review修正ではcollectorテストを24→28件へ追加しfocused/typecheck/buildを再検証した。評価/runner不変のためfull/group/productは再実行しておらず、下表の実測値・集合を更新後の全suite実行と呼ばない。

同一macOS上でfull→5groupsを直列実行。新しいcollectorテスト4件をfull完了後に追加してfocused/productを再検証した。評価コードは不変のため、controller裁定により重いfullは再実行していない。

| 実行 | files | tests | Vitest秒 | child elapsed ms |
| --- | ---: | ---: | ---: | ---: |
| full | 48 | 449 | 385.67 | 未収集 |
| product | 21 | 220 | 19.40 | 19605.36 |
| formal | 1 | 1 | 85.58 | 85778.86 |
| holdout | 2 | 3 | 102.00 | 102195.84 |
| grid-compatibility | 2 | 4 | 96.42 | 96621.75 |
| recognition | 22 | 225 | 86.45 | 86680.90 |

全group exit0/success=true/reportMissing=false。group和集合48files/453testsはfullの48files/449testsを完全包含し、重複file0、欠落assertion0、共通assertion成否不一致0。追加差はcollectorの許容差分検査4件だけ:

- test/ci/benchmark-report.test.ts :: benchmark report allows foundation assertion replacement while preserving raw added/removed assertions
- test/ci/benchmark-report.test.ts :: benchmark report allows only the four approved CI file additions and retains their raw durations/differences
- test/ci/benchmark-report.test.ts :: benchmark report rejects inconsistent test sets within the same target even for an approved CI path
- test/ci/benchmark-report.test.ts :: benchmark report rejects unknown additions, missing baseline files and missing foundation files

Node=v22.12.0, Chromium=Google Chrome for Testing 151.0.7922.34。全group maxRssKiB=null、理由はLinux GNU timeが必要なため。group metadata condition=null、target/control SHA=97d915bc1169ee0d3d7ce6fee4d8b9cd6551f925 は検証開始時HEAD（collectorはworking-tree変更として実行）。これらをA/B/CのCI測定へ転用しない。署名固定candidateはTask 5 reportへ記録。

baseline通常44filesのbyte比較は43files完全一致、foundation構成検証のみ変更、欠落0。認識評価/fixtures/lock/Node/Pagesはdiffなし。4つのCI unit filesを追加した。

| 重い6file | full assertion-span ms | group assertion-span ms |
| --- | ---: | ---: |
| test/recognition/formal-runner.test.ts | 85310.57 | 84943.01 |
| test/recognition/folds.test.ts | 64339.07 | 63839.95 |
| test/recognition/browser-grid-resample.test.ts | 53300.90 | 53935.61 |
| test/recognition/evaluate-grid-fallback.test.ts | 47966.23 | 48394.11 |
| test/recognition/browser-grid-fallback.test.ts | 40599.56 | 41706.63 |
| test/recognition/generated-bank.test.ts | 36411.27 | 37274.02 |

このローカル時間はActions queue/setup/wall/runner-minutesや短縮率を表さない。全fileの時間と集合照合結果はTask 5 reportに保存した。
