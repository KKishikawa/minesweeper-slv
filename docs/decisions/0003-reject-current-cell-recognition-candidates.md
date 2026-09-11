# ADR 0003: 現在評価済みのセル認識候補を採用しない

Status: accepted

Decision date: 2026-08-23
Recorded: 2026-09-11（歴史資料から遡及記録）

Supersedes: [ADR 0002](0002-conditionally-adopt-initial-cell-recognition.md)

## Context

初期の単一prototype方式は、native sourceでは成功したものの、派生画像で32件のhigh-confidence errorを返しました。後続のmulti-prototype方式は、同じbankと共有閾値を使う正式なChromium 16ケースおよびleave-one-screen-out評価を通過することを採用条件としました。

multi-prototype評価では、`1:canvas-scale-075`と`2:canvas-scale-075`で盤面グリッドを得られず正式マトリクスが未完了となり、thresholded bankを確定できませんでした。この棄却理由は、初期方式で観測された確信付き誤分類とは異なります。グリッドを得られなかった2ケースについて、multi-prototype分類器自体の正誤を断定するものではありません。

## Considered Options

- 初期方式の限定採用を維持する。
- 正式採用条件をすべて満たした場合にmulti-prototype方式を採用する。
- 採用条件が未達なら両候補を製品へ採用せず、認識方式の設計へ戻る。

## Decision

初期の単一prototype方式とmulti-prototype方式のいずれも、現在の製品向けセル認識器として採用しません。認識研究へ戻り、後続方式は独立した採用条件で評価します。

## Consequences

- [ADR 0002](0002-conditionally-adopt-initial-cell-recognition.md)の限定採用は置換されます。
- 製品は、評価できなかったセルを確実な値として扱いません。
- 既存spikeの資産と報告は、次の認識設計の証拠として保持します。

## Evidence

- [2026-08-16 Image Recognition Feasibility Spike Report](../superpowers/spikes/2026-08-16-image-recognition-report.md)
- [2026-08-23 Multi-Prototype Cell Recognition Redesign](../superpowers/specs/2026-08-23-multi-prototype-recognition-design.md)
- [2026-08-23 Multi-Prototype Recognition Spike Report](../superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md)
