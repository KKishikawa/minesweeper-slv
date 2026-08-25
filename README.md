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

通常の回帰テストだけを実行し、成功時は終了コード0を返します。少量のfixtureでは安全な分類器を採用できないことを示す赤い採用条件2件は、この通常スイートには含めません。

```sh
npm run test:spike-evidence
```

棄却された認識方式の採用条件2件だけを再実行します。現在の証拠では2件とも失敗し、終了コード1を返します。この失敗は隠したり通常CIの成功として扱ったりせず、認識spikeの不採用根拠として保存します。学習済みモデルや製品用プロトタイプバンクは採用していません。

詳しい判断根拠は [`docs/superpowers/spikes`](docs/superpowers/spikes) にあります。
