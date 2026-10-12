# Issue #12: 表示専用の画像入力と検証記録

記録日: 2026-10-13。対象は `d-d` ローカル作業版です。ファイル・貼り付け・ドロップ・画面共有から取得した画像を表示する実装とChromium自動検証まで進んでいます。Windows Chrome手動確認、mainへの統合、GitHub Pagesへの配信は未完了です。Issueのclosed状態や公開済みバージョンの機能を、この記録で変更したとは扱いません。

[承認済み設計](../superpowers/specs/2026-10-12-image-input-design.md)と[実装計画](../superpowers/plans/2026-10-12-image-input.md)にもとづきます。認識コードは変更せず、盤面の自動入力はIssue #13へ分離しています。2026-10-10の[手動MVP公開記録](manual-mvp-release.md)と証跡は、その時点の事実として残しています。

## 利用できることと保持範囲

「画像を取り込む（任意）」でPNG・JPEG・WebPを選択できます。同じ領域にフォーカスしてCtrl+V / ⌘Vで画像を貼り付けたり、画像ファイルをドロップしたりできます。HTMLや外部URLは取得しません。複数の対応画像では最初の1枚だけを使います。

ファイルの上限は20 MiBです。全入力経路で各辺8,192px以下、16,777,216画素以下を検証し、取得用Canvasを確保する前に寸法超過を拒否します。ブラウザのファイルdecodeやOSの共有stream生成に必要な一時メモリまで、この上限で保証するものではありません。画像を自動縮小・再圧縮せず、元寸法でRGBAを取得します。プレビューの表示だけを縮小します。

画面共有はHTTPSまたはlocalhostの対応環境で利用者が開始し、ブラウザの共有元選択を使います。「最新フレームを取得」はブラウザがその時点で保持する現在フレームを取得し、新規フレームの到着を待ちません。共有元選択の待機にはタイムアウトを設けず、stream取得後のvideo準備は10秒を上限とします。

**画像は表示のみです。盤面を自動入力する機能はまだありません。** 画像を参照して手動入力します。画像操作だけで盤面・Undo/Redo・solver実行を変更しません。

最新1枚だけをページ内メモリに保持します。取込失敗・キャンセルでは最後の成功画像を保ちます。画像クリアは共有を継続し、共有停止は最後の取得画像を残します。閉じたパネルの外側でも停止できます。ページ離脱・disposeでは共有と未完了操作を終了し、画像・プレビューを解放します。外部送信・自動保存・画像履歴・画像エクスポートはありません。診断JSONに画素・ファイル名・共有元のラベルを含めません。[通信・保存の説明](privacy.md)も参照してください。

## 自動検証

環境はmacOS（Darwin 27.0.0、arm64）、Node v22.12.0、Playwright Chromium / Google Chrome for Testing 156.0.8078.4です。productionテストはローカルHTTPのVite previewで生成済みの `dist` を使用します。localhostはsecure contextとして使えますが、GitHub PagesのHTTPS配信を検証したものではありません。

| 対象 | コマンド | 結果 |
| --- | --- | --- |
| Task 5の画像UI・共有video/Canvas | `npx --no-install vitest run test/browser/image-input.test.ts test/browser/display-input.test.ts` | 2026-10-12: 2 files / 14 tests passed、10.81秒 |
| Task 5時点の製品全体 | `npm run test:ci -- product` | 2026-10-12: 38 files / 396 tests passed、49.69秒、exit 0 |
| Task 6の型チェック | `npm run typecheck` | 2026-10-13: exit 0 |
| Task 6の本番ビルド | `npm run build` | 2026-10-13: exit 0。案内更新後に再生成 |
| Task 6の追加productionとprivacy | `npx --no-install vitest run test/browser/image-input-production.test.ts test/browser/privacy.test.ts` | 2026-10-13: 2 files / 5 tests passed、最終2.77秒、exit 0 |
| Task 6レビュー修正後のproductionとfixture依存UI | `npx --no-install vitest run test/browser/image-input-production.test.ts test/browser/image-input.test.ts test/browser/display-input.test.ts` | 2026-10-13: 3 files / 16 tests passed、12.87秒、exit 0 |
| 最終レビューの取消通知修正後の画像・共有UI | `npx --no-install vitest run test/browser/image-input.test.ts test/browser/display-input.test.ts` | 2026-10-13: 2 files / 15 tests passed、11.99秒、exit 0 |
| 同修正後のcontroller回帰・型検査 | `npx --no-install vitest run test/image-input/controller.test.ts` / `npm run typecheck` | 2026-10-13: 22 tests passed、型検査exit 0 |
| 最終状態の型検査・本番ビルド | `npm run typecheck` / `npm run build` | 2026-10-13: 両方exit 0。通知修正後のbuild `index-BHjVprVw.js` |
| 最終状態の製品全体 | `npm run test:ci -- product` | 2026-10-13: 39 files / 400 tests passed、51.06秒、exit 0。失敗・skip 0件 |
| 差分の書式 | `git diff --check` / `git diff --cached --check` | 2026-10-13: 出力なし、exit 0 |

最終状態の製品全体結果は `test/artifacts/ci/product/vitest.json` と `metadata.json` に保存されています。上表の途中段階の件数と最終400件を区別しています。Task 6レビュー修正では画像保持中の境界を追加し、診断OFFでも実Workerへの送信requestIdを記録するfixtureへ修正しました。通知修正後に型検査・本番ビルドと全productを再実行し、400件成功を確認しました。認識コードに変更がないため、正式認識評価は再実行していません。

追加テストのREDでは、旧footerと通信ダイアログの「画像入力には対応していません」が原因で2件が失敗しました。案内更新と本番ビルド後に5件成功しています。

### 検証した境界

- productionの実PNGでfile・paste event・drop eventから取り込み、4×3の寸法と赤RGBAを確認。クリア、共有API不在の代替案内、手動盤面編集、再読み込みも実施。
- 初回表示から再読み込みまでのリクエストは同originのHTML・CSS・JavaScript・Workerの静的GETのみ、bodyなし。外部リクエストは記録した上で遮断し、requestfailedも0件。beaconとWebSocketは0件。
- file・paste・dropの各取込完了直後、画像を保持した状態でlocalStorage・sessionStorage、IndexedDBデータベース、Service Worker登録が0件と確認。初期、手動編集、クリア、再読み込み後も確認し、クリアと再読み込み後のプレビュー寸法は0。
- 診断ONの解析1件はfile取込だけでは増えない。file画像を保持して明示再解析すると2件目を記録し、画像関連キー・ファイル名がない。paste・dropだけでは2件を維持し、drop画像を保持して手動編集したときに3件目を記録する。クリアでは件数・entriesを変更しない。
- 制御可能な画像入力fixtureでは共有元選択だけを置き換え、実MediaStream・video・Canvasで共有フレームを取得。画像取込・共有取得だけでは盤面DOM、solverの送信requestId列、Undo/Redoの分岐、診断0件を維持。その後、共有trackがliveで取得画像を保持した状態で明示再解析し、JSONに画像関連キー・ファイル名・非空の実trackラベルがないと確認。停止・クリア・Redoでも、この明示解析後のrequestIdとentriesを維持する。
- privacyダイアログの案内、フォーカス復帰・キーボード操作・375px幅の境界を確認。更新後の狭幅スクリーンショットを目視確認し、長い説明はダイアログ内でスクロールする。

paste/drop eventや共有元選択を置き換えたfixtureは、OS clipboard、Explorer、OSの共有元選択ダイアログを確認したものではありません。productionでの共有検証はAPI不在の分岐です。実共有の手動確認は下記に残しています。

## Windows Chrome手動確認票

全行未実施です。このMacワークスペースから対象のWindows実機を操作できず、自動テストで代用したとは扱いません。実施時は各行にWindows版、Chrome版、対象URL・ビルド/commit、確認日・確認者、結果と必要な証跡を追記してください。公開URLを確認する場合は、そのURLに画像入力が配信されているか先に確認します。

| 確認項目 | 環境 | 手順 | 期待結果 | 実施結果 |
| --- | --- | --- | --- | --- |
| 共有元選択 | Windows Chrome、HTTPSまたはlocalhost。版・対象ビルドは未記入 | 画像パネルを開き「画面共有を開始」。選択画面で共有元を選ぶ | 利用者のクリックから選択画面が開き、選択後に「共有中」。画像は自動取得しない | ☐ 未実施 |
| 選択キャンセル | 同上。版・対象ビルドは未記入 | 成功画像を保持した状態で共有を開始し、ブラウザの選択画面をキャンセル | キャンセルまたは未許可の案内。成功画像・手動盤面を保持し、再開始可能 | ☐ 未実施 |
| タブ取得 | 同上。版・対象ビルドは未記入 | Chromeのタブを共有し、内容変更前後に「最新フレームを取得」 | 各取得時点のタブ画像が表示され、寸法・経路を表示。盤面は変化しない | ☐ 未実施 |
| ウィンドウ取得 | 同上。版・対象ビルドは未記入 | 別ウィンドウを共有し、内容変更前後にフレーム取得 | 現在の画像を更新でき、共有セッションを継続。盤面は変化しない | ☐ 未実施 |
| 静止画面取得 | 同上。版・対象ビルドは未記入 | 共有元を静止させ、画面変更なしで同じ画像を複数回取得 | 新規フレームの到着待ちで停止せず、現在画像を反復取得できる | ☐ 未実施 |
| ブラウザ側の共有停止 | 同上。版・対象ビルドは未記入 | フレーム取得後、Chromeの共有表示から停止 | アプリも共有終了を表示。最後の成功画像を保持し、再開始可能 | ☐ 未実施 |
| ページ離脱 | 同上。版・対象ビルドは未記入 | 共有中に別ページへ移動。戻る操作でも確認 | OS/Chromeの共有表示が終了。復帰しても共有を自動開始せず、画像を消去 | ☐ 未実施 |
| OS画像貼り付け | Windows Chrome、Windows clipboard。版・対象ビルドは未記入 | OSで画像をコピーし、画像入力領域にフォーカスしてCtrl+V | 対応画像を表示して経路が貼り付けとなる。盤面・Undo/Redoは変化しない | ☐ 未実施 |
| Explorer D&D | Windows Chrome、Explorer。版・対象ビルドは未記入 | Explorerから対応画像を領域内へドロップ。領域外にもドロップ | 領域内は画像を表示して経路がドロップ。領域外は取込もページ遷移もしない | ☐ 未実施 |

## 残る事項とGit

最終レビューで指摘されたファイル選択cancel通知の上書きは修正済みです。UI側で取消通知を保持し、共有開始・停止などの状態更新では維持します。画像の取込・フレーム取得・クリア、進行中の画像操作の完了では通常の通知に戻します。controllerのAPI・世代管理・decode・共有寿命は変更していません。追加のChromium回帰テストは修正前に共有開始後の通知上書きで失敗し、修正後は通知の維持、成功画像の保持、後続操作の通知更新を確認しました。修正差分の再レビューも承認済みで、上表の最終製品テスト400件も成功しています。

既存baselineにもあるResizeObserver warningは今回の修正対象に含めていません。Task 5のproductはwarningを含みつつ成功しています。今回のfocused検証にはwarningはありません。最終product実行でも同種の既存warningが出ていますが、400件すべて成功しています。

最終レビューと修正の再レビューは完了しています。実装は署名ブロックを持つcommit `04aa7e5` に記録済みです。当初の署名操作はagentに拒否されましたが、署名設定（`commit.gpgsign=true`、`gpg.format=ssh`）を無効化する回避は行っていません。Windows確認、mainへのPR統合、Pages配信は未完了です。

2026-10-13に最新の `origin/main`（`9568bc3`）を作業ブランチへ競合なく取り込みました。統合後の型検査・本番ビルド、製品テスト400件、グリッド関連3ファイル65件、grid-compatibility 2ファイル7件はすべて成功しています。
