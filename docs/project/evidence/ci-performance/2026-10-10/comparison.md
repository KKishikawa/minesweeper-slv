# CI performance comparison

比較状態: 比較不可 / 未測定条件あり。異常runも全件保持。

条件別の値は中央値 (最小–最大)。queueはAPI created_at→run_started_at、準備はrun_started_at→最初の選択検証job開始、wallはA/B serial開始→終了、C最初のgroup開始→quality終了。runner分数はvalidateとqualityを含む、実行した全job時間の合計。

| 条件 | run数 | queue秒 | 準備秒 | 検証wall秒 | 総runner分数 |
| --- | ---: | --- | --- | --- | --- |
| A | 0 | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) |
| B | 0 | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) |
| C | 0 | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) |

AtoB: 未測定 / 比較不可
BtoC: 未測定 / 比較不可
AtoC: 未測定 / 比較不可

歴史的記録: 12分35秒 (755秒)。別環境・過去runの参考値でありAの代用にはしない。目安8分48秒 (528秒) だけで完了判定しない。A→Cの3回以上の同条件比較が必要。

A/B評価実装は同一（Task 4で安全な再計算削減なし）。B/Cは同じtarget SHA。許容する差分はこのIssueの4既知CI unit testファイルの追加とfoundation構成assertionの追加/置換のみ。同一target SHA内の差は許容しない。全差分へ記録し、既存評価assertionの固定は別途diffで確認する。

## 比較を妨げる条件

- A: at least 3 runs required (0)
- B: at least 3 runs required (0)
- C: at least 3 runs required (0)

## 重い6ファイル (elapsedとassertion合計を分離)

Vitest testResults[].endTime-startTimeは最早assertion開始→最終assertion終了のミリ秒（module import/transformや前後setup全体を含まない）。assertionResults[].duration合計はassertion時間でありelapsedの代用にしない。絶対checkoutパスはtest/から正規化。numTotalTestSuitesはファイル数として使用しない。

### A

| ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) |
| --- | --- | --- |
| 未測定 | 未測定 | 未測定 |

### B

| ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) |
| --- | --- | --- |
| 未測定 | 未測定 | 未測定 |

### C

| ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) |
| --- | --- | --- |
| 未測定 | 未測定 | 未測定 |

## 共通既存ファイルと構成検証の時間

全runに共通する既存ファイル 0件（foundationと4既知CI unit testを除外）。各file時間は上記とJSONへ保持。合計はassertion-spanの和であり並列wall timeではない。

| 条件 | 共通file elapsed ms 合計 中央値 (範囲) | 構成検証 elapsed ms 合計 中央値 (範囲) |
| --- | --- | --- |
| A | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) |
| B | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) |
| C | 未測定 (未測定–未測定) | 未測定 (未測定–未測定) |

## run別の記録

JSON詳細には全job/step UTC時刻、結論、再実行attempt、欠落artifact、ファイル時間/全assertion集合、RSS値とscopeを保存。RSSはGNU timeのcommandとwaited-for descendantsの最大値であり、全processの同時RSS合計ではない。

- 未測定。Actions run IDは未取得。remote failure/cancel/timeout/flaky検証、Linux GNU time測定、A/B/C最低各3回は保留。

## 検証集合差

未測定。baselineとの差分は実run取得後に照合する。

## 実測前に残る手順

この資料のA/B/C表は未測定であり、改善目標の達成は未判定。現在のbaselineは `1a01eac18f389e7933be9937ad7fa4aa8be476b7`。固定する変更後candidateとbenchmark controlの完全SHAはTask 5 reportへ記録する。評価実装の変更はなく、A/Bは同一の評価計算である。

benchmark workflowはdefault branchへ未登録のため、既存の外部操作承認gateと登録を完了してから実行する。ローカルからpush、dispatch、mergeはしていない。故意の1グループ失敗と取消のActions検証、Linux GNU time実測、A→B→Cを並走させない3組が保留。失敗/timeout/再実行/artifact欠落もrun ID付きで保存し、再測定は理由付きで追加する。

収集例（実run取得後にIDを置換する）:

```sh
npx --no-install tsx scripts/ci/benchmark-report.ts \
  --repo KKishikawa/minesweeper-slv \
  --run-ids '<A1>,<B1>,<C1>,<A2>,<B2>,<C2>,<A3>,<B3>,<C3>' \
  --output docs/project/evidence/ci-performance/2026-10-10/comparison.md
```

特定の再実行は `ID:attempt` で指定可能。比較不可でもMarkdownと `.md.json` を出力してexit 1とし、異常runを除去しない。jobs/artifactsはAPIの全ページを読み、artifactは既知root entry `metadata.json` / `vitest.json` のみ `unzip -p` で読む。既存 `gh` 認証を利用し、API/childのerror本文や認証tokenは出力しない。

API/zipの正常・異常経路はsynthetic unit testで検証した。未登録benchmark workflowの実API/実artifact収集は未検証。Vitest JSONはretryCountを含まないため、単一成功artifactからflaky不在を証明できない。failure/timeout/取消/attemptは保存するが、flakyの有無は今後の実run観測として残す。


## ローカル最終検証（Actions比較とは別）

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
