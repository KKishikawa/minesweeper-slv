# Contributing

このリポジトリは現在、画像認識のfeasibility spike段階です。挙動やスコープを変更する場合は、実装前にIssueで目的と採用条件を合意してください。

## 開発環境

`.node-version`に記載されたNode.js 22.12.0を使用します。

```sh
npm ci
npx --no-install playwright install chromium
```

## 変更の検証

Pull Requestを作成する前に、通常の回帰テストと型チェックを実行してください。

```sh
npm test
npm run typecheck
```

`npm run test:spike-evidence`は、不採用になった認識方式の過去の採用条件を再現する専用コマンドであり、通常のgreen baselineではありません。

## 認識spike

- fixtureの正解データ、採用閾値、fail-closed条件を、テストを通す目的だけで弱めないでください。
- throwaway spikeコードは製品候補と明確に分離してください。
- 比較目的で旧spike資産を残す場合は、用途と削除条件を設計書またはspike報告書に記録してください。
