# Grid location safety 設計実験の停止記録

2026-10-12。承認済み設計の Task 2 を試験的に統合した結果、既存成功ケースを棄却したため停止した。製品経路への統合は修正前スナップショットへ復元済み。Task 1 の独立した安全性判定 helper と32テスト、Task 0 の修正前測定ツールと7テストは維持している。安全性改善の採用・完了は主張しない。

## 実験結果

RED: `npx vitest run test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts` は終了コード1、53成功・新規3失敗。direct/canonical の終端 stage と、5pxずれ・高支持・低scoreの元画像候補の棄却を確認するテストだった。

統合後: `npx vitest run test/recognition/grid-location-safety.test.ts test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-budget.test.ts test/recognition/grid-evidence.test.ts test/recognition/grid-resample.test.ts` は終了コード1、109成功・既存3失敗。新規3テストは成功したが、次の既存テストで geometry が `null` になった。

- `finds every source board without file-specific coordinates`
- `tiles exactly 480 non-overlapping cells`
- `detects every deterministic derivative`（`0/source`）

fixture 0 の同一画像について、修正前 strict は `found`、bounds `{x:645,y:381,width:1201,height:641}` を返した。統合候補は `safety-rejected`、refined pair 数2240。修正前の最終geometry端点を使用した判定結果は `competing-location`、candidate index 0、最大対応境界差42px、交点支持率0.9411764705882353、最小外周エネルギー比2.5670160623758993。異常データによる棄却ではなく、設計の競合判定が既存成功を棄却した証拠である。

閾値、score条件、既存期待値、truth、manifestを調整して通していない。実験候補をそのまま保存した後、指定4ファイルだけを復元した。画像のGit登録やコミットは行っていない。

## 未完了・未実施

実験候補の型検査には、新stageを扱わない評価runnerの `DirectStatus` と、`rejected` と `safety-rejected` を併記したunionに対する既存 `Extract` が `never` になる新規エラーがあった。既存ローカル調査artifactの `diagnostics` エラーも併記して保存した。停止後に実験候補を修正していない。

direct の最終端点に対する専用5px競合テスト、canonical列の差が4px以内でも実返却端点差が5pxになるテスト、実mapped候補によるsurvivor統合テストは未完了。既存operationテストの0・複数survivor、8候補上限と、negative・budget・resample/provenanceの限定テストは統合実行に含まれた。

停止後の正式Chromium既存16ケース、新規3誤位置元画像の回帰判定、新規24画像×4変換の96 Canvasケース、性能測定は **NOT RUN**。Task 3/4へ進めていない。正式boundsの確認や新規画像の採用条件を満たした扱いにしない。

## 修正前25件の凍結証拠

Task 0 のローカルbaselineは25件を保持し、元画像・RGBA・コードのhashを記録した。30×16が24件、16×16の参考ケースが1件。stageは direct 9 / fallback 1 / budget-exhausted 1 / hint-rejected 11 / source-revalidation-rejected 3。

[`source-before.json`](../../../../../test/artifacts/grid-location-safety/source-before.json) のSHA-256を復元後にも確認した：

`d7df37f7d1df414aa484bd0b42ced03faa3ff19e9167837cde6b4f66e9cd8b5a`

baselineは未変更。Task 1 helper追加前の製品コードで測定した証拠であり、現在のコードhashとの同一性や正位置・採用を意味しない。

## 復元後の検証

`npx vitest run test/recognition/grid.test.ts test/recognition/grid-fallback.test.ts test/recognition/grid-location-safety.test.ts test/recognition/capture-grid-location-baseline.test.ts`：終了コード0、4ファイル・92テスト成功。内訳は既存grid26、既存fallback27、Task 1 safety32、Task 0 baseline7。全499件のsuiteは実行していない。

`npx tsc --noEmit -p .superpowers/sdd/2026-10-12-grid-location-safety/task-2-scoped-tsconfig.json`：終了コード0。元tsconfigをextendsし、includeを同じ対象へ解決、除外は無視対象 `test/artifacts` のみ。製品tsconfigは変更していない。`git diff --check` も終了コード0。

指定4ファイルは `.superpowers/sdd/2026-10-12-grid-location-safety/task-2-before/` とバイト単位で一致した。SHA-256：

| ファイル | 復元前snapshotと一致したhash |
| --- | --- |
| src/recognition/grid-strict.ts | `5db5ea073c7f7113ebd18a9802bbe1985ae8a3d7a17f290746e76b50138a7e03` |
| src/recognition/grid-fallback.ts | `8205f15d4dd756e699d5f15665319446b9ce050f309a1907bdd69a936dd86413` |
| test/recognition/grid.test.ts | `03d73cc62d87d43a936f5ece657d9f28cd1cd02612d2a1a7a44e44f772d0ddd4` |
| test/recognition/grid-fallback.test.ts | `e3ba3c4b320829dd7781b58bb4299ac2e34bfa8e9b4f0717a59cba4f0b14f08e` |

## ローカル証拠

以下はGit無視対象のローカル証拠であり、リポジトリ配布物には含まれない。

- [実験報告](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-report.md)
- [保存した候補差分](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-candidate/task-2.patch)（候補4ファイルと評価runnerの未変更コピーも同ディレクトリに保存）
- [REDログ](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-red.log)、[統合失敗ログ](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-integration.log)、[実験型検査ログ](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-typecheck.log)
- [fixture 0 witness](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-witness.json)（診断スクリプトと修正前strictの診断コピーも保存）
- [復元hash](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-restored-hashes.log)、[復元後テスト](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-restored-tests.log)、[復元後型検査](../../../../../.superpowers/sdd/2026-10-12-grid-location-safety/task-2-restored-typecheck.log)

第一案は既存成功を維持する条件に適合しなかった。証拠を保存して設計へ戻り、Issue #7の開始停止を維持する。
