# Issue #26: 固定旗と盤面・解析結果のUndo/Redo

2026-10-11の設計変更です。[合意仕様](../superpowers/specs/2026-10-11-trusted-flags-undo-redo-design.md)に基づき、入力旗を確定地雷へ統一し、常時再検討・矛盾時の自動再検討と設定UIを削除しました。利用者は誤旗を閉じたセルへ手動修正するか、「元に戻す」で旗を置く前へ戻します。数字と矛盾しない誤旗は検出できず、その旗を前提とした提案が出ます。

## 旧操作と証跡

[旧Windows確認票](manual-mvp-windows-checklist.md)のW5（再検討方式への切替）とW6（矛盾時の自動再検討）は、新仕様に存在しません。旧W5の3×1・1地雷、列1に0、列2に旗という盤面は固定旗では矛盾のまま停止します。列2を閉じたセルへ手動修正すると列2に安全・列3に地雷を提案できます。旗を置く前の盤面が履歴に残っていればUndoも使えます。

旧W5/W6、#22の表示確認、公開smokeの証跡は当時の仕様に対する歴史資料として内容を変更していません。旗と安全提案が同じセルに併記される旧再検討の表示は、新仕様の合格条件ではありません。過去の合格を今回の履歴UIの合格へ流用しません。

## 履歴の範囲と制限

現在を含む直近100盤面をページ内メモリで保持します。寸法・総地雷数・全セル観測と最後の完了結果・最後の成功結果をsnapshotへ保存し、古いentryを上限で削除します。再読み込みやページ終了で消え、永続保存・履歴一覧はありません。実際の編集・リセット・作成が1操作となり、同じ観測への入力は増やしません。source/uncertainが変わる手動確認は記録します。Undo後の新編集はRedo側を破棄し、再解析だけでは増加・破棄しません。

復元したentryに成功結果があれば優先し、なければ保存済み完了状態を表示します。同じ盤面の再解析が失敗しても最後の成功結果は残り、そのentryを離れて戻ると復元できます。解析中・失敗時の現在盤面に過去の提案を重ねず、別盤面の結果も表示しません。保存結果の復元ではWorkerを起動しません。結果のない未完了entryだけ検証・新解析します。復元でもrevisionを進め、requestIdを巻き戻さず古い応答を拒否します。

ボタンはTabとEnter/Spaceで操作し、独自Undoショートカットは追加しません。実際にUndo/Redoで履歴を移動したときは、同じ設定でも盤面設定formを復元先へ同期し、入力エラーとaria-invalidも解除します。通常の再描画・解析応答・セル編集と、移動先がない履歴操作では未送信値を保ちます。履歴は探索量・性能改善を保証しません。200,000ノード・Worker待機5秒の予算と、地雷提案の一括旗反映を追加しない方針は維持します。

編集履歴と[診断履歴](solver-diagnostics.md)は独立です。保存結果の復元は診断entryを作らず、実行中Undoは通常のcancelledとなり、実際の新解析のみ記録します。schemaVersion 1の診断metadataはtrusted/trusted/falseへ固定しました。旧effectivePolicy: reconsideredのreplayは理由を示して拒否し、元のbuild commitの旧版で再実行する必要があります。trustedへの読み替えはしません。

## 検証の記録と未完了事項

**変更途中の過去結果:** 固定旗変更だけを完了したTask 1（署名付きcommit `bd40183a9e5d720c59bdb3394983d7aaef464b8f`）では、型検査・build・product 29 files / 258 tests、および全体56 files / 491 testsが成功しました。この実行は履歴・UI追加前、Chromium起動が許可されていた環境の結果です。491件成功を現在のUndo/Redoの検証成功とは扱いません。

**最終フォーム同期修正前の全体検証:** 2026-10-11、履歴とUIを含むコードでtypecheck → build → npm testを各1回実行しました。下表は同設定のUndo/Redoでformを明示同期する最終修正前の値です。

| 検証 | 実際の結果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0、Vite 19 modules、36ms |
| `npm test` | exit 1、21 failed / 37 passed files（58）、9 failed / 447 passed / 59 skipped tests（515）、54.45s |
| `git diff --check` | exit 0 |

この全体テストはChromium起動時の`bootstrap_check_in ... Permission denied (1100)`、`kill EPERM`で失敗しました。generated-bankの2件も起動エラーが期待するNoPassingThresholdErrorに代わったため失敗しています。CI-runner回帰が意図的に実行するnested child assertionの失敗は、外側の集計と区別します。testのskip指定や権限回避は追加していません。

Task 2・3のfocused実行ではstate/historyの2 files / 25 testsが成功しています。新しい`test/app/board-history.test.ts`と`test/browser/history.test.ts`は既存の`classifyTest`規則でproductへ分類されます。ただし当初の新UI6件と遅延応答後のform draft検証を含むbrowser assertionsはsuite setupで未実行です。1920×1080・960×1080の新UI目視確認も未実施で、GUI fallbackはOrca.appのpathを解決できず停止しました。実画面の合格を示すレビュー証拠はありません。

**最終フォーム同期修正後の限定検証:** 同設定のUndo/Redoで草稿・入力エラーが残る不具合を、実際のstate transition・solver・settings処理と最小DOM stubを使う`test/ui/board-settings.test.ts`で再現しました。修正前は8 failed / 5 passed、修正後は同test13件とstate/history25件の3 files / 38 testsが成功しました。`npm run typecheck`、`npm run build`（19 modules、49ms）、`git diff --check`もexit 0です。ブラウザー側には保存結果あり／未完了の同設定復元2件と異寸法復元時のエラー解除assertionを追加しましたが、修正後のbrowser/full suiteは既知の制約下で再実行していません。このDOM境界検証は実ブラウザーの操作・レイアウト検証の代替ではありません。

前回セッション終了時点では、実装・文書と静的整合性の確認は済んでいましたが、Chromiumを起動できる許可された環境での全体テストと新UIの実画面確認を残します。Git metadataが書込み許可範囲外にあるため、Task 2のstageはindex.lock作成時にOperation not permittedで停止しました。Task 2–4は未コミットです。既知の拒否を再試行せず、署名設定も無効化・変更していません。公開は行っていません。

ローカル実行ログ: `/private/tmp/minesweeper-task4-typecheck.log`、`/private/tmp/minesweeper-task4-build.log`、`/private/tmp/minesweeper-task4-full-tests.log`。これらは当該実行環境の証跡で、リポジトリへ保存済みの履歴資料とは別です。

## 再開セッションでの検証（2026-10-11）

権限制約のない現在の環境で、最終フォーム同期修正を含むコードに対して型検査・buildを実行し、どちらもexit 0となりました。Chromiumの起動も成功しています。

Playwright CLIによる実画面操作では、3×1・1地雷の盤面に左0を入力し、安全・地雷提案を確認した後、Undo/Redoで保存された提案と設定値が復元されることを確認しました。1920×1080と960×1080で履歴ボタン、100盤面の保持説明、保存結果の案内、固定旗の制限説明を目視確認し、文字の重なり・切れはありませんでした。初期9×9盤面では下部へページスクロールして履歴説明を読む配置です。コンソールで観測したエラーはdev serverのfavicon.ico 404のみです。

画面証跡はローカルの `test/artifacts/policy-ux-resumed/playwright/history-restored-1920.png` と `history-restored-960.png` に保持しています（Git対象外）。

Task 2とTask 3をそれぞれ `20af77d`、`10e807f` にコミットしました。既存の `commit.gpgsign=true` / `gpg.format=ssh` を維持し、どちらにもSSH署名が含まれています。この環境には `gpg.ssh.allowedSignersFile` が未設定のため、Gitによる署名者の信頼検証は行えていません。署名設定を変更していません。公開・merge・pushは行っていません。

全体検証 `npm test` はexit 0、59 files / 530 tests passed、404.53秒でした。新規history browser tests 8件、設定同期DOM境界tests 13件、遅延応答中のform草稿保持を含みます。CI-runner回帰が意図的に失敗させるnested child assertionは外側のテストで正常に検証されており、全体の失敗ではありません。ログは `/tmp/policy-ux-resumed-tests.log` とローカル証跡 `test/artifacts/policy-ux-resumed/full-tests.log` に保持しています。

現在のコードに対する型検査・build・全体テスト・両幅の画面確認・差分検査を完了し、前回のブラウザー起動とGit書込みの制約は解消しました。実装前のbrowser assertion REDは過去の環境制約で観測できなかったため、その履歴上の未実施は保持します。現在の合格は前回や公開版の結果から流用していません。
