# Actions 実行・失敗・取消の検証（2026-10-10）

固定コード candidate は `1858c4a3d6fb7ca65a5dc1111e2fad9178d36429`。本資料を追加する docs-only commit は測定対象を置き換えない。以下は通常 PR CI と smoke の単発実行であり、固定 A/B/C の性能比較ではない。時刻はすべて UTC、run attempt はすべて 1。

## 実測結果

| 検証 / run | head SHA | workflow created → quality completed (UTC) | regression 結果 | quality / run |
| --- | --- | --- | --- | --- |
| [通常 CI 初回](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38053458314) ([PR36](https://github.com/KKishikawa/minesweeper-slv/pull/36)) | `735c88d1ab13181367076acee393e9a80a1d73e1` | 12:50:43 → 12:54:29 | product failure、他4 success | failure / failure |
| [修正後の通常 CI](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38053904218) (PR36) | `1858c4a3d6fb7ca65a5dc1111e2fad9178d36429` | 12:58:00 → 13:02:14 | 全5 success | success / success |
| [故意 failure](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38054024887) ([smoke PR38](https://github.com/KKishikawa/minesweeper-slv/pull/38)) | `be2d5b8f263f70f50fd0926ff396855e1a634e1f` | 12:59:57 → 13:04:16 | product failure、他4 success | failure / failure |
| [開始後の取消](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38054454567) (PR38) | `a866b9e8f76d588e352f539c72f95f23a2fb0a8b` | 13:06:27 → 13:07:44 | 全5 cancelled | failure / cancelled |

通常 CI 初回は Linux 上の foundation 構成検証で `GITHUB_OUTPUT=/dev/stdout` の子プロセス書込みが ENXIO となった。candidate `1858c4a` は、このテスト出力先を実際の一時ファイルへ修正している。評価実装や workflow はこの修正で変更していない。初回の Vitest 和集合は56 files / 490 tests（489 passed / 1 failed）、修正後は56 files / 490 tests（全 passed）、両方のグループ間ファイル重複は0。

修正後の wall は最初の regression job 開始 12:58:03 → quality 終了 13:02:14 の **251秒**。全6実行 job（5 regression + quality）の `completed_at - started_at` 合計は **15.3833 runner-minutes**。これは API job の setup・upload を含む区間で、workflow 作成前後の待ち時間を含む全体時間ではない。

通常 CI の checkout は PR merge ref（初回 `732379ae3a50d9cc87cf5c1e0c9469271e6dbc16`、修正後 `91ddb717b51067936c6c91ad598dfe131fd94e0e`）であり、candidate 単独の checkout ではない。current main 由来の追加8 files / 32 tests と、既存 `test/browser/solver-worker.test.ts` の追加1 test（2→3）が含まれる。追加ファイルと test 数は `test/app/diagnostic-history.test.ts` (2)、`test/app/solver-diagnostics.test.ts` (4)、`test/browser/diagnostic-failures.test.ts` (3)、`test/browser/diagnostics.test.ts` (1)、`test/browser/input-stability.test.ts` (12)、`test/browser/privacy.test.ts` (2)、`test/solver/diagnostics.test.ts` (2)、`test/solver/replay.test.ts` (6)。既存ファイルの追加 assertion は `receives checkpoints and exact node-exhaustion statistics from the real Worker`。

candidate の最新テスト集合は48 files / 457 tests、PR merge ref の実 JSON は56 files / 490 tests（net +33）。457は旧ローカル group 和集合453に candidate の collector tests 追加4（24→28）を反映した集合上の数であり、candidate 最新版の full 再実行結果ではない。ローカル group JSON と actual JSON の共通ファイルの assertion 差は collector追加4と上記Worker追加1のみ（削除なし）。candidate source は collector修正と foundation の一時出力ファイル修正を含み、collector追加4は current main 由来の差に数えない。根拠 JSON は local `task-5-local-verification.json` / `test/artifacts/ci/*/vitest.json` と `actions-38053904218/ci-*/vitest.json`、照合結果は `actions-testset-correction.json`。

## 故意失敗と取消の scope

smoke は candidate から作成した非共有 branch `ci-quality-smoke` のみで実施。署名 commit `be2d5b8` で product に入る `test/ci/intentional-failure.test.ts` を1 file / 1 test 追加し、PR merge ref `de9634373913a2eb8f3dab431e5d10c353701dd5`（base `ae7ceaa34285b90aac582930c2672b10bb77d283`）で実行した。故意失敗はこの assertion のみで、product は30 files / 258 tests（257 passed / 1 failed）。全グループの和集合は57 files / 491 tests（490 passed / 1 failed）、重複0。

product は13:01:41に失敗したが、他4 job は13:02:15〜13:04:01まで継続してすべて成功した。workflow の `fail-fast: false` と失敗時 artifact 保存を確認した。全5 artifact の `metadata.json`、Vitest JSON、GNU time 生出力を取得済み。quality は13:04:04開始 → 13:04:16 failure。

署名 cleanup commit `a866b9e8` で故意テストを削除し、tree `800701747df45160ff1a7be4120501f7d0634aea` が candidate と一致することを確認した。取消 run の PR merge ref は `f2b535efdba4bec4b6d7e3decea78d87c000a0fd`（同じ base）。5 regression の13:06:30開始を API で確認後、13:07:10.003824 に **run 38054454567 のみ**へ `gh run cancel` を発行。product は13:07:12、他4は13:07:25に cancelled、quality は13:07:28開始 → 13:07:44 failure。PR36/37 の run は取消していない。

取消では product が typecheck 中、他4が regression command 中に停止した。product artifact は存在せず、他4 artifact は空の `max-rss-kib.txt` のみで、metadata と Vitest JSON は存在しない。全5の RSS・テスト成否・テスト集合は **null / 未測定（途中取消による記録欠落）**。空値を0や成功と扱わない。全 regression の cancellation を quality が成功として扱わないことを実証した。

PR38 は13:10:05に closed、`merged=false`。branch は cleanup commit のまま保全し、main へ merge していない。smoke に永続 source/workflow 変更はない。

## Linux RSS

ubuntu-24.04、Node `v22.12.0`、Chrome for Testing `151.0.7922.34`。単位は KiB。

| group | 通常初回 | 通常修正後 | 故意 failure | 取消 |
| --- | ---: | ---: | ---: | --- |
| product | 257900 | 245988 | 253304 | null |
| recognition | 883672 | 873712 | 848500 | null |
| formal | 994256 | 982488 | 993388 | null |
| holdout | 920360 | 920880 | 928632 | null |
| grid-compatibility | 876512 | 866160 | 887040 | null |

RSS は GNU time が記録した Vitest command と待機した子孫の maximum resident set size。全プロセスの同時 RSS 合計や全5 job の合計メモリではない。quality の RSS は計測対象外。完走3 run の全5 group は RSS non-null、取消の全5は上記欠測理由で null。

## 登録と比較の保留

[登録専用 Draft PR37](https://github.com/KKishikawa/minesweeper-slv/pull/37) の既存 serial CI は [run 38053655379](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38053655379)、head `3176ecf770c812da59475a7378f231529d2ef59c`、created 12:53:55、quality 12:53:58 → 13:04:40（642秒）で success。これは既存 CI の配送検証であり、manual benchmark の実行ではない。

main への benchmark 登録 merge と workflow dispatch は承認待ち。固定 A/B/C 各3回、計9 run は未測定。比較指標・historical 755秒との差・改善率は null、改善目標は未判定。上記251秒や serial642秒から改善率を算出しない。

生証拠は `.superpowers/sdd/2026-10-10-ci-recognition-performance/actions-{38053458314,38053904218}/` と `actions-smoke/{38054024887,38054454567}/` に保存（ignored/local）。Actions API の run/jobs/artifact 一覧を保存し、zip は既知 entry の `unzip -p` で読み出した。本 tracked 資料が永続要約であり、外部 run URL を直接確認できる。
