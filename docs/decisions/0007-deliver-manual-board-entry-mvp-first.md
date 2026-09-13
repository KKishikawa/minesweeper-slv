# ADR 0007: 手動盤面入力型MVPを最初に提供する

Status: accepted

Decision date: 2026-08-28
Recorded: 2026-09-11

## Context

セル認識は採用できていませんが、盤面モデル、検証、solver、盤面描画、手動入力は認識器なしで利用価値を提供できます。認識の採否を最初の製品到達点の前提にすると、独立して実装可能な製品コアまで停止します。

## Considered Options

- 画像入力と認識統合を含む製品を最初の到達点にする。
- 手動盤面入力とローカルsolverを最初のMVPとし、画像支援と認識を後続にする。

## Decision

幅、高さ、総地雷数と各セルを利用者が入力し、ローカルsolverが確定安全セル、確定地雷セル、最善の推測候補を提案するブラウザアプリを最初のMVPとします。画像入力と自動セル認識は後続の機能です。

以前の手動solverは要件を検討する参考に限り、互換性の対象、移植元、実行時依存、またはリポジトリの前提にはしません。このプロジェクトの要件は独立して記述します。

## Consequences

- 認識研究の完了前に利用可能な製品価値を提供できます。
- 手動入力、盤面状態、検証、solver提案の境界が、後続の画像支援にも使える安定した製品面になります。
- 最初のMVPでは画像取得や認識の操作フローを提供しません。

## Evidence

- [2026-08-28 Project Information and Roadmap Reorganization Design](../superpowers/specs/2026-08-28-project-information-and-roadmap-design.md)
- [現在の製品定義](../project/product.md)
