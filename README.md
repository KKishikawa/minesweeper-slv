# minesweeper-slv

画像からマインスイーパーの盤面を読み取り、ブラウザ上で解析するソルバーを目指すプロジェクトです。

現在は画像認識の feasibility spike 段階です。収録した4枚の画像に対する盤面グリッド検出、ブラウザ互換性の評価、認識方式の検証コードと設計資料を含みます。ブラウザUIとソルバー統合はまだ実装していません。

## 動作環境

- Node.js 22.12.0 以上
- 正式評価: Chromium
- Firefox / Playwright WebKit: 互換範囲を調べるための参考評価

## セットアップ

```sh
npm ci
npx playwright install chromium
```

## 検証

```sh
npm run typecheck
npx tsx scripts/recognition/evaluate-grid-fallback.ts
```

グリッド検出の正式なChromium評価では、16ケース中11ケースを直接検出し、3ケースをフォールバックで検出します。残る2ケースは、矛盾した候補を採用しない fail-closed の結果として棄却します。

```sh
npm test
```

全テストのうち228件が成功します。既存の認識期待値に関する2件は、少量のfixtureでは安全な分類器を採用できないというスパイク結果に伴い、現時点では失敗します。学習済みモデルや製品用プロトタイプバンクは採用していません。

詳しい判断根拠は [`docs/superpowers/spikes`](docs/superpowers/spikes) にあります。
