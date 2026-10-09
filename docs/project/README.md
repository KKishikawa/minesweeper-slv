# プロジェクト現在地

## 現在の目標

最初のMVPは、画像認識なしでも、手動盤面入力とsolverでマインスイーパーの問題を解けるブラウザアプリです。

## 現在の状態

- 手動盤面入力型MVP: 設計・[実装計画](../superpowers/plans/2026-09-13-manual-board-mvp.md)に沿って単位1〜8を実装済み。単位9の自動検証とリリース手順も整備。Windows実機・公開確認は未実施
- 盤面グリッド検出: Chromium正式評価16ケース中14ケースをfail-closedで部分採用
- セル認識: 現在評価済みの候補は不採用。認識研究トラックで再設計する
- ブラウザ製品: PR #20で手動入力版をmainへ統合済み。Windows実機確認・公開は未実施

## 次の作業

[Issue #9](https://github.com/KKishikawa/minesweeper-slv/issues/9)の計画に沿う実装は、盤面モデル、solver、手動入力、日本語UIまで追加済みです。[リリース確認](manual-mvp-release.md)の未実施事項（Windows Chrome実機確認、GitHub Pagesへの配信・公開後smoke）を進めます。PR #20はmainへ統合済みです。#10・#11・#14・#15のIssueはclosedです。#16はWindows実機確認・公開が残るため未完了です。具体的な実機確認と記録には[Windows確認票](manual-mvp-windows-checklist.md)を使用します。#10の基盤がmainへ統合されたため、画像取得の#12も着手可能です。認識研究は[Issue #5](https://github.com/KKishikawa/minesweeper-slv/issues/5)から独立して進められます。

## 現在の正本

- [製品定義](product.md)
- [ロードマップ](roadmap.md)
- [ADR log](../decisions/README.md)

情報種別ごとの正本は次のとおりです。

| 確認したいこと | 正本 |
| --- | --- |
| 製品とMVPの範囲 | [製品定義](product.md) |
| 順序、依存、ゲート | [ロードマップ](roadmap.md) |
| 有効な判断と置換関係 | [ADR log](../decisions/README.md) |
| 現在地と次の作業 | この文書 |
| 実験の測定結果 | 該当するspike報告 |
| 各時点で承認された設計 | 該当する日付付きspec |
| 実施手順と作業記録 | 該当する日付付きplan |
| 個別作業のopen / closed状態 | 該当するGitHub Issue |

## 歴史資料

[specs](../superpowers/specs/)は各時点の設計、[spikes](../superpowers/spikes/)は実験結果、[plans](../superpowers/plans/)は実施手順と作業記録です。現在の製品定義、順序、判断が歴史資料と異なる場合は、上記の現在の正本を優先します。

## 更新順

プロジェクトレベルの判断が変わる場合は、ADR、製品定義、ロードマップ、この現在地、関連IssueとIssue #1、公開要約が変わる場合だけroot README、の順に更新します。
