# Issue #6 基盤検証（2026-10-11）

これは既存回帰画像4枚の**変換再現性**の証拠。新規独立画面、分類器の精度・性能、採用条件の達成を示さない。fixture構成は未完了で、#7開始停止を維持する。

| エンジン | 区分 | ケース数 | fresh run | 結果 |
| --- | --- | --- | --- | --- |
| [Chromium](chromium-matrix.json) | 正式変換 | 16 | 各3 | pixel hash／寸法／version一致 |
| [Firefox](firefox-matrix.json) | 参考変換 | 16 | 各3 | 同上 |
| [Playwright WebKit](webkit-matrix.json) | 参考変換 | 16 | 各3 | 同上 |

各JSONは生成reportのsnapshotで、環境・manifest・入力と出力のSHA-256・Canvas条件・全runを保存する。manifest hashは3エンジンと[data audit](dataset-audit.json)で一致。生成PNGのバイトhashも保存値と照合した。画像とケースごとのprogressは各reportの `artifactDirectory`（ignoredなローカル証拠ディレクトリ）に保存し、PNGをリポジトリへ追加しない。クローン先では[手順](../../../recognition-fixtures.md)で再生成する。

auditは終了code 2、`next-cell-recognition-blocked`。新規train/calibration/evaluationのpositive・negativeは0groupで、全11ラベル・6のscanlineあり／なし・negative未知セルの条件が未達。既存画像の出典／権利／公開可否・scanline注釈・truth2者確認も未確認。これらを承認済みと推定しない。

失敗経路は、実際のChromiumの1回目を成功させた後、2回目のlaunchだけを失敗注入して検証した。成功済み4ケースのPNG・hash・version・寸法がprogressと部分結果に残り、3runが揃わないため `reproducible: false` となることを確認した。

変更前の全体テストは56ファイル中2ファイル・6テスト失敗（リリース画面5件、診断画面1件）。production buildを作り直した後、対象の6件はすべて通過した。製品コード・テストの条件は変更していない。

新規の被覆・schema・漏洩・hash／path・失敗時証拠保存・変換テスト9件、型検査、production buildは通過。ビルド後の `npm test` は58ファイル・499テストすべて通過（421.09秒、終了code 0）。CI runnerの非0終了を確認する子プロセスの意図的な失敗ログは、親suiteの失敗ではない。通常suiteから除外される歴史的なspike採用条件を合格したとは扱わない。

読み取り専用コードレビューで指摘された後続run失敗時の証拠欠落を修正し、再レビューで追加の指摘なし。本証拠はPR作成前の作業ツリーで取得した。
