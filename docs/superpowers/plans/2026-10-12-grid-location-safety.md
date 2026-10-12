# Grid Location Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 誤位置3枚を公開 `null` として棄却し、既存の14/16と安全性・予算・性能条件を保つ。

**Architecture:** 既存の採用条件を通った返却予定境界に、全精密評価済み候補による追加の安全性判定を適用する。direct・canonicalの競合は `safety-rejected` で終了し、元画像へ戻した候補の競合はその候補を `null` にする。競合証拠を採用候補へ昇格させない。

**Tech Stack:** TypeScript、Vitest、Sharp、Playwright Chromium。既存依存のみを使う。

**Spec:** [承認済み設計](../specs/2026-10-12-grid-location-safety-design.md)

## 実行状態（2026-10-12）

所有者がサブエージェント駆動を選択。Task 0の全25件baselineを凍結し、Task 1の独立判定関数を実装して、それぞれ別担当のレビューを受けた。Task 2の試験的統合は109成功・既存3失敗となり、停止条件を満たした。fixture 0の42px差の競合は承認済みの判定条件を満たすと別担当が確認した。候補には新規型エラーと未完了の統合テストも残るため、Task 2を完了扱いにしない。

候補差分と証拠を保存し、Task 2の4ファイルを統合前へ復元した。復元後の限定92テストと、Git無視対象の調査artifactを除いた型検査は成功した。全体型検査には以前のローカル調査スクリプトのエラーが残る。Task 3/4は未実行。以下のチェックリストは未実施の手順も含む実行時の計画として保存し、実績は[停止記録](../../project/evidence/issue-6/2026-10-12/grid-location-safety.md)とローカルledgerへ記録している。第一案は採用せず設計へ戻る。

## Global Constraints

- 競合支持条件は `intersectionSupportRatio >= 0.9`、`minimumOuterBoundaryEnergyRatio >= 1.3`。位相・外周相対比較・score差で競合証拠を捨てない。
- 対応する境界の最大差が4pxを超えれば棄却する。4pxは正解geometryの許容差ではない。
- 境界列から計算した縦横pitchの相対差と、返却予定位置の対応するpitchとの差は各5%以下。
- directとcanonicalで共有する20,000 pair予算、曖昧候補最大8件、元画像survivorちょうど1を維持する。
- 既存正式Chromiumのケース別11 direct・3 fallback・2 source-revalidation-rejectedと既存assertionを変更しない。
- 完全経路median≤500ms、worst≤1,000ms。既存16ケースと追加24枚は別表にする。
- 新規画像のboundsは下書き。正式boundsの確認が済むまで新規画像の正位置・採用は未判定とする。
- 画像・元JSON・既存truth・正式manifest・ADR・認識器・solver・UIを変更しない。追加negative収録も要求しない。
- 停止条件を満たしたら証拠を保存して設計へ戻る。閾値調整や期待値変更で通さない。Issue #7の開始停止を維持する。
- Git署名設定を維持する。署名失敗時は署名を無効にせず、失敗と環境調査を記録する。
- 修正前25件はTask 0で未変更の製品コードから再測定し、コード・元画像・RGBAのhash付きで確定する。inventoryの結果だけを修正前証拠にしない。
- 既存16ケースの性能合格はTask 4の独立CLI実行で確認する。終了コード0と `uxLatencyPassed === true` の両方を必須とし、テスト成功だけで代用しない。

## Review Focus

- 内部境界は似ていても最終返却端点だけがずれる入力を見落とさない（Task 2）。
- 離れた2盤面や異なる整数pitchの候補も、実際のpitchが対応すれば競合として棄却する（Task 1）。
- NaN・欠落・不正な境界列により競合判断を省略してgeometryを返さない（Task 1）。
- 正規化後の候補上限や座標系の取り違えにより安全性棄却を回避しない（Task 2）。
- 下書きboundsによる一致や、全ケース `null` の結果を正式fixture準備完了へ読み替えない（Task 3）。

## ファイルの責務と実行順

`src/recognition/grid-strict.ts` に判定型・独立した判定関数・directとmapped再検証での呼出しを置く。`src/recognition/grid-fallback.ts` は新しい終端状態だけを扱う。判定関数は内部moduleのテスト用exportとし、公開 `grid.ts` からは再exportしない。

`test/recognition/grid-location-safety.test.ts` は判定条件、既存 `grid.test.ts` と `grid-fallback.test.ts` は経路統合を検証する。`scripts/recognition/evaluate-grid-location-safety.ts` と同名のテストは、未登録のローカル画像を正式manifestから分離して測る。既存browser/性能テストと期待表は維持する。

`scripts/recognition/capture-grid-location-baseline.ts` はTask 0専用の修正前測定を行い、同名テストはhashと件数の検証を扱う。Task 3のrunnerはその保存済みbaselineを明示的に読み込む。

Task 0 → 1 → 2 → 3 → 4の順に実行する。実装開始時は `superpowers:using-git-worktrees` とOrca管理状況を確認し、設計・計画・ローカル資料を失わずに隔離した作業場所を用意する。現在のevidenceディレクトリはGit未追跡、画像はGit管理外なので、通常のcheckoutだけでは揃わない。公開許諾未確認の画像をコミットして移送しない。

### Task 0: 未変更コードによる25件の修正前結果の確定

**Files:** Create `scripts/recognition/capture-grid-location-baseline.ts`, `test/recognition/capture-grid-location-baseline.test.ts`; local output `test/artifacts/grid-location-safety/source-before.json`。製品コードは変更しない。

**Interfaces:** CLIは `--index <normalized-truth/index.json> --inventory <capture-inventory.json> --investigation <grid-investigation.json> --output <new-file>`。出力は `schemaVersion: 1`、`status: "baseline-complete"`、日時・環境・Git commit/dirty、`codeHashes`、investigationから写した4ファイルの `referenceCodeHashes`、入力index/inventory/investigation/lockfileのhash、全25件の `cases` を持つ。各caseはID・行列数・scope・元画像hash・RGBA hash・解像度・stage・geometry・両pair数・候補数・survivor数・normalized RGBA hashまたはnullを持つ。

- [ ] **Step 1: 出所検証の失敗テストを書く。** 小さな差し替え入力で、画像hash不一致、重複ID・欠落、測定中の製品コード変更、測定前後のRGBA変更が失敗となることをassertする。全件のコードhashと入力hashを保存し、geometryがnullでもcaseを省略しないことを検証する。

- [ ] **Step 2: REDを確認する。** `npx vitest run test/recognition/capture-grid-location-baseline.test.ts`。runnerが未実装のため失敗すること。

- [ ] **Step 3: baseline runnerを実装する。** indexとinventoryの全25件を照合し、Sharpの既存 `decodeImage()` と未変更の `detectGridWithDiagnostics()` で全件を測る。測定前にinvestigationの `productionSourceSha256` と現在の4ファイルのhash一致を必須にする。さらに `src/recognition/grid*.ts` 全件、`pixels.ts`、`types.ts`、`test/recognition/image-io.ts`、baseline runner自身のhashとSharp/library版を保存する。測定前後のコードhash・RGBA hashが同一であることを確認し、出力は新規ファイルへ排他的に書く。途中失敗では `baseline-complete` を付けない。

- [ ] **Step 4: GREEN後、実画像25件を測定する。**

```bash
npx vitest run test/recognition/capture-grid-location-baseline.test.ts
npx tsx scripts/recognition/capture-grid-location-baseline.ts --index test/artifacts/capture-review-2026-10-12/normalized-truth/index.json --inventory docs/project/evidence/issue-6/2026-10-12/capture-inventory.json --investigation docs/project/evidence/issue-6/2026-10-12/grid-investigation.json --output test/artifacts/grid-location-safety/source-before.json
```

終了コード0、`baseline-complete`、IDが25件すべて一意、30×16の24件と16×16の1件、全コード・元画像・RGBA hashの保存を確認する。3誤位置を含むinventoryのstage/geometry、および代表10件のinvestigationのRGBA・公開結果との一致を確認し、不一致なら証拠を保存してTask 1前に停止する。inventoryとの一致だけで出所を証明せず、新しい実測結果とそのhashをbaselineとする。

- [ ] **Step 5: baselineを凍結する。** 保存ファイルのSHA-256を64文字の小文字hexと末尾改行だけの別ファイル `source-before.sha256` に排他的に記録し、Task 3の比較入力に渡す。runnerとテストを署名付きコミット `test: capture hash-bound pre-change grid baseline` の対象とし、画像をコミットしない。baselineの保存・検証が完了するまでTask 1を始めない。

### Task 1: 競合証拠を使う判定関数

**Files:** Modify `src/recognition/grid-strict.ts`; Create `test/recognition/grid-location-safety.test.ts`.

**Interfaces:**

```ts
export type GridLocationSafetyResult =
  | { readonly status: "safe" }
  | { readonly status: "conflict"; readonly reason: "invalid-evidence" | "competing-location";
      readonly candidateIndex: number | null; readonly maximumBoundaryDifference: number | null };
export function assessGridLocationSafety(
  image: Pick<PixelImage, "width" | "height">,
  dimensions: GridDimensions,
  proposed: GridBoundaryCandidate,
  candidates: readonly RefinedGridCandidate[],
): GridLocationSafetyResult;
```

- [ ] **Step 1: 固定入力の失敗テストを書く。** proposedは4×4、縦横境界 `[20,40,60,80,100]`、画像400×400。全canonical境界を同じ量ずらした競合fixtureを作り、支持比0.9・外周比1.3、低score、位相不一致・弱いdistinctivenessでも以下を検証する。

```ts
expect(assess(shifted(4))).toEqual({ status: "safe" });
expect(assess(shifted(5))).toMatchObject({ status: "conflict", reason: "competing-location", maximumBoundaryDifference: 5 });
expect(assess(shifted(5, { intersectionSupportRatio: 0.899 }))).toEqual({ status: "safe" });
expect(assess(shifted(5, { minimumOuterBoundaryEnergyRatio: 1.299 }))).toEqual({ status: "safe" });
```

`assess` は上記固定入力と対象候補を関数へ渡すテスト内wrapper、`shifted` は `RefinedGridCandidate` を返すテスト内factoryとする。全fieldを用意し、unchecked castで欠落を隠さない。

- [ ] **Step 2: 境界・異常入力テストを追加する。** 列だけ・行だけの5px差、別盤面、逆順入力・重複候補、候補整数pitchは違うが端点pitchは同じケースを検証する。相対差は `abs(a-b)/max(a,b)` とし、pitch 19対20は通り18.99対20は競合対象外。行列数不一致、非単調、画像外、NaN、非有限支持値は `conflict/invalid-evidence` とする。空の正常候補集合は `safe` とする。

- [ ] **Step 3: REDを確認する。** `npx vitest run test/recognition/grid-location-safety.test.ts`。未実装関数による失敗であることを確認する。

- [ ] **Step 4: 判定関数と型を実装する。** 設計のcanonical列・端点pitch・絶対支持条件で全候補を線形走査する。proposedも検証する。境界本数・座標・支持値が評価不能なら棄却し、有効な候補のpitch不一致や絶対支持不足は競合対象外とする。最初の競合indexと位置差を返し、配列を変更しない。

- [ ] **Step 5: GREENと型を確認する。** 上記Vitestと `npm run typecheck` が成功すること。入力不変をテストし、署名付きコミット `feat: add grid location safety assessment` を試みる。署名失敗は報告・調査し、署名を無効にしない。

### Task 2: direct・canonical・元画像再検証へ統合する

**Files:** Modify `src/recognition/grid-strict.ts`, `src/recognition/grid-fallback.ts`, `test/recognition/grid.test.ts`, `test/recognition/grid-fallback.test.ts`.

**Interfaces:** Consumes Task 1の `assessGridLocationSafety()`。Produces内部 `StrictGridAttempt` の `safety-rejected`（候補空・geometryなし・coarse/source context/pair数保持）と診断stage `safety-rejected`。公開 `detectGrid()` の型は変更しない。

- [ ] **Step 1: 経路の失敗テストを書く。** 差し替えoperationでdirect `safety-rejected` を返し、`geometry === null`、`stage === "safety-rejected"`、estimate/resample/revalidateが未呼出し、canonical pair数0をassertする。canonical側の同状態はnormalized imageと両pair数を保持し、revalidate未呼出しをassertする。

- [ ] **Step 2: 実候補による統合テストを書く。** 既存synthetic gridのsource contextへ5pxずれた高支持候補を追加し、mapped再検証が `null` になることをassertする。directについても最終返却端点に基づく5px競合の棄却を検証する。canonical列が4px以内でも実返却端点が5px差になる入力を含める。安全性判定を通らない元画像候補だけがsurvivorから消え、0・複数survivorを採用しないことを検証する。

- [ ] **Step 3: REDを確認する。** `npx vitest run test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts`。新しい状態・判定が未実装のため失敗すること。

- [ ] **Step 4: 終端処理と判定呼出しを実装する。** directは最終geometry確定後・`found`返却前に、canonical列の先頭末尾を最終端点へ差し替えたコピーで判定する。mapped側は既存検証後・geometry返却前に元画像座標列とsource context全候補で判定する。direct/canonicalの `safety-rejected` をfallback側で即時終了させる。

- [ ] **Step 5: stage利用箇所を確認する。** `rg -n 'StrictGridAttempt|GridDetectionDiagnosticResult|source-revalidation-rejected|canonical-rejected' src scripts test` と型検査で分岐漏れを確認する。既存16ケース期待表と `scripts/recognition/dataset.ts` のmanifest期待stageには新stageを追加しない。判定不能を既存棄却stageに偽装しない。

- [ ] **Step 6: 統合と既存安全性を確認する。** `npx vitest run test/recognition/grid-location-safety.test.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-budget.test.ts test/recognition/grid-evidence.test.ts test/recognition/grid-resample.test.ts` と `npm run typecheck` を実行する。新テストGREEN、既存negative/overflow/8件上限/予算/provenanceを維持すること。既存期待値が変わったらTask 3・4へ採用前提で進まず、失敗証拠を保存して停止する。通れば署名付きコミット `fix: reject conflicting grid locations before returning geometry`。

### Task 3: ローカル収録画像の独立評価と証拠保存

**Files:** Create `scripts/recognition/evaluate-grid-location-safety.ts`, `test/recognition/evaluate-grid-location-safety.test.ts`; local outputs `test/artifacts/grid-location-safety/`; report `docs/project/evidence/issue-6/2026-10-12/grid-location-safety.md`.

**Interfaces:** evaluatorは `decodeImage()`、`deriveBrowserImages()`、`detectGridWithDiagnostics()` を使用する。CLIは `--index <normalized-truth/index.json> --inventory <capture-inventory.json> --baseline <source-before.json> --baseline-hash <source-before.sha256> --mode source|chromium --output <new-directory>`。入力indexは正式manifestとして解釈しない。公開出力と、検証用にstrict/source contextから再計算した競合根拠を分離して保存する。

- [ ] **Step 1: 評価runnerの失敗テストを書く。** 入力hash不一致・画像不足・baselineファイルhash不一致・baseline内のID/画像/RGBA/行列数不一致を明示的に失敗とする。修正前コードhashの欠落やTask 0の基準hashとの不一致も失敗とし、修正後コードhashとの一致は要求しない。sourceは25件、Chromiumはpositive候補24×4件、対象外16×16は別表となることを小さな差し替え入力でassertする。3誤位置のどれかが非nullなら安全性回帰失敗とする。全nullまたは下書きbounds一致でも `fixtureReady === false` とし、正位置判定は `pending-reviewed-bounds` とする。実画像に依存する通常CIテストを作らない。

- [ ] **Step 2: REDを確認する。** `npx vitest run test/recognition/evaluate-grid-location-safety.test.ts`。

- [ ] **Step 3: runnerを実装する。** indexとinventoryのhash・行列・scopeを照合し、元画像hashとRGBA hash、環境・製品コードhash、stage/geometry、候補・survivor・pair数を記録する。source比較の修正前結果はTask 0で凍結した全25件のbaselineだけを使う。baseline自身のhash、`baseline-complete`、全ID・元画像・RGBA・行列数の対応を検証し、修正前後双方のコードhashとbaselineの出所hashを比較レポートへ保存する。baselineの4ファイルhashは、Task 0が保存したinvestigationの基準hashと照合する。inventoryのstage/geometryは歴史的参考結果に限定する。競合根拠の再計算は公開検出と同じgeometry/stageになることを確認し、性能区間から除外する。元資料・baseline・出力ディレクトリを上書きしない。

- [ ] **Step 4: GREEN後、source25件を実行する。**

```bash
npx vitest run test/recognition/evaluate-grid-location-safety.test.ts
npx tsx scripts/recognition/evaluate-grid-location-safety.ts --index test/artifacts/capture-review-2026-10-12/normalized-truth/index.json --inventory docs/project/evidence/issue-6/2026-10-12/capture-inventory.json --baseline test/artifacts/grid-location-safety/source-before.json --baseline-hash test/artifacts/grid-location-safety/source-before.sha256 --mode source --output test/artifacts/grid-location-safety/source-after
```

期待結果は3誤位置がすべてnull、全25件の修正前後を記録、24件と対象外1件が別集計。達しなければ停止し、閾値を調整しない。

- [ ] **Step 5: Chromium 96ケースを測る。** 上記CLIを `--mode chromium --output test/artifacts/grid-location-safety/chromium-after` で実行する。`deriveBrowserImages()` の正式4変換を使い、各入力を取得・保持してwarmup後に3反復測定する。strict/completeをケースごとに隣接させ反復ごとに順序を交替し、hash/assertion/競合根拠保存を計測外にする。決定性、共有予算、median≤500ms・worst≤1,000msを確認する。boundsは下書きなので正式正位置判断は保留と記録する。

- [ ] **Step 6: 証拠を報告する。** sourceとCanvasを別表にし、返却geometry、棄却理由、性能、未検証事項を記録する。必要な実画像を公開許諾前にGitへ入れず、報告はhashと診断値で追跡可能にする。署名付きコミット `test: add grid location safety evaluation tooling and report` を試みる。

### Task 4: 既存正式行列と採否の確認

**Files:** 既存 `test/recognition/browser-grid-fallback.test.ts`, `test/recognition/browser-grid-resample.test.ts`, `test/recognition/evaluate-grid-fallback.test.ts` は実行対象。Task 3の報告だけを更新し、期待表・ADR・manifestを変更しない。

**Interfaces:** `evaluateGridEvidence()` の既存16ケースpaired測定と既存browserテストの期待値を採用基準とする。

- [ ] **Step 1: 正式16ケースの機能テストを実行する。** `npx vitest run test/recognition/browser-grid-fallback.test.ts test/recognition/browser-grid-resample.test.ts test/recognition/evaluate-grid-fallback.test.ts`。11/3/2のケース別stage、geometry、normalized hash、候補・survivor・pair数、3反復の決定性、public/diagnostic一致が既存assertionのまま通ること。性能テストは計算結果との一致を検証するもので、性能合格そのものは保証しない。

- [ ] **Step 2: 既存評価CLIを単独実行し、性能合否と終了コードを保存する。** 以下を検出器測定が他の処理と並走しない状態で実行する。標準出力JSON・標準エラー・終了コードを新規ディレクトリに保存し、失敗でも出力を残す。

```bash
python3 - <<'PY'
import json, subprocess
from pathlib import Path
out = Path('test/artifacts/grid-location-safety/formal-after')
out.mkdir(parents=True, exist_ok=False)
result = subprocess.run(['npx', 'tsx', 'scripts/recognition/evaluate-grid-fallback.ts'], capture_output=True, text=True)
(out / 'stdout.json').write_text(result.stdout)
(out / 'stderr.txt').write_text(result.stderr)
(out / 'exit-code.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
if result.returncode != 0:
    raise SystemExit('STOP: formal CLI failed; outputs saved')
report = json.loads(result.stdout)
required = ['uxLatencyPassed', 'functionalMatrixPassed', 'determinismPassed', 'budgetPassed']
if len(report['cases']) != 16 or any(report[name] is not True for name in required):
    raise SystemExit('STOP: formal CLI acceptance failed; outputs saved')
if not (0 <= report['completeMedianMilliseconds'] <= 500 and 0 <= report['completeWorstMilliseconds'] <= 1000):
    raise SystemExit('STOP: formal CLI latency exceeded limits; outputs saved')
print('PASS: exitCode=0; 16 cases; UX/function/determinism/budget=true')
PY
```

同じ保存先へコードhash・lockfile hash・環境と実行コマンドを記録する。median≤500ms、worst≤1,000ms、`uxLatencyPassed === true` を保存JSONで確認する。CLIはnegative matrixを評価しないため、`negativeMatrixPassed: null` をnegative合格と解釈せずTask 2のnegativeテスト結果と併記する。終了コード非0・JSON欠落/不正・必須値false・性能超過のどれかで停止し、Step 3へ進まない。

- [ ] **Step 3: 全体検証を実行する。** Step 1・2がともに通った場合に `npm run typecheck`、`npm test`、`npm run build`、`git diff --check` を実行する。新しい通常テストは既存CI分類に従いrecognition群で実行されることを確認する。製品ロジックのfixture ID・bounds・ブラウザ別分岐を差分レビューで確認する。

- [ ] **Step 4: 成功・停止・未判定を記録する。** 既存14/16、negative、予算、性能のいずれかが変われば第一案不採用として設計へ戻る。新規画像の正式bounds確認が未完了なら、実装検証が通っても採用未判定とする。人間の確認を代行した記録を作らない。

- [ ] **Step 5: レビュー用にまとめる。** 変更範囲・検証結果・残件を報告し、実装全体をレビューへ渡す。署名コミットが未完了ならその状態を併記する。採用ADR更新やIssue #7開始はこの計画では実行しない。

## 計画の自己確認

修正前の全25件と出所hashはTask 0、設計の判定条件と計算量はTask 1、経路・APIはTask 2、新規25枚と96ケース・証拠・性能はTask 3、既存行列と独立CLIによる性能採否はTask 4に対応する。Review Focusの5項目は各指定Taskのテストで扱う。正式boundsと人間レビューの未完了をrunnerの成功で埋めず、停止時は次の採用工程を進めない。2026-10-12のレビューP1・P2を反映し、既存テストが性能falseでも通る点と、inventoryに実行コードhashがない点を補った。

実行方法はこのセッションで順に実装するNativeを推奨する。5Taskはbaseline・判定型・終端状態・検証結果に依存し、途中の停止条件も共有するため。計画のレビューと実行方法の選択後に実装を開始する。
