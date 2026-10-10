# 手動入力MVP Windows実機確認票

Issue #16のWindows Chrome実機検証記録です。2026-10-10にKKishikawaが操作・確認し、結果と証跡を記録しました。当時W1・W5に表示上の指摘がありました。#22の修正後は下記のChromium確認で表示指摘を解消しています。出荷確認全体も、合意済みのChromium補完とGitHub Pages公開後smokeを含めて完了しました。結果の整理、証跡の限界、改善仮説は[検証整理](manual-mvp-windows-feedback-2026-10-10.md)を参照してください。

## 対象と実行環境


| 項目                      | 記録                                                   |
| ----------------------- | ---------------------------------------------------- |
| 実施日時・確認者                | 2026-10-10 KKishikawa                                |
| 対象commit（完全なSHA）        | ba4aea80faac9214ad57a829dd8ff0dc0fc6c210             |
| アプリversion              | 0.1.0-dev.1（実行時に照合）                                  |
| Windows version / build | Windows 11 Pro (25H2 26200.9457)                     |
| Chrome version          | 155.0.8059.40（chrome://versionで確認）                   |
| Edge version（参考確認）      | 155.0.4283.45                                        |
| 確認URL                   | [http://192.168.3.3:4172/](http://192.168.3.3:4172/) |
| 配信方式・ホスト                | LAN内配信。MacBook Pro 14インチ (M3) Golden Gate (27.0.1)   |
| 確認端末                    | Windows端末（非開発端末）。Macから配信されたアプリをChromeで操作・確認する        |
| 画面倍率 / Windows表示スケール    | FHD, 100%                                            |


この確認の対象は、Windows上のChromeでのアプリの操作・表示・通信です。Windows端末は非開発端末として利用し、buildと静的ファイルの配信はMacで行います。Windows上での開発環境構築・build・ホスト起動は確認範囲に含めません。

再現時はMac上で対象commitをcheckoutし、Node.jsは`.node-version`に合わせます。`npm ci` → `npm run typecheck` → `npm run build` → `npm run preview -- --host 0.0.0.0 --port 4172 --strictPort`を実行します。同じLAN内のWindows端末から、Chromeで`http://192.168.3.3:4172/`を開きます。これは公開前のLAN配信による実機確認であり、公開後のHTTPS URLでの確認は別途実施します。自動テスト用Chromiumの結果をWindows Chromeの結果として転記しません。

## 操作と期待結果

各ケースでは「幅」「高さ」「総地雷数」を設定し「盤面を作成」を押します。座標は行・列とも1始まりです。提案によって観測値が書き換わらないことも確認します。


| ID  | 操作                                                        | 期待結果                                               | 結果・証跡                                    |
| --- | --------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| W1 | 初回表示 | 日本語画面、9×9・10地雷。操作説明と状態が読める | 実施・指摘あり：凡例と盤面の記号が違う（[#22](https://github.com/KKishikawa/minesweeper-slv/issues/22)）。初期画面の参考は[w12.png](evidence/manual-mvp-windows/2026-10-10/w12.png)。[w1.png](evidence/manual-mvp-windows/2026-10-10/w1.png)はW2の内容 |
| W2 | 3×1・1地雷。行1列1を選択して0を入力 | 「確定した手があります」。列2に安全S、列3に地雷M。列2・3の観測は閉じたまま | OK（確認者記録）。内容一致の証跡は[w1.png](evidence/manual-mvp-windows/2026-10-10/w1.png)。[w2.png](evidence/manual-mvp-windows/2026-10-10/w2.png)はW12と同一画像 |
| W3 | 3×1・2地雷。列2に1、続いて2を入力 | 1では「盤面に矛盾があります」、提案なし。2へ修正すると列1・3に地雷M | OK（確認者記録）。[w3-1.png](evidence/manual-mvp-windows/2026-10-10/w3-1.png) → [w3-2.png](evidence/manual-mvp-windows/2026-10-10/w3-2.png) |
| W4 | 2×1・1地雷、全セルを閉じたまま | 「推測が必要です」。同率候補の?を表示。矛盾として表示しない | OK（確認者記録）。[w4.png](evidence/manual-mvp-windows/2026-10-10/w4.png) |
| W5 | 3×1・1地雷。列1に0、列2にF。既定の旗尊重から「入力旗を再検討する」へ切り替える | 尊重では矛盾、再検討では列2に安全S・列3に地雷M。列2の入力旗は残り、solver提案と区別できる | 実施・指摘あり：選択中は左上の入力旗の印を見分けにくい（[#22](https://github.com/KKishikawa/minesweeper-slv/issues/22)）。[w5-1.png](evidence/manual-mvp-windows/2026-10-10/w5-1.png) → [w5-2.png](evidence/manual-mvp-windows/2026-10-10/w5-2.png) |
| W6 | W5の盤面で尊重を選び、自動再検討を有効にする | 再検討して提案を表示する。再解析・リセット後も操作できる | OK（確認者記録）。[w6.png](evidence/manual-mvp-windows/2026-10-10/w6.png) |
| W7 | 9×9でパレットとクリック、矢印と0・Space・F・Delete・1〜8を使い入力・修正 | 全セル種別へ編集可能。選択枠とフォーカスが見える。数字8の局所矛盾は中央セルで確認する | OK（確認者記録）。[w7.png](evidence/manual-mvp-windows/2026-10-10/w7.png) |
| W8 | Tabのみで設定→作成→盤面→旗policy→再解析→リセットへ移動 | マウスなしで操作可能。矢印でセル移動。リセットで観測と旧提案が消える | OK（確認者記録）。[w8.png](evidence/manual-mvp-windows/2026-10-10/w8.png)（静止画はTab移動・リセット全経路の証明ではない） |
| W9 | セルにフォーカスしてCtrl+C / Ctrl+F / Ctrl+Spaceを操作。Ctrlを押してセルをクリック | セルの観測を変更しない。ブラウザのショートカットを妨げない | OK（確認者記録）。[w9.png](evidence/manual-mvp-windows/2026-10-10/w9.png)（操作結果は確認者記録による） |
| W10 | 解析中を含め連続編集し、盤面を再作成する | 旧盤面の提案が新盤面へ戻ってこない。観測と提案が一致する | OK（確認者記録）。[w10-1.png](evidence/manual-mvp-windows/2026-10-10/w10-1.png)、[w10-2.png](evidence/manual-mvp-windows/2026-10-10/w10-2.png) |
| W11 | 幅0、31、非整数、総地雷数がセル数を超える設定で作成を試す | 不正設定を拒否し、既存盤面を壊さない。正しい設定へ直すと作成できる | OK（確認者記録）。[w11-1.png](evidence/manual-mvp-windows/2026-10-10/w11-1.png)、[w11-2.png](evidence/manual-mvp-windows/2026-10-10/w11-2.png)、[w11-3.png](evidence/manual-mvp-windows/2026-10-10/w11-3.png)、[w11-4.png](evidence/manual-mvp-windows/2026-10-10/w11-4.png)、[w11-5.png](evidence/manual-mvp-windows/2026-10-10/w11-5.png) |
| W12 | 入力後にページを再読み込み | 9×9初期盤面へ戻る。盤面を自動保存していない | OK（確認者記録）。[w12.png](evidence/manual-mvp-windows/2026-10-10/w12.png) |


探索上限とWorkerエラーは自動テストの注入ケースで検証済みです。実機で自然発生しなかった場合は実機確認済みとは記録しません。

## 表示・通信確認

ブラウザの表示領域を1920×1080、1280×800、960×1080相当に調整し、各サイズで9列と30列の盤面を確認します。画面全体と表示領域のサイズを混同せず、DevToolsで`window.innerWidth` / `window.innerHeight`を記録します。


| ID  | 項目                   | 期待結果                                                               | 結果・証跡 |
| --- | -------------------- | ------------------------------------------------------------------ | ----- |
| WV1 | 3表示サイズ × 30列 | 正方形セル、24 CSS px以上、Canvas内部スクロールとページ横スクロールなし。狭い幅では情報欄が下へ移動 | 30列はOK（確認者記録）。[wv1-l.png](evidence/manual-mvp-windows/2026-10-10/wv1-l.png)、[wv1-m.png](evidence/manual-mvp-windows/2026-10-10/wv1-m.png)、[wv1-s.png](evidence/manual-mvp-windows/2026-10-10/wv1-s.png)。画像の設定値は1920×1080／1280×800／900×1080。9列×3サイズ・960×1080・表示領域とセル寸法の実測は未記録 |
| WV2 | Windows表示スケールとフォーカス | 実際の表示スケールを記録。文字・S/M/?・入力旗・選択枠が識別できる | OKとの記録あり。ただしW5の入力旗の識別には指摘あり（#22）。[w5-2.png](evidence/manual-mvp-windows/2026-10-10/w5-2.png)、[w7.png](evidence/manual-mvp-windows/2026-10-10/w7.png) |
| WV3 | DevTools Console | 初回表示・編集・解析中に未処理エラーなし | OK（確認者記録）。[wv3-l.png](evidence/manual-mvp-windows/2026-10-10/wv3-l.png)のConsole出力は空。DevTools Issues 3件の内容は未記録 |
| WV4 | DevTools Network | 入力・解析時は同一originの静的JS/CSS/Workerのみ。盤面のAPI送信、WebSocket、beaconなし | OK（確認者記録）。[wv4.png](evidence/manual-mvp-windows/2026-10-10/wv4.png)は盤面のみでNetwork一覧は写っていない。通信の追跡可能な証跡は未記録 |
| WV5 | DevTools Application | アプリによるlocalStorage/sessionStorage/IndexedDBへの保存とService Worker登録なし | OK（確認者記録）。[wv5-1.png](evidence/manual-mvp-windows/2026-10-10/wv5-1.png)、[wv5-2.png](evidence/manual-mvp-windows/2026-10-10/wv5-2.png)、[wv5-3.png](evidence/manual-mvp-windows/2026-10-10/wv5-3.png)、[wv5-4.png](evidence/manual-mvp-windows/2026-10-10/wv5-4.png)、[wv5-5.png](evidence/manual-mvp-windows/2026-10-10/wv5-5.png) |


ブラウザ拡張の通信を区別できるクリーンなプロファイルを使います。公開後は実際のHTTPS URLでW2・W3・W8と通信・Worker取得を再確認します。公開先がサブパスの場合はそのURLで確認し、root配信の結果を流用しません。

## Issue #22 修正後のChromium確認（2026-10-10）

本件はWindows固有の不具合ではないため、確認者の合意によりChromiumでの確認を受け入れ条件とします。過去のWindows実機結果はそのまま保持し、修正版のWindows Chrome再確認は本件の完了条件から外します。

凡例は盤面と同じCanvas描画を使い、再検討中の入力旗と提案を左右に分けます。選択枠は外周に置き、凡例には入力旗が残ったまま提案を併記する意味と表示例を追加しました。

Mac上のPlaywright Chromiumで、`test/browser/legend.test.ts`の4ケースが成功しました。

- W1の表示指摘: 24 CSS pxの旗・丸のS・ひし形のM・四角の?について、凡例と盤面の描画ピクセルが一致することを確認。併記例と説明も画面で確認。
- W5の表示指摘: 3×1・1地雷、列1に0、列2にFを入力して再検討へ切り替え、旗と安全Sが共存することを確認。選択中・キーボードフォーカス中・別セル選択中でも旗の竿と三角形が残り、枠に隠れないことをスクリーンショットで比較。
- WV2に対応する表示検証: 24 CSS px、DPR 1と2で上記を確認。表示領域1130×1080・30列の実際のレスポンシブ配置でもセル幅24pxと旗・Sの併記を確認。

スクリーンショットは`test/artifacts/issue-22/`に出力します（テストで再生成、Git管理外）。型検査・production build・全43ファイル369テストも成功しました。#22の表示指摘はこの検証で解消として扱います。表示・通信の残記録は後述のChromium補完で確認済みです。実配信・公開後smokeも下記の記録で完了しています。

## 結果の扱い

実施済みの検証結果と、[証跡対応表](evidence/manual-mvp-windows/2026-10-10/README.md)を保存しました。改善課題は[#22〜#26](manual-mvp-windows-feedback-2026-10-10.md)に整理しました。#22のW1/W5の表示指摘は上記のChromium確認で解消しています。#16は表示・通信記録の補完、実配信・公開後smokeまで完了しています。

失敗時はID、操作、実際の結果、Console / Networkの情報、スクリーンショットを記録します。実行しなかったケースは未実施のまま残します。Windows実機記録と合意済みのMac上Chromium補完で必須ケースを満たし、公開・公開後smokeが完了するまで#16の出荷確認を完了扱いにしません。Edgeの参考結果はChromeと別に記録します。

実際の結果を本票と[リリース確認](manual-mvp-release.md)へ反映し、公開先・対象commit・配信後smokeの証跡を加えます。



&nbsp;

---

## 実操作を通して感じたフィードバック（確認者の原文）

整理とチケット対応は[検証整理](manual-mvp-windows-feedback-2026-10-10.md)を参照してください。

盤面入力時、キーボード中心入力するときに、以下の点が操作しにくい

- 盤面に入力フォーカスを戻すために盤面をクリックするが、クリック自体がフォーカス操作だけでなく、盤面への意図しない入力になってしまう。
  - PCでは、キーボード入力と、マウス・矢印キーによる移動で、スマホ・タブレットでは、タップ中心入力にするのがよさそう。スマホで触った感じでは、今の状態で入力しやすい。ただ、ショートカット入力情報は邪魔かも(スマホはできないし)。入力方式を切り替えるトグルスイッチを設けるのがいいのかもしれない。
  - 盤面へのキー入力を受け付ける領域を 02のカード全体に広げてもいいかもしれない。その場合、tab / enterはnativeでもいいかも

- 一回入力するたびに画面全体がちらつくのがかなり気になる。おそらくだが、盤面の各マスの描画自体もやり直しているからだと推測している。差分更新か、マスサイズはそのままで中の再描画だけにして、ページ全体の高さの変更が割り込まないように描画処理を工夫するのがいいと思う
- 実際の解析したいゲームは、幅30×高さ16 総地雷数99。進めている途中で、解析限界に到達してしまう。解けなくなる原因分析ができるように、ログ等を取る事ができる仕組みを用意しておきたい。解けるように改善を入れたいが、その原因分析のための詳細分析をする仕組みが無いと思っているよ。
- 入力旗を再検討する と 矛盾したときに入力旗を自動で再検討する は、ユーザからみて違いが分からなすぎる。同じことを言っているかのように見えている。アルゴリズムが違うのかもしれないけど、説明を正確にするか、どちらかは削ってしまうのがいい気がしている。後者だけ残すのがいいかもしれない。

## Issue #16 の残記録の補完方針（2026-10-10）

確認者の合意により、残る表示・通信の不足記録もMac上のPlaywright Chromiumで補完します。対象は9列／30列×1920×1080・1280×800・960×1080の寸法・画像、静的ファイルと実Workerの通信、保存境界です。過去のWindows実機記録とは環境・対象commitを分けて記録し、Windows再検証済みとは扱いません。未記録だったWindows DevTools Issues 3件の内容は不明のまま残します。

公開判定は、既存のWindows実機記録、#22のChromium確認、今回のChromium補完、公開後smokeを組み合わせます。公開workflowの申告項目もこの判定に合わせます。

補完結果: [Chromium証跡](evidence/manual-mvp-chromium/2026-10-10/README.md)。6通りの実測・画像、通信・保存記録、キーボードを含む5テストが成功しました。

公開後確認: [GitHub Pages証跡](evidence/manual-mvp-pages/2026-10-10/README.md)。2026-10-10 15:22 JST、Mac上Chromiumで実URLの5テストが成功しました。公開commitは`d292654d98e90a277582f2e1e0bf844d043ca970`です。
