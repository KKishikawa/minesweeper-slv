# Trusted Flags and Snapshot Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 旗を確定地雷として固定し、過去の盤面と保存済み解析結果へUndo/Redoで戻れるようにする。

**Architecture:** solverから旗policy選択を取り除く。immutableな盤面・解析結果の履歴を純粋関数で管理し、app stateが編集・解析応答・Undo/Redoを統合する。履歴の復元とWorker実行IDは分離し、画面は復元された盤面・結果と設定値を同期する。

**Tech Stack:** TypeScript、Vite、Vitest、Playwright Chromium。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-10-11-trusted-flags-undo-redo-design.md`

## Global Constraints

- 現在を含む直近100盤面をページ内メモリで保持する。永続保存・履歴一覧を追加しない。
- 旗は確定地雷として固定する。常時再検討と矛盾時の自動再検討を削除する。
- 地雷提案の一括旗反映、探索予算の変更、独自Undo keyboard shortcutを追加しない。
- revision/requestIdは復元時も単調増加する。古い応答を拒否する。
- 保存済み解析結果の復元ではWorkerを起動しない。未完了で結果のないentryだけ新解析する。
- 旧実機証跡を変更せず、新仕様の合格へ流用しない。Gitの既存署名設定を維持する。

## Review Focus

1. 再解析で失敗した同一盤面へ戻る場合も、以前の成功結果を復元する（Task 2）。
2. 解析中の高速Undo/Redoで古い応答が復元結果を上書きしない（Task 2・3）。
3. 盤面作成formへ未送信の値を入力中に解析が完了しても、その値を消さない（Task 3）。
4. 同じ値への入力は履歴を増やさず、uncertainセルの手動確認は記録する（Task 2）。
5. 旧reconsidered診断をtrustedとして誤再現せず、理由を付けて拒否する（Task 1）。

---

### Task 1: 旗の意味と解析を固定方式へ統一する

**Files:**
- Modify: `src/board/types.ts`, `src/board/validate.ts`, `src/solver/types.ts`, `src/solver/constraints.ts`, `src/solver/solve.ts`
- Modify: `src/workers/protocol.ts`, `src/workers/solver.worker.ts`, `src/app/state.ts`, `src/app/solver-client.ts`, `src/app/diagnostic-history.ts`, `scripts/solver/replay.ts`
- Modify: `src/app/app.ts`, `src/app/style.css`, `src/ui/board-legend.ts`
- Test: `test/board/validate.test.ts`, `test/solver/constraints.test.ts`, `test/solver/solve.test.ts`, `test/solver/oracle.ts`, `test/solver/replay.test.ts`
- Test: `test/app/state.test.ts`, `test/app/solver-client.test.ts`, `test/app/diagnostic-history.test.ts`, `test/app/solver-diagnostics.test.ts`
- Update consumers: `test/browser/{app.fixture,editor.fixture}.ts`, `test/browser/{board-editor,diagnostics,input-stability,legend,mvp,release,solver-worker}.test.ts`

**Interfaces:**
- Produces: `validateBoard(board: BoardSnapshot): ValidationResult`, `buildConstraints(board: BoardSnapshot): Constraint[]`, `solve(board: BoardSnapshot, options: SolveOptions, observe?: (statistics: SolverStatistics) => void): SolveResult`。
- Produces: `SolverRequest`はpolicyを持たない。`AppState`からpolicy/autoReconsider/effectivePolicy、`AppAction`からsettings-changedを削除する。
- Produces: `createDiagnosticHistory().start(request: SolverRequest, context: { timeoutMs?: number }): void`。exportのpolicy/effectivePolicyはliteral trusted、autoReconsiderはliteral false。

- [x] **Step 1: 固定旗と旧診断拒否のtestsを先に書く。** 3×1・1地雷、左0・中央旗はinconsistent。中央1・左旗は右safeで入力旗は維持。policy引数なしでoracle比較する。旧reconsidered診断のreplayは旧buildでの再実行が必要だとthrowする。
- [x] **Step 2: `npx vitest run test/board/validate.test.ts test/solver/solve.test.ts test/solver/replay.test.ts`で失敗を確認する。** 新API・拒否理由による失敗であることを読む。
- [x] **Step 3: 上記APIを実装する。** FlagPolicyとreconsidered分岐を削除し、全callerを更新する。Workerはpolicy付き旧requestを拒否し、新requestだけを受け付ける。solver-clientは入力旗への提案を常に拒否する。trusted診断をreplayし、reconsidered診断だけ明示拒否する。
- [x] **Step 4: 画面と既存testsを新仕様へ更新する。** policy controls/effective-policyを削除する。旗固定の制限を説明し、再検討用の凡例併記例を取り除く。既存の旗表示・選択枠検証は固定旗の表示検証として維持する。
- [x] **Step 5: `npm run typecheck`と`CI_TEST_GROUP=product npm test`を実行する。** 型検査とproduct groupの全tests成功を確認する。
- [x] **Step 6: 関連src/scripts/testをstageし、署名付き設定のまま`git commit -m "refactor: treat input flags as fixed mines"`する。**

### Task 2: スナップショット履歴と状態遷移

**Files:**
- Create: `src/app/board-history.ts`
- Modify: `src/app/state.ts`
- Test: `test/app/board-history.test.ts`, `test/app/state.test.ts`

**Interfaces:**
- Consumes: Task 1の固定旗validation・Worker request。
- Produces: `HistoryResult`はterminal phase、validation、proposal、message、limitReasonを持つ。`HistoryEntry`はboard snapshot、最後の完了結果`result`、最後の成功結果`lastSuccess`を持つ。`BoardHistory`はreadonly entriesとcursorを持つ。
- Produces: `createBoardHistory(board: BoardSnapshot): BoardHistory`, `appendBoardHistory(history: BoardHistory, board: BoardSnapshot): BoardHistory`, `recordHistoryResult(history: BoardHistory, result: HistoryResult): BoardHistory`, `moveBoardHistory(history: BoardHistory, offset: -1 | 1): BoardHistory`, `restorableHistoryResult(entry: HistoryEntry): HistoryResult | null`。
- Produces: `AppState.history: BoardHistory`, `AppState.restoredResult: boolean`。`AppAction`に`{ type: 'undo' } | { type: 'redo' }`を追加する。既存のtransition/effectsの形は維持する。

- [x] **Step 1: snapshot履歴testsを先に書く。** 100entry上限、両端のno-op、Undo後のappendによるRedo破棄、結果記録はentryを増やさない、board/proposal配列の後からの変更が他entryを変えないことをassertする。
- [x] **Step 2: `npx vitest run test/app/board-history.test.ts`で未実装による失敗を確認する。**
- [x] **Step 3: 履歴の純粋関数を実装する。** appendでcursorより後を破棄し、最大100entryを保持する。terminal結果と成功結果を独立に保持し、復元結果はlastSuccessを優先する。board.revisionは復元IDに使わない。
- [x] **Step 4: 状態遷移testsを先に書く。** solved盤面A→編集B→limit→UndoでAとproposalを復元しeffectsはcancelのみ。RedoでBのlimitを復元。同一盤面の再解析失敗後も、離れて戻ると以前の成功結果を復元。未完了entryは新requestで解析する。
- [x] **Step 5: 同testsへ高速編集・no-op・上限testsを追加する。** Undo中の古い応答拒否、revision/requestId単調増加、MAX_SAFE_INTEGERの復元拒否、uncertain→手動確定は履歴記録、同じ観測はno-op、リセット・寸法変更・再解析後Redo維持をassertする。
- [x] **Step 6: `npx vitest run test/app/state.test.ts`で新testsの失敗を確認する。**
- [x] **Step 7: transitionへ履歴を統合する。** 編集前の結果を保持し、responseは現在entryのみ更新する。復元ではcancelを発行し、成功／terminal結果を新revisionの盤面へ復元する。結果なしのentryのみstartする。snapshotへ実行中IDを含めない。
- [x] **Step 8: `npx vitest run test/app/board-history.test.ts test/app/state.test.ts`と`npm run typecheck`を実行する。** 全成功を確認する。
- [x] **Step 9: 上記filesをstageし、`git commit -m "feat: preserve board and analysis snapshots for undo redo"`する。**

### Task 3: 履歴操作UIと設定値・解析結果の復元

**Files:**
- Modify: `src/app/app.ts`, `src/app/style.css`, `src/ui/board-settings.ts`
- Modify: `test/browser/app.fixture.ts`
- Create: `test/browser/history.test.ts`
- Update: `test/browser/input-stability.test.ts`
- Create: `test/ui/board-settings.test.ts`（最終レビューでの同設定復元回帰）

**Interfaces:**
- Consumes: Task 2のhistory.cursor/entries、undo/redo actions、restoredResult。
- Produces: `mountBoardSettings()`の返り値へ`update(board: BoardSnapshot, forceSync?: boolean): void`を追加する。盤面寸法・総地雷数の変更時と、実際にcursorが移動したUndo/Redoでformを同期し、入力エラー・aria-invalidを解除する。同一設定への復元でも明示同期する。通常renderとno-opの履歴操作は未送信値を上書きしない。
- Produces: 「元に戻す」「やり直す」buttons、履歴保持範囲と復元結果の説明。新しい独自keyboard shortcutはない。

- [x] **Step 1: browser testsを先に書く。** 初期disabled、数字編集→safe/mine提案→fixtureで制御したlimit→Undoで数字・提案復元、Redoでlimit復元。Worker実行回数が復元では増えないことをfixtureで計測する。
- [x] **Step 2: browser testsへ設定と操作のケースを追加する。** 盤面作成のUndoで寸法・form・cellsが一致、リセットUndo、Undo後の編集でRedo disabled、Tab/Enterによる操作、未送信form値は遅延responseで消えないことをassertする。
- [ ] **Step 3: `npx vitest run test/browser/history.test.ts`でbutton未実装等の失敗を確認する。**
- [x] **Step 4: buttonとform updateを実装する。** renderでdisabledをhistoryから決定する。復元結果とlimit時の案内を表示する。通常の設定同期は直前の盤面設定との比較で限定し、実際のUndo/Redoでは同設定でも明示同期する。履歴controlsのfocusと狭い幅の配置を維持する。
- [x] **Step 5: `npx vitest run test/browser/history.test.ts test/browser/input-stability.test.ts test/browser/mvp.test.ts test/browser/release.test.ts`を実行する。** 全成功を確認する。Chromiumの実画面を1920×1080と960×1080で確認し、controls・説明が読めることを確かめる。
- [x] **Step 6: 上記filesをstageし、`git commit -m "feat: add undo redo controls and restore saved analysis"`する。**

### Task 4: 説明更新と全体検証

**Files:**
- Modify: `README.md`, `docs/project/product.md`, `docs/project/privacy.md`, `docs/project/solver-diagnostics.md`
- Create: `docs/project/issue-26-trusted-flags-history.md`

**Interfaces:**
- Consumes: Task 1–3の実装と実際の検証結果。変更前の実機証跡は歴史資料として保持する。
- Produces: 固定旗の制限、削除した機能と代替、100snapshotのメモリ保持・消去、診断との違い、実施した検証の記録。

- [x] **Step 1: 製品・保持・診断説明を実装に合わせる。** 「旗を閉じたセルへ手動修正／Undo」で失われる再検討経路を代替することを記載する。旧W5/W6の操作が新仕様に存在しないことをIssue 26記録で明示する。
- [x] **Step 2: `npm run typecheck`、`npm test`、`npm run build`を実行する。** 全成功と件数を記録する。新testsは既存CI分類でproductへ入ることを確認する。
- [x] **Step 3: `git diff --check`と変更全体のレビューを行う。** runtimeに再検討分岐が残らず、履歴結果が一致する盤面にだけ表示されること、取消し・未完了・診断の境界をspecと照合する。`reconsidered`の残存は旧診断拒否・歴史説明・testsだけとする。
- [x] **Step 4: 証跡と文書をstageし、`git commit -m "docs: describe trusted flags and snapshot history"`する。** 署名失敗時は設定を変えず調査・報告する。

## 実行方式

利用者は計画を確認し、subagent-driven-development方式を選択した。各Taskの実装担当とレビュー担当を分け、依存順に実装・レビューしている。

2026-10-11の実行状態: Task 1は署名付きcommit `bd40183`と当時の全体491件成功まで完了。Task 2はfocused 25件・型検査・build成功、Task 3は実装と静的レビューが完了した。Task 3 Step 3は実行したがChromiumのsuite setupが拒否され、button未実装によるassertion REDを観測していないため未チェックとする。Step 5のbrowser成功・1920×1080/960×1080目視確認も未確認。

Task 4の型検査・build・全体テストは各1回実行した。型検査・buildは成功、全体は21 failed / 37 passed files、9 failed / 447 passed / 59 skipped tests（54.45s）。Chromium bootstrap Permission denied (1100)とkill EPERMによる失敗であり、全成功を確認するStep 2は未チェックとする。新testsが既存product分類へ入ることは確認済み。diff-checkと静的整合性確認は完了。詳細は[Issue #26記録](../../project/issue-26-trusted-flags-history.md)。

最終レビューの修正: 「設定変更時だけ同期」というTask 3の旧実装方針を、上位仕様の「同設定でも実際のUndo/Redoでは同期」に訂正した。DOM境界回帰13件（修正前8 failed / 5 passed）を追加し、修正後は新規13件とstate/history25件の合計38件、型検査、build、diff-checkが成功した。この修正後にbrowser/full suiteと実画面は再実行していない。既知の環境制約と未チェック項目は残る。

Task 2のgit addは外部Git metadataのindex.lock作成がOperation not permittedで停止。Task 2 Step 9、Task 3 Step 6、Task 4 Step 4は未完了。既知のblocked stage/commitを再試行せず、既存の署名設定を維持する。旧証跡を変更せず、過去の491件成功を現在の履歴UI合格へ流用しない。

## 再開後の完了記録（2026-10-11）

現在の環境でtypecheckとbuildがexit 0、全体 `npm test` が59 files / 530 tests passed（404.53秒）となった。Task 3 Step 5の対象browser testsも全体実行に含めて成功し、Playwrightによる1920×1080・960×1080の実画面操作と目視確認を完了。Task 3 Step 3の実装前browser REDは当時の起動制約で観測できなかった履歴として未チェックを保持する。後からREDを実施したとは扱わない。

Task 2は `20af77d`、Task 3は `10e807f` に既存SSH署名設定でコミット済み。Task 4は本記録と検証文書を含む文書コミットで完了する。Git書込み制約は解消し、SSH署名の存在も確認した。allowedSignersFileが未設定のため署名者の信頼検証は未実施。署名設定を変更していない。merge・push・公開は行っていない。詳細・ローカル証跡は[Issue #26記録](../../project/issue-26-trusted-flags-history.md)を参照。
