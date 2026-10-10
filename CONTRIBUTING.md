# Contributing

現在の製品目標、着手順、次の作業は[プロジェクト現在地](docs/project/README.md)から確認してください。有効な判断と置換関係は[ADR log](docs/decisions/README.md)に記録します。挙動やスコープを変更する場合は、実装前にIssueで目的と採用条件を合意し、判断が変わる場合は新しいADRを追加して旧ADRと相互にリンクしてください。

## 開発環境

`.node-version`に記載されたNode.js 22.12.0を使用します。

```sh
npm ci
npx --no-install playwright install chromium
```

## 変更の検証

Pull Requestを作成する前に、typecheck → build → npm testの順で完全検証してください。productionブラウザテストは生成済み`dist`を使用し、`npm test`は通常テスト全体を直列に実行します。

```sh
npm run typecheck
npm run build
npm test
```

全Pull Requestと`main`へのpushでは、通常テスト全体を5グループに分けて実行し、各グループ内は直列です。必須チェック`CI / quality`は全グループの成功を確認します。Pages公開workflowも上記の完全検証を行い、`main`の対象commitの出荷確認と明示的承認後に手動で公開します。

`test:ci`は`product`、`formal`、`holdout`、`grid-compatibility`、`recognition`からグループを選んで実行します。製品ブラウザテストを含む`product`は、build後に次のように実行してください。

```sh
npm run test:ci -- product
```

`npm run test:spike-evidence`は、不採用になった認識方式の過去の採用条件を再現する専用コマンドであり、通常のgreen baselineではありません。

## 認識spike

- fixtureの正解データ、採用閾値、fail-closed条件を、テストを通す目的だけで弱めないでください。
- throwaway spikeコードは製品候補と明確に分離してください。
- 比較目的で旧spike資産を残す場合は、用途と削除条件を設計書またはspike報告書に記録してください。
