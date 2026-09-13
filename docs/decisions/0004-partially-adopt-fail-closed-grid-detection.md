# ADR 0004: fail-closed盤面グリッド検出を部分採用する

Status: accepted

Decision date: 2026-08-24
Recorded: 2026-09-11（歴史資料から遡及記録）

## Context

正式なChromium 16ケースでは、直接検出が11ケース、source-revalidated canonical fallbackが3ケースで盤面を返しました。残る2ケースは曖昧または根拠不足として公開結果`null`を返しました。先行する16/16ゲートと相対性能ゲートの失敗は、後から定めた部分採用の判断で成功へ読み替えません。

部分採用の最終評価では、11件直接・3件fallback・2件source-revalidation-rejectedの決定論的な行列、共有予算、negative matrix、完全経路の中央値500ms以下・最悪値1000ms以下という改訂後のUX基準を満たしました。

## Considered Options

- 16ケースすべての検出を必須として採用しない。
- 14ケースの安全な成功と2ケースのfail-closedを、範囲を固定して部分採用する。
- 閾値や実行時のfixture別分岐を追加して16ケースを通す。

## Decision

盤面グリッド検出を、正確に11件の直接検出、3件のsource-revalidated fallback、2件の公開`null`という範囲で部分採用します。曖昧、予算超過、未対応、または根拠不足の入力では推測した盤面を返しません。閾値、fixture名、ケースID、ブラウザ種別による実行時分岐は導入しません。

## Consequences

- 14ケースでは決定論的に盤面グリッドを取得できます。
- 2ケースは製品上の明示的な制約としてfail-closedになり、手動盤面入力が利用可能な経路となります。
- 16/16のfallback spike失敗と旧相対性能ゲート失敗は歴史的証拠として残ります。
- この判断だけではセル認識器の採用を許可しません。

## Evidence

- [2026-08-24 Canonical Grid Fallback Partial Adoption Design](../superpowers/specs/2026-08-24-canonical-grid-partial-adoption-design.md)
- [2026-08-24 Canonical Grid Fallback UX Performance Amendment](../superpowers/specs/2026-08-24-canonical-grid-ux-performance-amendment-design.md)
- [2026-08-24 Canonical Grid Fallback Report](../superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md)
