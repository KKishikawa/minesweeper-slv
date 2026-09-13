# ADR log

このディレクトリは、現在有効な判断と置換済みの判断を記録します。実験の測定値、失敗したゲート、適用範囲は元のspike報告に残し、ADRはそこから採用された判断を参照します。

## Active

| ADR | 判断日 | 判断 |
| --- | --- | --- |
| [0001](0001-process-data-locally.md) | 2026-08-16 | 画像と盤面はブラウザ内で処理し、外部解析APIを使わない。 |
| [0003](0003-reject-current-cell-recognition-candidates.md) | 2026-08-23 | 現在評価済みのセル認識候補を製品へ採用しない。 |
| [0004](0004-partially-adopt-fail-closed-grid-detection.md) | 2026-08-24 | 盤面グリッド検出を11件直接・3件fallback・2件fail-closedの範囲で部分採用する。 |
| [0005](0005-require-manual-confirmation-before-solving-uncertain-boards.md) | 2026-08-16 | 不確実または矛盾する盤面は手動確認までsolverへ渡さない。 |
| [0006](0006-use-chromium-as-formal-recognition-evaluator.md) | 2026-08-23 | Chromiumを認識採否の正式評価環境とする。 |
| [0007](0007-deliver-manual-board-entry-mvp-first.md) | 2026-08-28 | 手動盤面入力とローカルsolverを最初のMVPとする。 |
| [0008](0008-decouple-product-core-from-recognition-adoption.md) | 2026-08-28 | 製品コアと認識研究を独立して進行可能にする。 |

## Superseded

| ADR | 判断日 | 判断 | 置換先 |
| --- | --- | --- | --- |
| [0002](0002-conditionally-adopt-initial-cell-recognition.md) | 2026-08-17 | 初期セル認識方式をnative scaleかつoriginal encodingに限定して条件付き採用する。 | [0003](0003-reject-current-cell-recognition-candidates.md) |

## Update Rule

判断を変更するときは新しいADRを追加し、古いADRは本文を上書きせず`superseded`へ変更します。新旧のADRから相互にリンクし、製品範囲や順序が変わる場合は[現在のプロジェクト情報](../project/README.md)も更新します。誤字とリンク切れは既存ADRで直接修正できます。
