# Issue #16 Chromium補完証跡（2026-10-10）

確認者の合意によりWindows実機記録の表示・通信不足をMac上のPlaywright Chromiumで補完したものです。Windows再検証ではありません。

アプリ対象: `9b08c5fa8df3aea28d94b4635c70322f79deefc4`、version `0.1.0-dev.1`。アプリソースに差分なし。証跡出力を追加した `test/browser/release.test.ts` で通常production buildをローカル配信して検証しました。テスト側の差分は本証跡と同じ変更で保存しています。

実行: `npm run build` → `npm test -- test/browser/release.test.ts`、5件成功。環境・時刻は[environment.json](environment.json)、通信・保存記録は[network.json](network.json)。macOS (Darwin 27.0.0)、Node.js 22.12.0、Chromium 151.0.7922.34。DPR 2。

| 表示領域 CSS px | 列数 | セル CSS px | 情報欄 | 証跡 |
| --- | --- | --- | --- | --- |
| 1920×1080 | 9 | 40×40 | right | [1920-9.json](1920-9.json) / [画像](1920-9.png) |
| 1920×1080 | 30 | 29×29 | right | [1920-30.json](1920-30.json) / [画像](1920-30.png) |
| 1280×800 | 9 | 40×40 | right | [1280-9.json](1280-9.json) / [画像](1280-9.png) |
| 1280×800 | 30 | 29×29 | right | [1280-30.json](1280-30.json) / [画像](1280-30.png) |
| 960×1080 | 9 | 40×40 | right | [960-9.json](960-9.json) / [画像](960-9.png) |
| 960×1080 | 30 | 28×28 | below | [960-30.json](960-30.json) / [画像](960-30.png) |

全ケースで正方形・24 CSS px以上、盤面内部／ページ横スクロールなし、フォーカス枠を確認。画像はページ全体のため、表示領域より縦に長い場合があります。表示領域の実測はJSONを参照してください。

通信は同一originのHTML・JS・CSS・実WorkerのGETのみ、body・queryなし。HTTPエラー・要求失敗・pageerror・WebSocket・beaconなし。JS/WorkerとCSSのMIMEを確認。localStorage/sessionStorage/IndexedDB/Service Worker登録は0。初回・入力・矛盾修正・再読み込みを確認し、Tabによる設定・入力・policy・再解析・リセットも成功しました。beaconは送信前のフックで呼出有無を記録し、外部originの要求は記録したうえで遮断します。

Windows DevTools Issues 3件の過去の内容は不明のままです。公開URLの検証は別記録とし、このローカル結果を公開後smokeには流用しません。

保存ファイルのバイト数とSHA-256は[manifest.json](manifest.json)。
