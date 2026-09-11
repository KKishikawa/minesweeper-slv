# ADR 0008: 製品コアを認識採用から切り離す

Status: accepted

Decision date: 2026-08-28
Recorded: 2026-09-11

## Context

従来のロードマップは、Issue #8で認識器が採用されるまで後続の製品作業全体を停止していました。しかし手動盤面入力型MVPと認識研究は、認識統合の時点まで独立して進められます。

## Considered Options

- 認識採用をすべての製品作業の共通ゲートとして維持する。
- 製品コアと認識研究を別トラックにし、認識を必要とする統合だけを採用判断でゲートする。

## Decision

製品コアと認識研究は独立して進行可能にします。Issue #8の採用結果はIssue #13と、認識方式を必要とする後続の統合作業だけをゲートします。Issue #9、#10、#11、#14、#15、およびIssue #16の手動盤面入力型MVPスコープは認識採用に依存しません。

## Consequences

- Issue #9とIssue #5を独立して開始できます。
- 認識研究が続く間も、盤面モデル、solver、手動入力、MVP UI、品質確認を進められます。
- リポジトリ内のロードマップとGitHub Issueの依存関係を同期して更新する必要があります。
- 認識統合は、採用済みのIssue #8結果と関連する製品・画像入力境界が揃うまで開始できません。

## Evidence

- [2026-08-28 Project Information and Roadmap Reorganization Design](../superpowers/specs/2026-08-28-project-information-and-roadmap-design.md)
- [現在のロードマップ](../project/roadmap.md)
