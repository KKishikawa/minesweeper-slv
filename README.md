# minesweeper-slv

ブラウザ上でマインスイーパーの盤面を解析するローカルsolverを構築するプロジェクトです。最初に手動盤面入力で使える製品を提供し、その後に画像支援と認識統合を追加します。

手動盤面入力型MVPの開発版 `0.1.0-dev.1` を[GitHub Pagesで公開しました](https://kkishikawa.github.io/minesweeper-slv/)。Windows Chrome実機記録と合意済みChromium補完、公開後smokeまで確認済みです。認識研究は独立して継続します。

## 利用できる機能

- 幅・高さ1〜30、総地雷数0〜セル数を指定した盤面作成
- マウスとキーボードで閉じたセル・空き・旗・数字1〜8を入力
- 安全セル（S）、地雷（M）、同率の推測候補（?）の提案
- 入力旗の尊重・再検討、自動再検討、矛盾表示と再解析
- Web Worker内でのローカル解析。入力を上書きせず、更新前の応答を破棄
- 開発者向け診断をONにして取得した履歴のJSON出力（メモリ内・最大100件）。[取得・再実行手順](docs/project/solver-diagnostics.md)

入力方式は「キーボード中心」と「クリック・タップ中心」を切り替えられます。初期状態は主な入力デバイスがタッチならクリック・タップ中心、それ以外はキーボード中心です。端末の種類を完全に識別する判定ではありません。手動で選んだ方式は盤面の再作成やリセットでも維持し、再読み込み時は再判定します。

キーボード中心では、セルのクリックは選択とフォーカス移動だけを行い、観測値を変更しません。矢印で移動、0 / Spaceで空き、Fで旗、Deleteで閉じる、1〜8で数字です。クリック・タップ中心では、パレットを選んでセルをクリック・タップします。リセットは盤面設定と旗policyを保ちます。

## 制限と現在地

- 解析は200,000探索ノード・Worker待機5秒を上限とし、超過時は提案を表示しません。
- 旗を地雷として扱う場合、成立する誤った入力旗は検出できません。
- 画像入力、認識統合、自動クリック、数値確率表示、自動保存はありません。再読み込みで盤面は初期化されます。
- 盤面グリッド検出はChromium正式評価16ケース中14ケースで部分採用。セル認識候補は不採用で、認識研究は[Issue #5](https://github.com/KKishikawa/minesweeper-slv/issues/5)から独立して継続します。
- version `0.1.0-dev.1`。開発版として公開済みです。
- 検証結果と公開記録は[手動MVPリリース確認](docs/project/manual-mvp-release.md)を参照してください。

## 動作環境

- 開発・CI基準: `.node-version`で22.12.0に固定
- 対応Node.js: 22.12.0以上
- 正式評価: Chromium
- 参考評価: Firefox / Playwright WebKit

`package-lock.json`はPlaywright 1.62.1を固定し、Playwrightが対応するChromium revisionを管理します。通常CIとローカルセットアップは、独立したブラウザバージョンではなく、この組み合わせを使用します。

## セットアップ

```sh
npm ci
npx --no-install playwright install chromium
```

## 起動

```sh
npm run dev
```

production版は`npm run build`の後に`npm run preview`で確認できます。

## 検証

Pull Requestと`main`へのpushでは、`CI / quality`が同じNode.js・Chromium条件で通常の回帰テストと型チェックを実行します。

productionブラウザテストは生成済み`dist`を使うため、`npm test`の前にbuildが必要です。通常CIもtypecheck → build → testの順です。

```sh
npm run typecheck
npm run build
npm test
```

`npm run test:browser`でブラウザテストだけを実行できます。この場合も先に`npm run build`を実行してください。

グリッド検出の正式なChromium評価を再実行します。採用結果は11件の直接検出、3件のフォールバック検出、2件のfail-closedです。

```sh
npx tsx scripts/recognition/evaluate-grid-fallback.ts
```

棄却されたセル認識方式の採用条件2件だけを再実行します。現在の証拠では2件とも失敗し、終了コード1を返します。この専用コマンドは通常CIでは実行しません。不採用判断の正本はspike報告書とGit履歴であり、この赤いテストは次期認識設計で再利用価値を棚卸しする退役候補です。

```sh
npm run test:spike-evidence
```

## ロードマップと資料

- [現在のプロジェクト情報](docs/project/README.md)
- [現在の製品定義](docs/project/product.md)
- [入力方式切替の検証と実機再検証手順](docs/project/input-mode-verification.md)
- [現在のロードマップ](docs/project/roadmap.md)
- [ADR log](docs/decisions/README.md)
- [GitHub作業ダッシュボード（Issue #1）](https://github.com/KKishikawa/minesweeper-slv/issues/1)
- [全体設計](docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md)
- [初期セル認識spike報告](docs/superpowers/spikes/2026-08-16-image-recognition-report.md)
- [multi-prototypeセル認識spike報告](docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md)
- [canonical grid fallback採用報告](docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md)

全体設計と初期セル認識spike報告には、当時のnative scale / original encoding限定の採用判断が記録されています。この判断は後続の正式評価によって置換され、現在のセル認識は不採用です。現在の製品範囲と順序は`docs/project`、有効な判断と置換関係はADR log、各実験の測定結果はspike報告を参照してください。

`docs/superpowers/plans`のチェック欄は各作業時点の実施記録であり、プロジェクト全体の現在の完了状態を示すものではありません。GitHub Issueは個々の作業状態を管理し、Issue #1はリポジトリ内ロードマップへ案内する作業ダッシュボードです。
