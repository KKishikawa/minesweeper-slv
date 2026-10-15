# Issue #6 進捗とnegative収録条件の整合（2026-10-13）

[Issueへの進捗コメント](https://github.com/KKishikawa/minesweeper-slv/issues/6#issuecomment-6137494029)を追加した。完了済み・未確認・これからの変更を区別して記録し、Issueはopen、受け入れ条件は未完了のままとする。マージ後にPRと検証結果を追記する。

## 収録の現在地

追加25画面の整理・一次照合・確認済み10セルの訂正・truth正規化の下書きまで完了。30×16の24枚は9独立ゲームgroup、16×16の1枚は対象外サイズ。画像と下書きは正式fixture未登録。詳細は[2026-10-12の記録](../2026-10-12/README.md)を参照する。

30×16候補の重複を除いた被覆は5が29セル／7group、6が2セル／2group、7が1セル／1group、8が未収録。希少数字はゲーム内での遭遇機会自体が少ないとの所有者説明を受けた。少数例で評価できる範囲と保証できない範囲を整理し、正式評価前に条件の見直しを検討する。今回positiveの最低group数・ラベル数・scanline条件は変更しない。

盤面全体の2名によるtruth確認、画像利用・公開条件、撮影設定、boundsの正式検証、split割当、追加画面の正式変換とgrid契約、fixture構成レビューは未完了。Issue #6の完了や#7の正式評価開始を宣言しない。

## 今回の変更

2026-10-12の「追加negativeは不要」という所有者方針と、2026-10-13の実装承認を設計・audit・収録手順へ反映した。追加negativeの旧条件（較正／評価それぞれ3group・未知セル30個以上）を撤廃し、未収録だけでは開始停止にしない。

negativeの被覆集計は維持する。任意で登録したnegativeには未知セル注釈、権利、2者によるtruth確認、split分離の検証を適用する。既存negative安全性テストは維持し、未収録の未知テーマ・終局表示を評価済みとは扱わない。製品認識コード・既存画像・truth・manifest・過去の証拠snapshotは変更していない。

## 検証

追加テストでnegative未収録／旧最低数未満の2件が変更前に意図どおり失敗し、変更後に通過した。登録済みnegativeの未知セル注釈を必須とするテストも通過。dataset・dataset-evidenceの2ファイル12テストは通過した。

[更新後のaudit snapshot](dataset-audit.json)は終了code 2、`next-cell-recognition-blocked`。negative未収録の被覆不足は停止理由から消えたが、positive被覆不足・権利・truth確認・scanline注釈による54件の停止理由が残る。正式manifestは既存4画面のままであり、追加候補を確認済みとして登録していない。

型検査（`npm run typecheck`）、production build（`npm run build`）、`git diff --check`は通過。読み取り専用のコードレビューで重要な不具合・要件との不整合は指摘されなかった。

`npm test` は70ファイル・688テストすべて通過（393.59秒、終了code 0）。CI runnerの非0終了を検証する子プロセスの意図的な失敗ログは、親suiteの失敗ではない。
