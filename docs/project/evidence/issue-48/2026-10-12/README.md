# Issue #48: Chromium出力転送の計測と改善

対象: [Issue #48](https://github.com/KKishikawa/minesweeper-slv/issues/48)。変更前は `7b17af1`、Node v22.12.0 / macOS arm64 / Playwright Chromium 156.0.8078.4。依存関係・入力・64 KiBのチャンクサイズ・ブラウザー起動回数・SHA-256計算・120秒のタイムアウトは変更していない。

## 遅延箇所

3ケースのうち正式画像2ケースの出力は各2560×1440×4 = 14,745,600バイト。unitを含め451チャンクを順番に取得する。変更前は `Array.from` の数値配列をPlaywrightへ返し、各バイトが個別のプロトコル値としてシリアライズされる。変更後は同じバイト範囲をBase64文字列として取得し、Nodeでデコードして長さを確認してからハッシュへ渡す。

| 反復 | 全体: 前 / 後 (秒) | 出力取得RPC合計: 前 / 後 (秒) | 入力転送・処理RPC合計: 前 / 後 (秒) |
| --- | --- | --- | --- |
| 1 | 53.859 / 3.107 | 51.103 / 0.660 | 0.839 / 0.810 |
| 2 | 54.277 / 3.044 | 51.802 / 0.656 | 0.831 / 0.807 |
| 3 | 54.387 / 3.105 | 51.914 / 0.685 | 0.835 / 0.815 |

全体の中央値は54.277秒→3.105秒（94.28%短縮）。変更前は出力取得RPCが全体の約95%を占める。起動4回の合計は0.324〜0.441秒、画像派生生成RPCは0.805〜0.854秒だった。後も起動回数4・派生生成1・入力処理3・出力取得451で一致する。各ケースの出力寸法と期待/実際のハッシュは前後6評価すべて一致し、unitの返却バイト比較も成功した。

RPC時間はブラウザー内処理・待機・シリアライズ・転送・Node側デシリアライズを含む。純粋な通信時間ではなく、ハッシュ計算自体もこのRPC合計には含めない。[既存の詳細CPU調査](../../ci-performance/2026-10-10/profile.md)では、ブラウザー内リサンプリング0.138秒に対して出力取得・ハッシュ54.005秒、Playwright core匿名関数のCPU selfが41.939秒、GCが6.566秒だった。今回の同じ451回のRPCでの比較と併せ、数値配列のシリアライズ経路が通常時の支配的なコストであると判断した。

## 測定方法と限界

同じプロセス内で3回逐次実行する計測を、変更前・変更後それぞれ起動した。タイマーでPlaywrightのlaunch/newPage/evaluate/closeを囲むだけで、認識・リサンプリングや検証結果は置換しない。出力先だけを引数で指定し、同じ計測スクリプトを使う。各評価で入力派生を作り直し、各ケースで新しいブラウザーを起動する。

計測スクリプトは [profile.ts.txt](profile.ts.txt)、生結果は [local-before.json](local-before.json) / [local-after.json](local-after.json)、環境と証拠ファイルのSHA-256は [local-metadata.json](local-metadata.json) に保存した。再現時はスクリプトを `test/artifacts/issue-48/profile.ts` にコピーし、`npx --no-install tsx test/artifacts/issue-48/profile.ts ./after.json` を実行する。前を再現する場合は変更前の評価器を使う。

順序は前3回→後3回で、ランダム化した交互実行ではない。macOSの結果をUbuntuの絶対時間へ換算しない。変更前の2・3回目の実行中に、小さなユニットテストとファイル編集を行った。重いブラウザーテスト・全体テストとは並行していない。

[元の失敗](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38243018755/attempts/1)では120.084秒でタイムアウトし、[同一コミットの再実行](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38243018755/attempts/2)は63.211秒、[ベースCI](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38152010773)は66.200秒だった。過去の失敗時には段階計測・CPU/GC・ホスト負荷の記録がないため、なぜその実行だけ2倍程度遅かったかは特定できない。PR #43による処理変更が原因だとは判断しない。今回の改善は測定で確認した高コストな転送経路を削減するもので、過去のランナー変動原因を確定するものではない。

## 維持した検証と今後の診断

- unit / 30 / 50ピクセルの3入力とNode・Chromiumの独立したリサンプリング。
- 全出力バイトを固定順・64 KiBずつ取得し、デコード後のチャンク長を検証してSHA-256を計算。
- 出力寸法、SHA-256、unitの返却バイト一致。
- 既存の数値配列チャンクの順序・欠落拒否に加え、Base64の高位バイト・端数チャンク・欠落拒否を検証。
- `browser-grid-fallback` の入力保持・3反復・全アサーション。

評価器は段階ごとの所要時間と成功/失敗を任意コールバックへ通知する。ブラウザー内のリサンプリング時間はブラウザーの時計で測り、入力転送・処理RPCの包含値として記録する。これらを足し合わせて全体時間にはしない。`grid-compatibility` のCIテストでは各段階の完了直後にログと既存のCI artifact内 `resample-timings.jsonl` へ保存する。後続の段階がタイムアウトしても既に完了した区間は残る。タイムアウト中の未完了区間の値は存在せず、0として扱わない。

## GitHub Actionsでの検証（10月12〜13日 JST）

[PR #49](https://github.com/KKishikawa/minesweeper-slv/pull/49)の実装コミット `288d9b802c4867424e10f7a5dfb5c53527ba70b4`、PR merge ref `7c9c3a0fbac6e56a7b651a4dd2f6a72c067fba0e` を3回検証した。Ubuntu 24.04 / Node v22.12.0 / Chrome for Testing 156.0.8078.4。全反復でtargetShaとブラウザー版が一致する。

| attempt | 対象テスト (秒) | 出力取得・ハッシュ合計 (秒) | grid-compatibility | CI / quality |
| --- | --- | --- | --- | --- |
| [1](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38245586597/attempts/1) | 4.771 | 1.262 | success (7/7) | success |
| [2](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38245586597/attempts/2) | 4.684 | 1.203 | success (7/7) | success |
| [3](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38245586597/attempts/3) | 4.696 | 1.202 | success (7/7) | success |

初回は全5回帰グループを実行し、すべて成功した。2・3回目は同じrunのgrid-compatibilityジョブと依存するqualityのみ再実行し、他4グループは初回の成功を引き継いだ。全グループを3回実行したという意味ではない。fallbackの全16入力・3反復と、対象ファイルの全6テストも各回成功した。各回のtimings JSONLが既存の `ci-grid-compatibility` artifactへ格納されたことをダウンロードして確認した。

実結果は [actions-summary.json](actions-summary.json)、段階ログは [attempt 1](actions-attempt-1-timings.jsonl) / [attempt 2](actions-attempt-2-timings.jsonl) / [attempt 3](actions-attempt-3-timings.jsonl) に保存した。同名artifactが反復ごとに作られるため、attemptと記録時刻を確認し、summaryにartifact IDも保存する。3回目の取得ではartifact ID `11761407232` を明示した。

初回の純粋なブラウザー内リサンプリングは計0.324秒、Nodeリサンプリング・ハッシュは計0.437秒、正式入力生成は1.278秒。RPCの包含区間とこれらの時間を重複して合算しない。変更前のCIは過去の別ランナーなので、ローカル同条件比較とは区別する。変更後の3回が120秒の制限を十分下回ったことは確認できるが、将来の任意のランナー変動を保証する結果ではない。

## ローカル検証

Base64正常系と欠落拒否の追加テストは変更前に失敗し、変更後に成功した。計測コールバックの通知テストも未実装時の失敗を確認した。独立レビューで見つかった「起動成功後の計測通知例外でブラウザーが閉じられない」経路は、実際の接続状態を確認するテストを先に失敗させてから、通知前にブラウザー所有権を保持する構造へ修正した。対象ファイルは6テストすべて成功。型検査と本番ビルドも成功した。上の性能測定はこの終了処理修正を加える前の候補であり、全体回帰とCIは最終コードで検証する。

`npm test` の全体回帰は62ファイル / 566テスト成功（390.47秒、exit 0）。
