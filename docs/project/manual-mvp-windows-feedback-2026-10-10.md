# Windows実機検証の整理と改善仮説（2026-10-10）

対象: `ba4aea80faac9214ad57a829dd8ff0dc0fc6c210` / `0.1.0-dev.1`。確認者: KKishikawa。Windows 11 Pro 25H2 / Chrome 155.0.8059.40。Macでbuild・LAN配信し、Windows端末で操作した。[確認票](manual-mvp-windows-checklist.md)に確認者が記録した結果と、提供された29枚の画像を整理した。

## 判定

Windows Chromeでの検証を実施済み。W2〜W4・W6〜W12は確認者がOKと記録。W1の凡例と盤面の記号、W5の選択中の入力旗の視認性には未解消の指摘がある。**全必須条件の合格・出荷確認完了とは扱わない**。#16はopenを維持し、#22の修正・再確認、表示・通信の不足記録の補完、GitHub Pages実配信と公開後smokeを残す。

静止画は操作経路、連続編集、通信の不在を単独で証明しない。これらの合否は確認者の操作記録に基づく。記録がない実測値や未実施の項目を補って合格にしない。Edgeはversionの記録のみで、結果は未記録。

## 証跡の保存と対応

[保存先と対応表](evidence/manual-mvp-windows/2026-10-10/README.md)に元画像29枚をコピーした。元ファイル名とバイト列を保持し、[manifest.json](evidence/manual-mvp-windows/2026-10-10/manifest.json)にSHA-256・寸法・サイズを記録した。合計4,840,657 bytes。Downloadsの元画像は変更していない。

- `w1.png`の内容は3×1・1地雷、左0・列2にS・列3にMで、W2に対応する。W1の初期9×9画面には`w12.png`を参考として使う（初回表示の操作自体を証明するものではない）。
- `w2.png`は`w12.png`とバイト単位で同一の9×9初期盤面。W2の証跡には内容が一致する`w1.png`を使う。
- WV1の30列画像のDevTools設定値は1920×1080、1280×800、**900×1080**。予定の960×1080や`window.innerWidth/innerHeight`の実測値としては転記しない。9列×3サイズ、960×1080、セル24 CSS px以上の実測は今回の画像から確認できない。
- `wv4.png`は盤面画像でNetworkパネルが写っていない。WV4は確認者のOK記録があるが、通信一覧・Worker取得を追跡できる画像/HARはない。
- `wv3-l.png`にはConsole出力がなく、DevTools Issuesの3件表示はある。未処理エラーなしの報告とIssuesなしは別であり、3件の内容は未記録。
- WV5の画像はService Worker、Cookie、IndexedDB、sessionStorage、localStorageに対応する。Cookieの空表示は補足証跡。

## フィードバックの分類と仮説

以下の原因調査は対象commitのソースを読んだ結果。Windowsでの再実行や性能計測、修正の効果測定は今回行っていない。優先順位は整理時点の提案であり、公開済み・修正済みを意味しない。

| 課題 | 観測・確認できた事実 | 仮説・次の検証 | チケット・優先度 |
| --- | --- | --- | --- |
| 凡例と入力旗の視認性 | W1/W5で指摘。凡例はUnicode文字、盤面はCanvas図形。旗の5×5の印を(x+2,y+2)に描き、その後の選択枠もx+2/x+4に描く | 凡例の記号と意味を一致させる。選択・フォーカスあり/なし、24 CSS pxのセルで旗と提案を色以外でも識別できるか再確認 | [#22](https://github.com/KKishikawa/minesweeper-slv/issues/22)。公開前の修正・再確認を優先 |
| フォーカス復帰で意図しない入力 | キーボード中心の利用でクリックが観測を変える。click処理は選択後に必ずパレット値でonEditする | 選択/フォーカスと入力を分ければ誤編集が減る仮説。入力方式切替・フォーカス専用操作を比較し、マウス/タッチの入力経路とW7〜W9を確認 | [#23](https://github.com/KKishikawa/minesweeper-slv/issues/23)。入力の誤変更を防ぐ改善を優先 |
| 入力時の画面のちらつき | 確認者報告。drawごとにCanvas寸法を再設定し全セルを描画。DOMセルの再作成は盤面寸法変更時だけ。solving/完了で結果文・件数も変わる | Canvasリセット、結果欄の高さ変化、複数の描画/ResizeObserverが候補。録画・描画回数・layout shift・スクロールを計測し一因ずつ比較する | [#24](https://github.com/KKishikawa/minesweeper-slv/issues/24)。原因調査を先に行う |
| 30×16・99地雷で解析限界 | 確認者報告。探索200,000ノードとWorker待機5秒の両方が理由なしのlimit-reachedになる。停止時の盤面全観測は未提供 | 制約成分の探索量、Worker起動・処理時間を分けて測る。まず停止理由・盤面・policy・訪問数・経過時間を明示操作でローカル取得し、再現fixture化する | [#25](https://github.com/KKishikawa/minesweeper-slv/issues/25)。診断整備後にsolver改善を比較 |
| 旗の2設定の違いが伝わらない | 常時再検討は最初から旗を未確定扱い。自動再検討は旗を地雷扱いして矛盾した場合だけ同じ再検討処理に切替。成立する誤旗では自動切替しない | 適用条件を具体例で説明すれば選択できる仮説。文言と選択肢構成を比較する。後者だけ残す案は成立する誤旗を再評価する経路を失うため未決定 | [#26](https://github.com/KKishikawa/minesweeper-slv/issues/26)。設定の理解を改善 |

参照: [board-editor.ts](../../src/ui/board-editor.ts)、[board-renderer.ts](../../src/ui/board-renderer.ts)、[app.ts](../../src/app/app.ts)、[state.ts](../../src/app/state.ts)、[solver-client.ts](../../src/app/solver-client.ts)、[solver/types.ts](../../src/solver/types.ts)。

スマホでは現状のタップ入力が使いやすいという所感もある。ただし正式なモバイル環境・確認ケースは未記録であり、対応保証は追加しない。02カード全体でのキー受付、Tab/Enterのnative動作、入力方式トグル、モバイルでのショートカット説明整理、差分描画は検証候補として保存し、採用を確定していない。確認者の原文は確認票の末尾に保持する。

## 出荷確認の残項目

- #22を修正し、Windows ChromeでW1/W5/WV2を再確認する。
- 9列×3サイズ・960×1080の実施範囲、表示領域の実測、24 CSS px以上の条件を記録する。
- Networkの同一originの静的JS/CSS/Worker、API送信・WebSocket・beaconなしの結果を追跡可能にする。
- GitHub Pages公開対象commitを記録し、公開後のHTTPS・サブパスでW2/W3/W8、通信・Worker取得を再確認する。
- 改善でアプリのcommitが変わる場合、既存の実機結果を新commitの合格へ流用せず、影響ケースを再検証する。
