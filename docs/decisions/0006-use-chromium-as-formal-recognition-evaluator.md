# ADR 0006: Chromiumを認識の正式評価環境とする

Status: accepted

Decision date: 2026-08-23
Recorded: 2026-09-11（歴史資料から遡及記録）

## Context

画像のdecode、Canvas resize、Canvas JPEG encodingはブラウザエンジンによって結果が異なる可能性があります。採否を複数エンジンの混合結果で決めると、正式な保証範囲が不明確になります。

## Considered Options

- Chromium、Firefox、Playwright WebKitの全結果を同じ採用ゲートにする。
- Chromiumを正式判定に使い、FirefoxとPlaywright WebKitを互換性の参考情報にする。

## Decision

Chromiumを認識方式と盤面グリッド検出の正式評価環境とします。FirefoxとPlaywright WebKitは参考となる互換性情報を収集しますが、Chromiumの採否判断を上書きしません。Playwright WebKitをSafariの互換性保証とは扱いません。

## Consequences

- 採用判断の基準となるエンジンと変換経路が一意になります。
- FirefoxとWebKitの結果は保証範囲を狭める参考にはなりますが、Chromiumの合否を変更しません。
- 別ブラウザを正式対応に加える場合は、その保証と評価条件を別途定義する必要があります。

## Evidence

- [2026-08-23 Multi-Prototype Cell Recognition Redesign — Browser and Transform Matrix](../superpowers/specs/2026-08-23-multi-prototype-recognition-design.md)
- [2026-08-23 Multi-Prototype Recognition Spike Report](../superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md)
- [2026-08-24 Canonical Grid Fallback Report](../superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md)
