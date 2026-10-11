# Issue #6 実画面の収録チェックリスト

対象は [Trust Me, I Nailed It（公式Steamページ）](https://store.steampowered.com/app/4311000/_/)。2026-10-11にリポジトリ所有者から対象URLの提示を受けた。公式ストアの開発元は Team Afternoon、パブリッシャーは Jungle Game Lab、最低動作環境は Windows 10。ストアの無料配布という情報だけでは、画像のfixture公開・再配布の許諾を確認したことにはしない。

## 収録前に記録するもの

- 撮影者、撮影日時、ゲームのbuild/version、OS、画面解像度、表示倍率、テーマ・scanline設定、撮影方法。
- 画像をリポジトリで公開し、認識開発・評価へ使えることを確認した利用条件のURL、条項、確認日、または許諾の記録。確認前のmanifestは `rights` と `publication` を `pending` に保つ。
- 独立したゲーム開始・盤面と撮影系列を追えるメモ。同じ盤面やゲーム進行の画像、crop、設定変更、変換画像は同じ `family` と `group` にまとめる。
- splitは認識結果を見る前に決める。既存4画像はregressionのままとし、新規group数に算入しない。

## 最低収録表

| split / kind | groupの仮ID | 必要な元画像の被覆 |
| --- | --- | --- |
| train / positive | train-positive-01〜06 | 各ラベル10セル以上・3group以上 |
| calibration / positive | calibration-positive-01〜03 | 同上 |
| evaluation / positive | evaluation-positive-01〜03 | 同上 |
| calibration / negative | calibration-negative-01〜03 | 人手で確認した未知セル合計30以上 |
| evaluation / negative | evaluation-negative-01〜03 | 同上 |

positiveは30列×16行、ラベルは `# . F 1 2 3 4 5 6 7 8`。各positive splitでscanline付き6／なし6をそれぞれ3group以上含める。希少な7・8も実画面から収録する。最低12positive groupで被覆が足りなければ追加する。

scanline設定を変えた同じ盤面は同一group。特にcalibrationとevaluationを3groupだけで構成する場合、各groupに両条件の実画面が必要になる。同じセルの再撮影や派生画像でセル数を水増しせず、被覆の独立性も人手で確認する。negativeには未知テーマや終局表示などを含め、positiveとは別groupにする。

## 元画像からレビューまで

1. 実画面を元の解像度で保存する。新規画像はPNGを推奨し、撮影後の拡大縮小・scanline合成・JPEG変換は行わない。撮影履歴と元画像のSHA-256を保存する。
2. 人手で盤面ラベルと盤面boundsを記録する。negativeの未知セルは `?`、gridを定義できない場合のboundsは `null`。認識結果に合わせてtruthや期待stageを変更しない。
3. 2名の人間が元画像とtruthを独立に確認し、確認者名と確認したtruthのSHA-256を記録する。6の全位置を確認して `scanline6Indices` を埋める。
4. manifestへ出典・撮影条件・許諾・group/family・split・レビューを登録する。新positiveの全4ケースは `grid-required`、negativeは `reject-or-review`。
5. キュレーターが `npm run --silent fixtures:audit` を実行し、不足を埋める。audit通過後もfixture構成レビューが必要。
6. `npm run --silent fixtures:derive -- chromium` でsourceと3変換の正式行列を保存し、全ケースのgrid契約を検証する。Firefox/WebKitの変換は参考結果として別に保存する。変換再現性の成功だけで認識成功とは扱わない。

evaluation truthはキュレーター側で管理し、#7のモデル担当者には特徴・係数・閾値・manifest・成果物hashの凍結まで開封させない。公開前の受け渡しと開封履歴を記録する。詳細なschemaと運用は[fixture管理仕様](recognition-fixtures.md)を参照。

## 現在不足している情報

追加撮影に使えるWindows環境、画像公開の利用条件・許諾、既存4画像の撮影履歴、収録担当者と2名のtruth確認者は未確認。新規実画面はまだ追加していない。
