# ADR 0002: 初期セル認識方式を限定条件で採用する

Status: superseded by [ADR 0003](0003-reject-current-cell-recognition-candidates.md)

Decision date: 2026-08-17
Recorded: 2026-09-11（歴史資料から遡及記録）

## Context

最初のfeasibility spikeでは、4枚の元fixtureは全1920セルを誤りなく分類しました。一方、Sharp/Lanczos3による縮小・拡大とJPEG-Q75の派生画像では32件のhigh-confidence errorが残り、全variantに共通する閾値を選べませんでした。ブラウザCanvasの補間はこの時点では未評価でした。

## Considered Options

- 元画像と派生画像を含む入力一般へ採用する。
- Canvasから取得するRGBAのうち、収録元画像のnative scaleかつoriginal encodingに範囲を限定して採用する。
- 認識コアを採用しない。

## Decision

Canvasから取得したRGBAを処理する初期認識コアを、収録元画像のnative scaleかつoriginal encodingに限って条件付き採用しました。Lanczos3でリサイズされた入力、JPEG-Q75で再圧縮された入力、および未評価の実入力経路へ判断を一般化しませんでした。

この判断は、後続の正式評価を受けて[ADR 0003](0003-reject-current-cell-recognition-candidates.md)に置換されています。

## Consequences

- 当時の採用範囲は4枚の収録元fixtureに限定されました。
- 幅、高さ、総地雷数は引き続き利用者の手入力を正式値としました。
- 画像取得経路ごとに対応範囲を満たすか確認する必要が残りました。

## Evidence

- [2026-08-16 Image Recognition Feasibility Spike Report](../superpowers/spikes/2026-08-16-image-recognition-report.md)
- [2026-08-16 Minesweeper Solver 全体設計 — recognition](../superpowers/specs/2026-08-16-minesweeper-solver-design.md)
