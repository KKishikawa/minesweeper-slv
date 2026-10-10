# 手動盤面入力型MVP リリース確認

対象: `0.1.0-dev.1`（開発版）。初回記録: 2026-10-08。最終検証: 2026-10-10。

## 判定

手動入力からローカルsolver提案まで実装済み。**出荷確認は未完了**です。2026-10-10にWindows Chromeで実機確認を実施しました。W1の凡例とW5の入力旗の視認性に指摘があり、表示・通信の一部記録も補完が必要です。公開先はGitHub Pagesに決定しました。実際の配信と配信後smokeは未実施です。実装はPR #20でmainへ統合済みです。

## 実装範囲と制限

- 幅・高さは1〜30、総地雷数は0〜セル数の整数。既定9×9、10地雷。
- マウスとキーボードの入力、正方形CanvasとアクセシブルなDOMセル、旗policy、リセット、再解析。
- 盤面観測と提案は分離。編集時にrevisionを進め、古いrequest/revisionの応答は破棄。
- 入力旗を尊重する既定policyでは、成立する誤旗は検出できない。再検討policyで全旗を未確定として扱う。
- 探索上限200,000ノード、Worker待機上限5秒。打切り時に部分的な確定手を返さない。
- 画像入力・認識統合・数値確率・自動クリック・バックエンドなし。
- 自動保存なし。localStorage/sessionStorage/IndexedDBを使用せず、再読み込みで初期化。

## 検証証跡

| 項目 | 結果 |
| --- | --- |
| 盤面、validation、state、Worker client | 対象の単体テスト成功 |
| solver | 独立oracleで2×2の全11^4観測パターン×5総地雷数×2旗policy、固定seedの3×3盤面400件×2policyに一致 |
| 実Worker | 同率候補、旗の再検討、全体矛盾、無効メッセージの非実行を確認 |
| 開発版ブラウザ | マウスと全入力キー、リセット、矛盾から復帰、旗policy、遅延応答破棄、注入エラー・タイムアウトを確認 |
| production Chromium | `151.0.7922.34`、macOS上のPlaywright Chromiumで5件成功 |
| レイアウト | 1920×1080、1280×800、960×1080で9列・30列を確認。正方形・24 CSS px以上・ページ横スクロールなし・sidebar切替・DPR 2を検証 |
| キーボード | Tab移動で設定・編集・policy・再解析・リセットを完了 |
| ローカル処理 | 通信は同一originの静的JS/CSS/Workerのみ。WebSocket・beaconなし、storageなし、Service Worker登録なし |
| 視覚確認 | `test/artifacts/manual-mvp/`の画像でS記号、選択枠、右/下情報欄を確認。画像はテストで再生成する |
| クリーンソースでの全体検証 | 新規ソース展開（dist・node_modulesなし）→npm ci→Chromium install→typecheck→build→全体テスト成功。最終コードは41ファイル358件、372.74秒、終了コード0。レビュー指摘の修飾キー保護も含む。 |
| Windows Chrome実機 | **実施・指摘あり**。2026-10-10、Windows 11 Pro 25H2 / Chrome 155.0.8059.40、対象ba4aea80faac9214ad57a829dd8ff0dc0fc6c210。W2〜W4・W6〜W12は確認者記録でOK。W1/W5に指摘、表示・通信の不足記録あり。[確認票](manual-mvp-windows-checklist.md)と[証跡対応表](evidence/manual-mvp-windows/2026-10-10/README.md)を参照 |
| Windows Edge | 未実施 |

## 再現手順

`.node-version`のNode.js 22.12.0を使用します。lockfileで固定した依存とChromiumを使い、buildを必ずブラウザテストより先に実行します。

```sh
npm ci
npx --no-install playwright install chromium
npm run typecheck
npm run build
npm test
npm run preview
```

`npm run test:browser`も生成済み`dist`が前提です。通常CIはtypecheck → build → testの順で、ブラウザテストを別stepで重複実行しません。不採用認識spikeの専用テストは通常CIの対象外です。

## 配信手順（未実施）

1. [Windows確認票](manual-mvp-windows-checklist.md)に沿って、Windows Chromeで設定→入力→提案、矛盾→修正、旗policy、キーボード、3画面サイズを確認する。初回実施の結果は記録済み。#22の表示指摘の修正・再確認と、表示・通信の不足記録の補完を行い、対象commit・OS・ブラウザversion・日付・結果を記録する。
2. GitHubのSettings → Pages → Build and deploymentでSourceをGitHub Actionsに設定する。HTTPSのプロジェクトサイトを使い、配信対象は`dist/`のみとする。APIサーバーは不要。
3. `.js`（module Workerを含む）はJavaScript MIME（`text/javascript`または`application/javascript`）、CSSは`text/css`で返す。WorkerをHTML fallbackで返さない。
4. `npm run build:pages`で`/minesweeper-slv/`向けにbuildする。`npm test -- test/browser/pages.test.ts`は別の一時出力先でこのbuildを実行し、サブパスから静的ファイルと実Workerを読み込み、solver提案まで確認する。通常の`dist/`を上書きしない。
5. 本変更をmainへ統合し、Windows確認票の対象commitと公開対象を一致させる。Actionsの「Publish GitHub Pages」をmainから手動実行し、確認票完了と公開承認の入力をtrueにする。ワークフローは型検査・全テストを再実行し、versionとcommitを`release.json`へ記録してPages artifactを配信する。pushやPRでは公開しない。直前の成功runとcommitをロールバック用に記録する。
6. 配信後に静的ファイル・Worker取得、3×1/1地雷/左0の安全・地雷提案、矛盾と再入力、キーボード、外部通信なしをsmoke確認する。
7. 不具合時は直前の成功したPages workflow runを再実行して、そのrunのcommitを再build・配信する。再実行が利用できない場合は、mainを直前公開版の内容へ戻すrevert PRをレビュー・統合し、手動公開する。履歴の強制書換えはしない。配信後に`release.json`のcommitと同じsmokeを再確認する。自動保存がないためデータ移行は不要。

公開先への実配信はこの作業では実行していません。

## Windows Chrome実機確認（2026-10-10）

確認者はKKishikawa。非開発端末のWindows 11 Pro（25H2 26200.9457）でChrome 155.0.8059.40を使用し、MacBook Proから配信した`http://192.168.3.3:4172/`を操作しました。対象commitは`ba4aea80faac9214ad57a829dd8ff0dc0fc6c210`、versionは`0.1.0-dev.1`です。Windows上でのbuild・ホスト起動は確認範囲外です。

W2〜W4・W6〜W12は確認者の記録でOK。W1の凡例と盤面の記号の不一致、W5の選択中の入力旗の識別しづらさは[#22](https://github.com/KKishikawa/minesweeper-slv/issues/22)で修正・再確認を管理します。29枚の画像を[証跡ディレクトリ](evidence/manual-mvp-windows/2026-10-10/README.md)へ保存しました。ファイル名のずれ、W2/W12の重複、30列の小サイズが900×1080である点、9列×3サイズ・960×1080・表示領域/セル寸法の実測・Network画像の不足を記録しています。Edgeはversionのみ記録され、結果は未記録です。

利用上の指摘と改善仮説は[検証整理](manual-mvp-windows-feedback-2026-10-10.md)にまとめ、[#23](https://github.com/KKishikawa/minesweeper-slv/issues/23)（フォーカス復帰時の誤入力）、[#24](https://github.com/KKishikawa/minesweeper-slv/issues/24)（ちらつき調査）、[#25](https://github.com/KKishikawa/minesweeper-slv/issues/25)（解析限界の診断）、[#26](https://github.com/KKishikawa/minesweeper-slv/issues/26)（旗policyの説明）を起票しました。30×16・99地雷での限界到達は確認者報告であり、停止盤面と原因は未確定です。

#16はopenを維持します。全必須条件の合格、GitHub Pages実配信、公開後のHTTPS/サブパスでのsmokeは未完了です。改善でcommitが変わる場合は、影響ケースを新commitで再検証します。

## 依存関係の監査（2026-10-09）

`npm ci` / `npm audit`は既存の開発用依存にhigh 6件を報告しました。対象はVitest / @vitest/mocker、Vite / postcss / source-map-js、認識研究用sharpです。`npm audit --omit=dev`は0件でした。MVPは静的artifactのみを配信し、開発サーバーやtest fixtureを公開しません。

本実装では計画の固定lockfile方針に従い依存を更新していません。監査時点で自動修正版は提示されていません。開発ツールの公開・信頼できない入力の処理を行う前に各advisoryの影響と修正版を確認することを、残課題として記録します。

## GitHub Pages配信準備（2026-10-10）

公開先はユーザー指定のGitHub Pages。想定URLは`https://kkishikawa.github.io/minesweeper-slv/`です（未公開）。Pages設定のAPI確認は404で、既存サイトは確認できませんでした。設定変更とworkflow dispatchは未実施です。カスタムドメインとユーザーサイト直下の配信は本設定の対象外です。

[GitHubの公式手順](https://docs.github.com/ja/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)に従い、artifactのuploadとdeploy jobを分け、配信権限はdeploy jobだけに付与します。Actionsはcommit SHAで固定します。`github-pages` environmentのbranch制限をmainに設定し、利用可能ならrequired reviewerも設定します。手動入力のチェックは確認者の申告であり、実機検証の自動的な証明ではありません。

初回の公開後は実際のURLでWindows確認票のsmokeを実施し、日時・公開commit・workflow run URL・`release.json`・結果を本書へ追記します。公開前のローカルsmokeを配信後の結果として記録しません。

### 配信準備のローカル検証

2026-10-10、macOS・Node.js 22.12.0で新規worktreeへ`npm ci`を実行し、型検査、通常production build、全42ファイル・365テスト（384.37秒）、Pages用buildが成功しました。Pagesテストでは`/minesweeper-slv/`からJS/CSSと実Workerを取得し、3×1盤面の安全・地雷提案、rootへのasset要求がないこと、HTTPエラー・pageerrorがないことを確認しました。`actionlint` 1.7.12で公開ワークフローを検査し、指摘なしでした。これはGitHub Actions上の公開成功やWindows実機確認を意味しません。
