# minesweeper-slv

ブラウザ上でマインスイーパーの盤面を解析するローカルsolverを構築するプロジェクトです。最初に手動盤面入力で使える製品を提供し、その後に画像支援と認識統合を追加します。

現在、ブラウザ製品は未実装です。手動盤面入力型MVPの製品コアと認識研究は、互いを待たずに進められます。

## 現在地

| 項目 | 状態 | 現在の判断 |
| --- | --- | --- |
| 手動盤面入力型MVP | 次の製品目標 | 幅、高さ、総地雷数と各セルを手動入力し、ローカルsolverの提案を得るブラウザアプリを最初に提供します。 |
| 盤面グリッド検出 | 部分採用 | Chromium正式評価16ケース中、11ケースを直接検出し、3ケースをフォールバックで検出します。残る2ケースは誤った盤面を返さず `null` で終了します。 |
| セル認識 | 不採用 | 現在評価済みの候補は採用しません。初期方式の派生画像での確信付き誤分類と、後続方式の正式マトリクス未完了は、別の棄却根拠として記録しています。 |
| 認識研究 | 独立トラック | [Issue #5](https://github.com/KKishikawa/minesweeper-slv/issues/5)から再設計します。採用判断でゲートするのは認識統合であり、手動盤面入力型MVPではありません。 |
| ブラウザ製品 | 未実装 | 盤面の手動入力、solver、画像入力、製品UIはまだ利用できません。 |

### 実装済み

- 収録した4枚のfixtureと決定論的な派生画像による認識評価
- fail-closedの盤面グリッド検出とcanonical fallback
- Chromiumを正式判定、FirefoxとPlaywright WebKitを参考判定とする評価コード
- 通常の回帰テストと、棄却された認識方式のspike evidenceを分離したテスト構成

### 設計のみ

- `BoardRecognizer`境界とWeb Workerでの認識実行
- 盤面モデル、validation、制約solver
- ファイル、クリップボード、ドラッグ＆ドロップ、画面共有からの画像入力
- Canvas盤面表示、日本語UI、レスポンシブ対応、アクセシビリティ

### 未着手

- 起動可能なブラウザUI
- solverの実装と認識結果との統合
- 認識失敗時の手動修正フロー
- 製品E2E、Windows Chromeでの手動確認、デプロイとリリース設定

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

## 検証

Pull Requestと`main`へのpushでは、`CI / quality`が同じNode.js・Chromium条件で通常の回帰テストと型チェックを実行します。

通常の回帰テストと型チェックは成功時に終了コード0を返します。

```sh
npm test
npm run typecheck
```

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
- [現在のロードマップ](docs/project/roadmap.md)
- [ADR log](docs/decisions/README.md)
- [GitHub作業ダッシュボード（Issue #1）](https://github.com/KKishikawa/minesweeper-slv/issues/1)
- [全体設計](docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md)
- [初期セル認識spike報告](docs/superpowers/spikes/2026-08-16-image-recognition-report.md)
- [multi-prototypeセル認識spike報告](docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md)
- [canonical grid fallback採用報告](docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md)

全体設計と初期セル認識spike報告には、当時のnative scale / original encoding限定の採用判断が記録されています。この判断は後続の正式評価によって置換され、現在のセル認識は不採用です。現在の製品範囲と順序は`docs/project`、有効な判断と置換関係はADR log、各実験の測定結果はspike報告を参照してください。

`docs/superpowers/plans`のチェック欄は各作業時点の実施記録であり、プロジェクト全体の現在の完了状態を示すものではありません。GitHub Issueは個々の作業状態を管理し、Issue #1はリポジトリ内ロードマップへ案内する作業ダッシュボードです。
