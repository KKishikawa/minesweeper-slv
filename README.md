# minesweeper-slv

画像からマインスイーパーの盤面を読み取り、ブラウザ上で解析するソルバーを目指すプロジェクトです。

現在は画像認識の feasibility spike 段階です。ブラウザ製品として利用できる状態ではありません。

## 現在地

| 項目 | 状態 | 現在の判断 |
| --- | --- | --- |
| 盤面グリッド検出 | 部分採用 | Chromium正式評価16ケース中、11ケースを直接検出し、3ケースをフォールバックで検出します。残る2ケースは誤った盤面を返さず `null` で終了します。 |
| セル認識 | 不採用 | 派生画像で高信頼度の誤認識が残り、全正式ケースに共通する安全な信頼度閾値を選べませんでした。 |
| ブラウザ製品 | 未実装 | 画像入力、盤面の手動修正、solver、製品UIはまだ利用できません。 |
| 製品実装ゲート | 閉鎖中 | 次期セル認識方式を設計・検証し、[Issue #8](https://github.com/KKishikawa/minesweeper-slv/issues/8) で採用が決まるまで製品実装を開始しません。 |

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

- Node.js 22.12.0 以上
- 正式評価: Chromium
- 参考評価: Firefox / Playwright WebKit

## セットアップ

```sh
npm ci
npx playwright install chromium
```

## 検証

通常の回帰テスト233件と型チェックは成功時に終了コード0を返します。

```sh
npm test
npm run typecheck
```

グリッド検出の正式なChromium評価を再実行します。採用結果は11件の直接検出、3件のフォールバック検出、2件のfail-closedです。

```sh
npx tsx scripts/recognition/evaluate-grid-fallback.ts
```

棄却されたセル認識方式の採用条件2件だけを再実行します。現在の証拠では2件とも失敗し、終了コード1を返します。この失敗は通常テストの失敗ではなく、認識方式を採用しない判断を再現するための証拠です。

```sh
npm run test:spike-evidence
```

## ロードマップと資料

- [製品化ロードマップ（Issue #1）](https://github.com/KKishikawa/minesweeper-slv/issues/1)
- [全体設計](docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md)
- [初期セル認識spike報告](docs/superpowers/spikes/2026-08-16-image-recognition-report.md)
- [multi-prototypeセル認識spike報告](docs/superpowers/spikes/2026-08-23-multi-prototype-recognition-report.md)
- [canonical grid fallback採用報告](docs/superpowers/spikes/2026-08-24-canonical-grid-fallback-report.md)

全体設計と初期セル認識spike報告には、当時のnative scale / original encoding限定の採用判断が記録されています。この判断は後続のmulti-prototype spikeで製品向けの安全な共通閾値を得られなかったため更新され、現在のセル認識は不採用です。最新の採否とゲート状態はこのREADMEと製品化ロードマップを優先し、全体設計の認識範囲は次期方式の採用後に更新します。

`docs/superpowers/plans`のチェック欄は各作業時点の実施記録であり、プロジェクト全体の現在の完了状態を示すものではありません。現在の進捗と着手順はこのREADMEとロードマップ、採否判断の経緯と証拠は各spike報告を基準にしてください。
