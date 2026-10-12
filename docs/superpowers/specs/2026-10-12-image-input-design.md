# Issue #12: 画像入力の設計

日付: 2026-10-12
状態: 2026-10-12承認済み（P1/P2の3件を反映。実装前）
対象: https://github.com/KKishikawa/minesweeper-slv/issues/12

## 目的と完了条件

ファイル、貼り付け、ドラッグ＆ドロップ、画面共有から取得した画像を、ブラウザ内で共通の `PixelImage` に変換する。認識器がなくても画像のプレビュー、寸法、RGBA値と取得経路を検証できる。利用者は画像を見ながら既存の手動盤面入力を使える。

#10は完了済みであり、#6〜#8の認識研究を待たない。認識統合は#13で扱う。画像から盤面を生成する処理、画像のエクスポート、画像履歴、外部送信、自動保存、外部ゲームの操作は追加しない。

## 検討した構成

1. **画像取得コントローラーとブラウザアダプターを分離する（推奨）**。共通入力、競合制御、共有状態をDOMなしでテストし、CanvasやMediaStreamの実処理をChromiumで確認できる。既存のsolver-clientと同様に依存注入する。
2. UI内にブラウザAPIを直接実装する。ファイル数は少なくなるが、共有の終了・遅延・解放を自動検証しにくい。
3. 画像取得をWorkerへ寄せる。画面共有選択、貼り付けイベント、videoの管理にはDOM側が必要で、今回の取得処理だけでは転送境界を増やす利益が小さい。

案1を採用する提案とする。新しい実行時依存は加えない。

## 境界とデータ

- `src/image-input/types.ts`: 取得経路、画像取得結果、状態、型付きエラー、アダプターの契約。
- `src/image-input/browser.ts`: Blobのdecode、CanvasからのRGBA取得、画面共有とvideoの寿命管理。
- `src/image-input/controller.ts`: 画像保持、非同期結果の世代管理、共有セッション、操作の状態遷移。
- `src/ui/image-input.ts`: 入力操作、共有操作、プレビュー、利用者向け状態表示。
- `src/app/app.ts`: 画像入力パネルのmount/dispose。盤面状態やsolverへ画像を渡さない。

`PixelImage` は既存の `src/recognition/types.ts` の定義（width、height、Uint8ClampedArrayのdata）を再利用する。幅・高さは正の安全な整数、dataの長さは `width * height * 4` とする。画像取得コントローラーが最新の1枚だけ所有し、取得経路（file/paste/drop/display）と単調増加する画像revisionを付ける。ファイル名、trackラベル、画像内容を診断履歴に追加しない。

ブラウザアダプターはBlobからPixelImageを返す非同期decodeと、`startDisplay(signal: AbortSignal): Promise<DisplaySession>` を提供する。共有開始ごとにコントローラーがAbortControllerを所有し、開始待ち・共有中の停止、pagehide、disposeでabortする。共有セッションは現在フレーム取得、終了通知、冪等なdisposeを持つ。signalはセッション返却後もそのセッションの寿命に適用する。アダプターはstream取得直後から全trackとvideo準備処理の解放責任を持ち、セッション返却を待たずにabortで解放する。テストではこの境界をfakeへ置き換える。UIはDOM依存のイベントからBlobを選び、コントローラーの同じ取込操作へ渡す。

## ファイル・貼り付け・D&D

初期対応形式はPNG、JPEG、WebPとする。拡張子だけを信頼せず、MIMEが空の場合も含めてファイル先頭の形式署名を確認する。偽装・破損した内容はdecode失敗として扱う。SVG、GIF、HEICなどは非対応と表示する。

各操作につき最初の対応画像1枚を取り込む。複数の対応画像がある場合は1枚だけ取り込んだ旨を表示する。貼り付けとD&DはDataTransfer内の実ファイルのみを使い、HTMLや外部URLを画像として取得しない。

- ファイル選択: ラベル付きinputとファイル選択ボタン。同じファイルを再選択できるように操作後inputをリセットする。cancelでは直前の画像を保つ。
- 貼り付け: フォーカス可能な画像入力領域でCtrl+Vを受け付ける。clipboardDataのfile itemを取り出す。Clipboard APIによる読取許可や自動読取は追加しない。領域内のテキスト入力・編集可能要素の貼り付けは妨げない。
- D&D: 同じ領域でdragover/dropを扱う。取込領域外に画像ファイルが落とされた場合はページ遷移だけを防ぎ、取り込まない。リンクやテキストの通常操作は妨げない。

圧縮ファイルは20 MiB以下とする。全入力経路に共通の寸法上限として、幅・高さ各8,192以下かつ16,777,216画素以下を適用する。幅・高さが正の安全な整数であることも共通検証する。上限超過を自動縮小せず、画像が大きすぎる旨を案内する。ファイルではBitmap作成後、Canvas確保前に検証するため、ブラウザdecode自体の一時メモリを上限内へ保証するものではない。共有フレームでも、取得のたびに現在の寸法をCanvas確保・描画・RGBA読取の前に同じ関数で検証する。

createImageBitmapのdecodeパラメーターは既存の評価基盤に合わせ、imageOrientation=from-image、premultiplyAlpha=default、colorSpaceConversion=defaultを明示する。取得時に拡大縮小・再圧縮はせず、元の寸法でCanvasへ描画してRGBAを読む。CSSによるプレビュー縮小は元のPixelImageを変えない。アニメーションWebPの継続再生は対象外で、decodeされた静止フレームを使う。

## 画面共有

「画面共有を開始」のクリックから、awaitを挟まず `getDisplayMedia({video: true, audio: false})` を呼ぶ。共有元はブラウザの選択画面で利用者が選ぶ。HTTPSまたはlocalhostを前提とし、API不在・非secure環境では非対応の説明を表示して他の入力を残す。

取得したstreamについて、まずsignalの取消を確認する。取消済みなら全trackを停止し、videoの作成・接続・playへ進まない。取消されていなければ、以後のabortで即座に解放するhandlerを登録し、muted、playsInlineの非表示videoへ接続する。video.playの完了と初回のフレーム準備を待ってセッションを返す。この準備はstream取得後から10秒で打ち切り、共有元選択ダイアログの待ち時間には適用しない。

**初回のフレーム準備**では、`readyState >= HAVE_CURRENT_DATA`、videoWidth/videoHeightが正の整数、video trackがliveかつ非muteであることを確認する。準備済みなら即座に進み、未準備の場合だけloadeddata/canplay/playing/resizeとtrackのunmuteを監視して条件を再確認する。イベント登録後にも条件を再確認して取りこぼしを防ぐ。requestVideoFrameCallbackの通知を準備完了の必須条件にしない。ended、abort、videoエラー、準備タイムアウトでは待機を終了し、streamを解放する。準備中のmuteは未準備として扱い、期限内のunmuteを待てる。

**準備済みの現在フレーム取得**は「最新フレームを取得」の明示操作で行う。初回画像も自動では取り込まない。取得ごとにセッションが有効でtrackがlive・非muteであること、videoに現在フレームがあることを確認し、その時点のvideoWidth/videoHeightを読み、寸法検証からCanvas描画・RGBA読取までawaitを挟まず実行する。毎回同じstream/videoを使い、以前のPixelImageを再利用しない。ここでの「最新」はブラウザが取得時点でvideoに保持する現在フレームを意味し、クリック後の新規フレーム到着は待たない。静止した共有元でも、既に有効な現在フレームがあれば取得できる。

mute中は取得を不可とし、unmute後に現在フレームの条件を再確認して再開可能にする。現在フレームがない操作はread-failedとして直前の画像を保ち、再試行を案内する。共有中の解像度変更は取得ごとに再検証する。上限を超えた場合はtoo-largeを表示し、CanvasとRGBAを確保せず、直前の成功画像と共有セッションを保つ。共有元が上限内へ戻れば同じstreamから再取得できる。この上限はアプリのCanvas/RGBA確保を制限するもので、OSやブラウザが共有streamを生成・decodeするメモリを制限するものではない。

共有開始中は再度の開始を無効にし、「共有開始を取り消す」を表示する。共有中は開始ボタンを停止ボタンへ切り替える。共有終了後は再開始して共有元を選ぶ。共有状態は画像の取込状態と独立させるため、共有中でもファイル、貼り付け、D&Dを使える。画像のクリアは共有を停止しない。

## 状態・競合・エラー

画像状態はempty/loading/ready、共有状態はidle/requesting/active/endedを持つ。利用者向け操作結果は状態と別に持ち、失敗・キャンセルで最後の成功画像を失わない。

画像取込を始めるたびに操作番号を更新する。後から始めた操作だけが画像やメッセージを更新できる。Aのdecode中にBを選ぶ、共有フレームの取得中に画像を貼り付ける、クリア中にdecodeが終わる場合も古い結果を採用しない。共有の停止はそのセッションからの未完了取得を無効にするが、別のファイルdecodeは妨げない。

共有開始にも別の世代番号を持つ。世代番号は古い状態更新の拒否に使い、リソース停止は開始操作へ渡したAbortSignalで行う。開始待ち中の取消、pagehide、disposeではabortし、セッション未返却でも取得済みstreamの全trackを同期的に停止し、video準備のイベント・タイマーを解除する。startDisplayのPromiseは取消で速やかに終了させる。アダプター由来の取消はcancelledへ分類し、ブラウザ自身が返したAbortErrorとは区別する。

getDisplayMediaにはこのAbortSignalを渡せず、共有元選択ダイアログやそのPromiseを確実に取り消せない。そのためアダプターは元のPromiseの成功・失敗経路を監視し続ける。取消後に遅れてstreamが返ったら、video準備へ進む前に全trackを停止する。遅いrejectも処理し、未処理Promise rejectionを出さない。video.playなど取消できない準備Promiseが後から完了しても、共有を復活させず、解放済みvideoへ再接続しない。

| 事象 | 分類・表示方針 |
| --- | --- |
| ファイル選択のcancel、アプリ側の開始取消 | cancelled。取込しなかった旨を表示 |
| 利用者の停止ボタン、ブラウザ側の共有停止 | stopped。共有停止を表示し、最後の取得画像を保持 |
| getDisplayMediaのNotAllowedError | permission-declined。「共有がキャンセルされたか、許可されませんでした」 |
| API不在、非secure環境、NotSupportedError | unsupported。ファイル・貼り付け・D&Dを案内 |
| NotFoundError | source-unavailable。共有可能な画面がない旨を表示 |
| InvalidStateError | activation-required。開始ボタンからの再試行を案内 |
| NotReadableError、AbortError、その他の共有失敗 | capture-failed。共有開始失敗として再試行・代替入力を案内 |
| decode、Canvas読取、フレーム待機の失敗 | read-failed。画像またはフレームの読込失敗を表示 |
| 形式非対応、画像なし、容量・寸法超過 | unsupported-format/no-image/too-large。理由を表示 |

キャンセルと権限拒否はブラウザが同一例外を返す場合があるため、推測で分離しない。共有停止や読込失敗とは明確に分ける。例外のmessageをそのままUIや診断へ出さず、既知の分類から日本語文言を生成する。

## リソースの解放

- ファイルdecodeで作るImageBitmapは成功・失敗・古い結果のすべてでfinallyからcloseする。
- 取得用Canvasは一時使用とし、読取後に幅・高さを0へ戻す。Object URLは使用しない。
- 共有の停止・track終了・video準備失敗・abort・disposeで、セッション返却前も含めて取得済みstreamの全trackを停止する。videoをpauseし、srcObjectをnullへ戻し、準備用イベント・タイマー・abort handlerを解除する。解放は冪等にする。取消後に返るstreamもvideo接続前に停止する。
- pagehideで共有を停止し、未完了取込を無効化して画像とプレビューを消す。bfcacheから復帰しても共有を自動開始しない。
- mountAppのdisposeでも同じ解放を行い、繰り返し呼んでも問題ない契約にする。遅れて完了する処理の解放責任は完了経路にも残す。
- 画像の置換・クリア・disposeでは以前のPixelImageへの参照を外し、プレビューCanvasをクリアする。入力Blobや以前の画像の履歴は保持しない。

## UIと既存機能への接続

盤面設定の前に、折りたたみ式の「画像を取り込む（任意）」パネルを追加する。初期状態は閉じ、開いた領域に入力操作、共有操作、取得画像のプレビュー、寸法、取得経路、「画像をクリア」をまとめる。

「画像は表示のみです。盤面を自動入力する機能はまだありません」と常時案内する。取得した画像は手動盤面入力の参照用であり、盤面やUndo/Redo、solverのrequestIdを変更しない。

プレビューCanvasは全幅に収めて縦横比を維持し、最大高さ320 CSS pxにする。寸法と取得経路をテキストでも表示する。入力領域、ボタンにラベルと見えるフォーカスを付け、状態表示はrole=status/aria-live=politeを使う。共有中かどうかは文字でも表示する。

共有中にパネルを閉じても共有を停止できるよう、summaryに共有状態を表示し、パネル外にも共有停止ボタンを置く。取得画像の内容をaltテキストとして自動推測しない。

UIの通信・保存説明、footer、README、docs/project/product.mdとprivacy.mdを実装時に更新する。「画像入力未対応」の現在説明を実装に合わせ、画像・盤面の外部送信なし、画像は最新1枚のみメモリ保持、共有は明示停止可能、自動保存なしと記す。過去のMVP公開記録は変更しない。mainへの実装統合とPagesへの配信は区別し、今回は公開を含めない。

## 自動テストと手動確認

**コントローラー単体テスト**: fakeアダプターと制御可能なPromiseで、入力経路の共通decode、最後の操作優先、失敗時の成功画像保持、クリア/dispose後の遅延結果拒否、共有開始回数、同一セッションの反復取得、停止と外部ended、遅れて返るstreamの解放、すべてのエラー分類を確認する。待機時間はfake timerを使う。

**ブラウザアダプター単体テスト**: Bitmap/Canvas/video/streamの境界を注入し、成功・失敗時のclose/stop、Canvas確保前の寸法制限、event/callback解除、mimeと署名の判定を確認する。

**共有開始途中の取消テスト（P1）**: getDisplayMedia待ち、stream取得後のplay待ち、初回フレーム待ちの各段階で、開始取消・pagehide・disposeを発生させる。取得済みの全trackがセッション返却を待たず停止すること、videoの参照・イベント・タイマーが解放されることを確認する。取消後にgetDisplayMediaをresolveした場合はvideoを作成・接続・playせずtrackを停止し、rejectした場合も未処理rejectionを出さない。取消後にplayが完了する場合、準備完了とabortが競合する場合もactiveや画像更新へ進まない。

**静止フレームのテスト（P2）**: HAVE_CURRENT_DATA以上で寸法が有効なvideoが新しいフレーム通知を一切出さなくても、初回準備が完了し、複数回の取得が待機・タイムアウトなしで成功することを確認する。未準備videoはloadeddata等で準備できることと、10秒で失敗・解放することを分けて検証する。mute中は拒否し、unmute後は条件を再確認する。

**共有の寸法上限テスト（P2）**: 幅・高さ・画素数の上限値と超過、ゼロ・不正寸法を検証する。上限内で取得した後、同じセッションのvideoを8K相当の7,680×4,320へ変更し、too-largeとなること、Canvas確保・描画・RGBA読取が呼ばれないこと、前の画像とrevisionを保つことを確認する。上限内に戻した次の取得は同じセッションで成功する。

**Chromium E2E**: 実際のPNG/JPEG/WebPを使い、ファイル選択、paste event、drop eventから同じ寸法・RGBAが得られること、破損・非対応・複数画像、同じファイルの再選択、プレビューとクリア、既存の盤面とsolverに影響しないことを確認する。共有元選択（getDisplayMedia）のみをfakeへ置換し、実アダプターのvideo/Canvas処理へcanvas.captureStreamを渡す。変化するstreamから異なる現在フレームを取得するケースに加え、captureStream(0)とrequestFrameで初回の1枚だけ送り、その後の送出を止めたstreamでも反復取得できるケースを確認する。共有中にcanvasの寸法を変えて次のフレームを送り、videoの解像度変更と再取得も確認する。巨大画像の確保を避ける上限超過ケースは単体テストのfake videoで検証する。外部ended・pagehide・dispose、代替入力の残存も確認する。fakeがOSの共有選択を検証したとは扱わない。

**通信・保存**: production buildの画像操作で外部送信が増えないこと、ブラウザ保存領域へ画像が残らないこと、診断JSONへ画像やファイル名が入らないことを確認する。

**Windows Chrome手動確認**: 実際の共有元選択、選択キャンセル、ウィンドウ/タブの最新フレーム、ブラウザ側の停止、ページ離脱後の共有表示終了、OSからの画像貼り付け、エクスプローラーからのD&Dを記録する。自動テストだけで手動確認済みとはしない。

新規test/image-inputとtest/browserは既存CI分類のproductに入る。対象テスト、typecheck、production build、productの既存ブラウザ回帰を実行する。認識コードを変えない限り、正式な認識再評価は不要。

## 受け入れ条件との対応

| Issue #12の条件 | 検証 |
| --- | --- |
| 対応画像ファイルを共通入力へ変換 | 実画像の寸法とRGBAをChromiumで検証 |
| 貼り付けとD&Dが同一処理経路 | fake decodeへの委譲と実画像の結果一致 |
| 同じstreamから最新フレーム | 開始1回・複数取得、変化するstreamのRGBA比較と送出停止後の現在フレーム取得 |
| 停止・拒否・非対応時にも代替入力 | 状態表示と代替入力のE2E |
| streamと一時リソースの解放 | 正常・失敗・準備中の取消・遅延・ページ離脱・disposeの解放検証 |
| ブラウザ境界を抽象化した自動テスト | コントローラー/アダプターのfakeとChromium実処理の併用 |

## 根拠

- [現行ロードマップ](../../project/roadmap.md)
- [製品定義](../../project/product.md)
- [ローカル処理のADR](../../decisions/0001-process-data-locally.md)
- [認識採用との分離](../../decisions/0008-decouple-product-core-from-recognition-adoption.md)
- `src/recognition/types.ts`、`src/app/app.ts`、`test/recognition/browser-derive.ts`、`test/browser/harness.ts`
- [W3C Screen Capture](https://www.w3.org/TR/screen-capture/): 明示的な共有選択、利用者操作、permission failureのNotAllowedError。
- [requestVideoFrameCallback仕様](https://wicg.github.io/video-rvfc/): 新しいフレームが合成へ渡される際の通知であり、既存の現在フレームを読むための必須条件にしない。
- [HTMLのmedia ready states](https://html.spec.whatwg.org/multipage/media.html#ready-states): 現在フレームの利用可否をHAVE_CURRENT_DATAで確認する。

## レビュー反映（2026-10-12）

- P1: 開始操作のAbortSignal、準備中の即時解放、取消後に返るstreamの停止と各タイミングのテストを追加。
- P2: 初回準備と現在フレーム取得を分離し、次のフレーム通知を待たない取得と送出停止streamのテストを追加。
- P2: 全経路共通の寸法上限、共有中の毎回の検証、解像度超過時の画像保持と回復のテストを追加。
