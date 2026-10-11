# 認識評価 fixture の管理（Issue #6）

## 現在の状態

Issue #5 の[承認済み設計](../superpowers/specs/2026-10-11-next-cell-recognition-design.md)に従う管理・被覆検証・Canvas変換の基盤。**新規の独立画面は未収録で、Issue #6 の受け入れ条件はまだ満たさない。#7 は開始不可。** 合成テストデータを正式fixtureへ転用しない。

既存画像 `test/resources/0.png`〜`3.jpg` と `test/recognition/ground-truth/0.json`〜`3.json` は変更しない。[新manifest](../../test/recognition/dataset/manifest.json)はこれらを既知回帰集合として参照し、元ファイルのSHA-256と従来の11 direct／3 fallback／2期待棄却を固定する。撮影系列の独立性が確認されていないため、4画像とも同じ保守的なgroup/familyに置く。旧manifestや旧評価runnerの分割は変更しない。

収録対象は、2026-10-11にリポジトリ所有者から提示された [Trust Me, I Nailed It の公式Steamページ](https://store.steampowered.com/app/4311000/_/)として出典に記録した。既存4画像それぞれの撮影履歴、利用権、公開可否、撮影条件、テーマ、scanline付き6の位置、truthの2者確認は引き続き未確認。権利やレビューの承認を推定して記録しない。現在はこれらも開始停止理由となる。

## 収録と分離

| 集合 | 最低独立group数 | 元画像の被覆 |
| --- | --- | --- |
| train positive | 6 | 全11ラベル各10セル以上・3group以上 |
| calibration positive | 3 | 同上 |
| evaluation positive | 3 | 同上 |
| calibration negative | 3 | 未知セル合計30以上 |
| evaluation negative | 3 | 未知セル合計30以上 |
| regression | 既存4画像 | 上記最低数に算入しない |

positiveは30×16の収録テーマで、closed・empty・flag・1〜8を含む。全positive splitで、scanlineあり6／なし6をそれぞれ3group以上収録する。1画面に両方あれば両条件へ数えられるが、撮り直しや加工から独立groupを作らない。train内のleave-one-group-outで残る訓練集合からラベルが消えないことも確認する。

negativeはpositiveと別のgroup。未収録の終局表示や未知テーマを撮影し、未知セルを人手で注釈する。範囲外のサイズ、テーマ、倍率／圧縮率、回転、遠近、欠けた盤面、地雷・爆発・誤旗をpositive保証へ追加しない。元画像の観測後にpositiveをnegativeや期待棄却へ変更しない。

同じ盤面の再撮影、同じゲーム進行の連続capture、crop・scanline加工・画像変換は同じ `family` と `group` にまとめる。`group` はsplitをまたがない。同じfamilyまたはsource hashを別groupへ登録した場合も検証が失敗する。バイト一致だけでは異なる盤面の独立性は証明できないので、撮影履歴をレビューする。派生画像をsource fixtureとして再登録して最低数を増やさない。

## manifest と truth

manifest `version: 1` のfixtureは以下を記録する。パスはリポジトリルート相対。ルート外やルート外を指すsymlinkは拒否する。

- `id`、`group`、`family`、`split`（regression/train/calibration/evaluation）、`kind`（positive/negative）、`theme`。
- `source` と `truth`: `path` とファイルバイトの `sha256`。
- `provenance`: 実際の出典を `origin`、ライセンス／許諾を `license`、撮影日時・アプリversion・テーマ設定・DPR・画面条件等を `captureConditions` に記録。`rights: confirmed`、`publication: allowed` は確認証拠がある場合だけ設定し、未確認は `pending` とする。
- `reviews`: 2名の独立した人間の確認者を記録し、それぞれ `reviewer` と確認対象の `truthSha256` を持つ。同名の重複や古いhashは2者確認にならない。自動生成器やモデルの出力を人間の確認者に代用しない。
- `scanline6Indices`: scanlineが付いた6のrow-majorセルindex。全6を確認してから該当なしを `[]` と記録する。未確認は `null`。重複・非6へのindexは拒否する。
- `expectedStages`: source／canvas-scale-075／canvas-scale-125／canvas-jpeg-q75の全4ケース。新positiveはすべて `grid-required`、negativeは `reject-or-review`。回帰は従来の具体的stageを保存。

新truthは `columns: 30`、`rows: 16`、`board`（各30文字×16行）、`expectedBoardBounds`（x/y/width/height）を持つ。記号は `# . F 1 2 3 4 5 6 7 8`。negativeのみ未知セルを `?` で示し、gridを定義できなければboundsを `null` とする。positiveのboundsは画像内の正の領域が必要。`?` は11ラベルとは別であり、positiveへ入れない。

truthと元画像は人手で2者確認し、出典／利用権と公開可否、groupの独立性、テーマ・scanline条件、全case expectationを構成レビューする。truth訂正は証拠と独立レビューを伴う新manifest版にし、旧評価と同じ合格扱いにしない。

## コマンドと証拠

```sh
# キュレーター向け。全splitのtruthを読む。
npm run --silent fixtures:audit
# 別manifestも指定できる。
npm run --silent fixtures:audit -- test/recognition/dataset/manifest.json

# 各sourceに対し3回のfresh browserで4変換を作る。
npm run --silent fixtures:derive -- chromium
npm run --silent fixtures:derive -- firefox
npm run --silent fixtures:derive -- webkit
```

auditはJSONをstdoutへ出し、不足・漏洩・未確認なら `next-cell-recognition-blocked` と終了code 2を返す。検証を通った状態は `ready-for-fixture-review`（終了code 0）であり、構成レビューの完了や#7開始承認を代替しない。画像／truth hash、schema、寸法、ラベル、boundsを確認する。coverageはsourceセル数で数え、同一sourceの重複は水増ししない。

deriveはtruthのバイトhashだけを確認し、labelを解釈しない。Chromiumのみformal、Firefox／Playwright WebKitはreference。WebKitはSafari実機保証ではない。Canvasのdecode、`drawImage`、JPEG quality 0.75のencode/decodeからRGBAを取得する。縮小／拡大寸法は `Math.round`、smoothing enabled、quality low、decode optionを明示して記録する。Sharpは得られたRGBAの**lossless PNG保存だけ**に使い、Canvas変換を代替しない。

各実行はignoredな `test/artifacts/recognition-dataset/<engine>-<UUID>/` に新しいディレクトリを作り、manifest snapshot、全case PNG、reportを保存する。既存証拠を上書きしない。reportには元画像／truth／manifest／lockfile hash、Node／OS／CPU／architecture／Playwright／browser／Sharp version、全変換パラメータ、各fresh runのRGBA hash、寸法、保存PNG hashを含む。version・寸法・RGBAが3回一致しなければ失敗。環境が変わったpixel hashを同一環境の決定性失敗と混同しない。

変換結果の `matrix-reproducible` は**変換の再現性だけ**を示す。認識とgeometryは `not-run`、fixture構成の準備状況は `not-assessed`。参考エンジンの変換成功を分類器の `safe-within-tested-cases` や正式採用成功とは呼ばない。Sharp/Lanczos3のstress評価も合算しない。ケース欠落・実行不能は `matrix-failed`、失敗理由と途中までの証拠を保存し終了code 2を返す。

## holdout と次の作業

auditは#6のデータキュレーター専用。#7のモデル担当者は、特徴・係数・閾値・manifest・成果物hashを凍結するまでevaluation truthを開かず、このauditを実行しない。audit出力にはセル位置やtruth盤面を含めない。公開リポジトリのファイル権限による秘匿は提供しないため、担当者の分離と開封履歴を運用で守る。未開封truthが必要な収録段階ではキュレーター側で管理し、開封前にモデル担当へ渡さない。

trainだけでfitし、calibrationは事前候補と共有閾値の選択だけに使う。train＋calibrationを再fitしない。独立評価の失敗を見て調整した集合は回帰／開発用へ移し、新しい独立groupを用意する。

未完了項目は、新規positive 12group以上、新規negative 6group以上、7・8・scanline条件、複数テーマ／終局negativeの収録、出典・許諾の証拠、truthの2者確認、fixture構成レビュー、および新規画像の全4変換とgrid契約の検証。現時点でモデル学習・較正・独立評価、認識性能や採否の判断は実行していない。

初回の基盤検証と3エンジンのhash／環境snapshotは[2026-10-11の証拠](evidence/issue-6/2026-10-11/README.md)を参照。

追加画像の収録担当者向けに[収録チェックリスト](recognition-fixture-collection.md)を用意した。既存の証拠snapshotは実行当時のmanifestを保持し、今回の出典追記で書き換えない。
