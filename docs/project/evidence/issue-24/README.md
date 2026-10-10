# Issue #24 計測証跡

[調査・修正記録](../../issue-24-input-stability.md)。Mac / Playwright Chromium 151.0.7922.34、2026-10-10。今回は確認者の指示によりWindows再検証を要求しない。

各ディレクトリの `summary.json` に全6ケースの環境・計測値を保存。`<viewport幅>-<盤面列数>.json.gz` は入力時刻と各イベントの生JSON。`gzip -dc baseline/1920-9.json.gz` のように展開できる。

| 段階 | 製品コードの差分 | 集計 |
| --- | --- | --- |
| baseline | commit 1a01eacの製品コード | [JSON](baseline/summary.json) |
| result-space | 結果欄・有効policyの行スペース確保 | [JSON](result-space/summary.json) |
| canvas-size | 上記＋盤面Canvasの同寸法設定抑制 | [JSON](canvas-size/summary.json) |
| legend-cache | 上記＋凡例の記号/DPRキャッシュ | [JSON](legend-cache/summary.json) |
| final | 上記＋選択/focusin重複抑制・幅だけのResizeObserver | [JSON](final/summary.json) |

前後の画像はbaselineとfinalの全6ケース。代表動画は1280pxの両盤面を保存した。動画はブラウザのviewport、PNGはページ全体の画像であり、サイズを混同しない。

| 表示領域 | 盤面 | 前画像 | 後画像 | 前動画 | 後動画 |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 9×9 | [PNG](baseline/1920-9.png) | [PNG](final/1920-9.png) | — | — |
| 1920×1080 | 30×16 | [PNG](baseline/1920-30.png) | [PNG](final/1920-30.png) | — | — |
| 1280×800 | 9×9 | [PNG](baseline/1280-9.png) | [PNG](final/1280-9.png) | [WebM](baseline/1280-9.webm) | [WebM](final/1280-9.webm) |
| 1280×800 | 30×16 | [PNG](baseline/1280-30.png) | [PNG](final/1280-30.png) | [WebM](baseline/1280-30.webm) | [WebM](final/1280-30.webm) |
| 960×1080 | 9×9 | [PNG](baseline/960-9.png) | [PNG](final/960-9.png) | — | — |
| 960×1080 | 30×16 | [PNG](baseline/960-30.png) | [PNG](final/960-30.png) | — | — |

動画・計測の全生成物はGit管理外の `test/artifacts/issue-24/<段階>/` にも残る。生JSONはキー区間・描画・寸法setter・ResizeObserver・layout-shift（直前入力ありを含む）・フォーカス・scroll・rAF geometryを記録する。Canvas clearRectの呼び出し回数をGPU paint回数と解釈しない。録画時の画面が実機の知覚的ちらつきと同じ現象を網羅するという意味ではない。
