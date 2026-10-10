# GitHub Pages初回配信・公開後smoke（2026-10-10）

公開URL: https://kkishikawa.github.io/minesweeper-slv/

公開version: `0.1.0-dev.1`、commit: `d292654d98e90a277582f2e1e0bf844d043ca970`。取得した[release.json](release.json)とテストの指定commit・ローカルpackage.jsonのversionが一致しました。

[公開workflow run](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38021268430)のbuild・deployが成功。型検査・通常build・全43ファイル369テスト（740.15秒）・Pages buildを通過して配信されました。[workflow.json](workflow.json)にrunの時刻とcommitを保存しています。PagesはActions配信、HTTPS強制、github-pages environmentはmain限定です。

公開後smokeは2026-10-10 15:22 JSTにMac上のPlaywright Chromium 151.0.7922.34で実行し、5件成功（4.78秒）。実URLのHTTPS・サブパスから実Workerで解析しました。

```sh
RELEASE_URL=https://kkishikawa.github.io/minesweeper-slv/ \
RELEASE_COMMIT=d292654d98e90a277582f2e1e0bf844d043ca970 \
RELEASE_ARTIFACTS=test/artifacts/pages-smoke \
npm test -- test/browser/release.test.ts
```

- 3×1・1地雷・左0から安全S／地雷Mの提案、3×1・2地雷の矛盾→再入力による復帰に成功。
- Tabだけで設定・盤面入力・旗policy・再解析・リセットを完了。
- 9列／30列×1920×1080・1280×800・960×1080で正方形・24 CSS px以上、盤面内部／ページ横スクロールなし、可視フォーカス、右／下の情報欄配置を確認。
- 同一origin・同一サブパスのHTML／JS／CSS／実WorkerのGETのみ、body・queryなし。JS／WorkerとCSSのMIMEに問題なし。HTTPエラー・要求失敗・pageerror・WebSocket・beaconなし。
- 初回・入力・矛盾修正・再読み込みでlocalStorage／sessionStorage／IndexedDB／Service Worker登録は0。再読み込みで9×9初期盤面へ復帰。

環境は[environment.json](environment.json)、通信・保存境界は[network.json](network.json)。6通りの寸法JSONとページ全体画像も保存しています。画像は表示領域より縦に長い場合があるため、実測は対応するJSONを参照してください。ファイルのバイト数とSHA-256は[manifest.json](manifest.json)。

公開版のアプリソースと依存はローカル補完証跡の対象`9b08c5fa8df3aea28d94b4635c70322f79deefc4`と一致し、差分は検証・workflow・文書だけです。Windows実機の過去記録と合意済みMac Chromium補完を組み合わせた出荷判定です。Windows上で公開URLを再検証したという記録ではありません。

初回公開のため直前の公開版はありません。今後のロールバック基準として、この成功runとcommitを保存します。
