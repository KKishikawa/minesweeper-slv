# Image Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ファイル・貼り付け・D&D・画面共有から最新1枚のPixelImageを取得し、認識器なしで参照画像として表示する。

**Architecture:** DOMから独立した画像入力コントローラーへ、Blob decodeと取消可能な共有開始を提供するブラウザアダプターを注入する。共有セッションはvideoとstreamを所有し、準備中もAbortSignalで解放する。画像入力UIは既存盤面・solverから独立させる。

**Tech Stack:** 既存のVanilla TypeScript、Vite、Vitest、Playwright Chromium、Canvas、createImageBitmap、getDisplayMedia。実行時依存を追加しない。

**Spec:** [承認済み設計](../specs/2026-10-12-image-input-design.md)

## Global Constraints

- PNG、JPEG、WebP。圧縮ファイルは20 MiB以下。
- 全入力経路で幅・高さ各8,192以下かつ16,777,216画素以下。正の安全な整数を検証し、Canvas確保前に拒否する。
- decodeはimageOrientation=from-image、premultiplyAlpha=default、colorSpaceConversion=default。元寸法でRGBAを取得し、自動縮小・再圧縮しない。
- 最新1枚だけをページ内メモリに保持。画像の外部送信、自動保存、画像履歴、エクスポートは追加しない。
- 画像取得で盤面、Undo/Redo、solverのrequestIdを変更しない。認識統合は#13。
- 共有開始のクリックからawaitなしでgetDisplayMedia({video: true, audio: false})を呼ぶ。
- 共有開始のvideo準備はstream取得後10秒。共有元の選択待ちにはタイムアウトを設けない。
- 有効な現在フレームは次の通知を待たずに取得。準備・停止・pagehide・disposeではsignalと世代番号を併用する。
- 開始取消後に返るstreamも全trackを停止する。既存のGit署名設定を維持する。
- Node.js >=22.12.0、正式な自動ブラウザ評価はChromium。Windows Chromeの実共有選択は手動確認として区別する。

## Review Focus

1. 拡張子/MIMEが空・誤っているファイルでも形式署名を確認し、破損内容はdecode失敗となる（Task 1/2）。
2. 混在・複数画像と同じファイルの再選択で、最初の対応画像1枚を処理し、入力操作を失わない（Task 1/4/5）。
3. 共有待ちの取消と再開始が重なっても、古いstreamの解放で新セッションを停止しない（Task 3/4）。
4. パネルを閉じた状態でも共有を停止でき、文字入力への貼り付けや領域外dropで誤取込しない（Task 5）。
5. pagehide後のbfcache復帰では画像・共有が復活せず、手動入力と明示的な再開始を使える（Task 4/5/6）。

## ファイル構成

| ファイル | 責任 |
| --- | --- |
| src/image-input/types.ts | 共通型、エラー、アダプター契約 |
| src/image-input/limits.ts | 共通寸法検証 |
| src/image-input/files.ts | 形式署名と最初の対応画像選択 |
| src/image-input/browser.ts | Blob decode、Canvas読取、アダプター組立 |
| src/image-input/display.ts | stream/videoの準備・現在フレーム・取消と解放 |
| src/image-input/controller.ts | 画像/共有状態、世代管理 |
| src/ui/image-input.ts | 画像取得UIと入力イベント |
| test/image-input/helpers.ts | 制御可能Promise、fakeアダプター、DOMポートのテスト用部品 |
| test/browser/image-input.fixture.html / .ts | 共有選択だけをfakeにした実アダプターのブラウザ入口 |
| docs/project/issue-12-image-input.md | 検証記録・Windows手動確認票 |

src/app/app.tsとstyle.cssへmount/disposeとスタイルを追加する。既存のstate、board-history、recognition、solverは変更しない。以下の各タスクは単独で検証できる単位にする。

## 共通インターフェース（Task 1で定義）

```ts
type ImageSource = 'file' | 'paste' | 'drop' | 'display';
type FileSource = Exclude<ImageSource, 'display'>;
type ImageErrorCode = 'cancelled' | 'stopped' | 'permission-declined' | 'unsupported'
  | 'source-unavailable' | 'activation-required' | 'capture-failed' | 'read-failed'
  | 'unsupported-format' | 'no-image' | 'too-large';
interface DisplayStatus { ended: boolean; muted: boolean }
interface DisplaySession {
  getStatus(): DisplayStatus;
  subscribe(listener: (status: DisplayStatus) => void): () => void;
  capture(): Promise<PixelImage>;
  dispose(): void;
}
interface ImageInputAdapter {
  supportsFiles: boolean;
  supportsDisplay: boolean;
  decode(blob: Blob): Promise<PixelImage>;
  startDisplay(signal: AbortSignal): Promise<DisplaySession>;
}
interface AcquiredImage { image: PixelImage; source: ImageSource; revision: number }
interface ImageInputState {
  phase: 'empty' | 'loading' | 'ready';
  image: AcquiredImage | null;
  imageResult: ImageErrorCode | 'success' | 'multiple' | null;
  sharing: 'idle' | 'requesting' | 'active' | 'ended';
  displayResult: ImageErrorCode | null;
  muted: boolean;
}
```

`PixelImage`は既存型をimportする。`ImageInputError extends Error`はreadonly codeを持つ。例外messageの生表示を避け、UIがcodeを日本語へ変換する。imageResultとdisplayResultを分け、共有停止で進行中のファイル取込の通知を上書きしない。

### Task 1: 入力契約・形式判定・共通上限

**Files:** Create src/image-input/{types,limits,files}.ts。Test test/image-input/{limits,files}.test.ts。

**Interfaces:** 共通型をexport。`assertImageDimensions(width: number, height: number): void`、`selectImage(files: readonly Blob[]): Promise<{ blob: Blob; count: number }>`をexport。画像なしはno-image、ファイルはあるが対応形式なしはunsupported-formatをthrowする。selectImageは署名を確認して最初の対応Blobと対応数を返し、容量検証とdecodeはTask 2で行う。

- [x] **Step 1: 失敗するテストを書く。** `accepts_dimension_limits`で(8192,2048)/(4096,4096)は成功、8193・積超過・0・NaN・小数を拒否。`selects_first_supported_signature`で非画像/PNG/JPEGを混在させPNGとcount=2を返す。`ignores_empty_or_incorrect_mime`で署名を基準に選択し、SVG/GIFは選ばない。

```ts
it('accepts_dimension_limits', () => {
  expect(() => assertImageDimensions(8192, 2048)).not.toThrow();
  expect(() => assertImageDimensions(4096, 4096)).not.toThrow();
  for (const [width, height] of [[8193, 1], [8192, 2049], [0, 1], [NaN, 1], [1.5, 1]]) {
    expect(() => assertImageDimensions(width!, height!)).toThrow(ImageInputError);
  }
});
```
- [x] **Step 2: RED確認。** `npx --no-install vitest run test/image-input/limits.test.ts test/image-input/files.test.ts`。未実装exportによる失敗を確認する。
- [x] **Step 3: 契約を実装。** PNG/JPEG/WebPの先頭署名をBlob.sliceで読む。対応形式の読み取り失敗はread-failed、内容の完全性はdecodeへ委ねる。MIMEより署名を優先し、ネットワークや拡張子に依存しない。
- [x] **Step 4: GREEN確認。** Step 2のコマンドと`npm run typecheck`を実行し、全対象テストが成功することを確認する。
- [ ] **Step 5: コミット。** 対象ファイルを明示してstageし、`feat: define image input contracts and limits`で署名付きcommit。署名失敗時は設定を変更せず失敗を記録する。

### Task 2: Blob decodeとCanvasの共通pixel取得

**Files:** Create src/image-input/browser.ts、test/image-input/helpers.ts。Test test/image-input/browser.test.ts。

**Interfaces:** Task 1の型を使用。`readPixels(source: CanvasImageSource, width: number, height: number, createCanvas: () => HTMLCanvasElement): PixelImage`をexport。`decodeBlob(blob: Blob, bindings: Pick<BrowserBindings, 'createBitmap' | 'createCanvas'>): Promise<PixelImage>`をexport。BrowserBindingsはcreateBitmap(blob, options)、createCanvas()、createVideo()、getDisplayMedia(constraints)、secureContextを持ち、関数の引数・戻り値にはDOM標準型を使う。getDisplayMedia/createBitmapはAPI不在を表現できるnullable関数とする。実アダプター組立はTask 3。

- [x] **Step 1: 失敗するテストを書く。** `preserves_native_rgba`で寸法・data長・decodeオプション一致を検証。`rejects_file_above_20_mib_before_decode`、`rejects_dimensions_before_canvas_creation`、`closes_bitmap_on_read_failure`、`releases_canvas_after_success_or_failure`で呼出し回数と解放を検証。20 MiB丁度は容量検査を通る。`reports_corrupt_supported_file`で対応署名を持つ破損decodeをread-failedへ変換する。
- [x] **Step 2: RED確認。** `npx --no-install vitest run test/image-input/browser.test.ts`を実行する。
- [x] **Step 3: 実装。** 容量→decode→寸法検証→元寸法のdrawImage/getImageDataの順とし、取得データは独立したUint8ClampedArrayにする。Bitmap.closeとCanvas寸法0への復帰をfinallyで行う。API不在と実処理失敗を区別する。
- [x] **Step 4: GREEN確認。** `npx --no-install vitest run test/image-input`と`npm run typecheck`を実行する。
- [ ] **Step 5: コミット。** `feat: decode local images into shared pixels`。

### Task 3: 取消可能な共有開始と現在フレーム取得

**Files:** Create src/image-input/display.ts。Modify src/image-input/browser.ts。Test test/image-input/display.test.ts。

**Interfaces:** `startDisplaySession(signal: AbortSignal, bindings: BrowserBindings): Promise<DisplaySession>`をexport。`createBrowserImageAdapter(overrides: Partial<BrowserBindings> = {}): ImageInputAdapter`をbrowser.tsからexportし、ブラウザ標準を既定値としてTask 2/3へ委譲する。getDisplayMediaは正しいreceiverにbindする。BrowserBindingsのvideo/Canvas/streamはテストでfakeへ置換する。

- [x] **Step 1: 失敗するテストを書く。** `aborts_during_selection_play_or_readiness`を3段階×取消の表で実行。取消でPromiseが終了し、取得済みtrack.stop、pause、srcObject=null、イベント/タイマー解除を確認する。`stops_late_stream_before_video_creation`、`handles_late_rejection`、`never_revives_after_late_play`も追加する。
- [x] **Step 2: フレームと上限の失敗テストを書く。** `captures_ready_static_frame_without_callback`はreadyState=2・有効寸法で通知ゼロでも反復取得成功。`waits_for_first_frame_only`はloadeddata/unmuteと10秒の期限を検証。`rejects_8k_without_canvas_and_recovers`は正常→7680×4320→正常でCanvas未呼出しと同じセッションの回復を確認。`handles_resolution_change`、`rejects_muted_or_ended_track`、`disposes_all_tracks_once`も検証する。
- [x] **Step 3: RED確認。** `npx --no-install vitest run test/image-input/display.test.ts`を実行する。
- [x] **Step 4: 開始と解放を実装。** 呼出し時のsignalを確認してgetDisplayMediaを同期的に開始する。元Promiseのresolve/rejectを常に監視し、signal取消時は外側のPromiseを終了させる。stream取得後にsignal確認・解放handler登録・video接続を行う。準備完了直前にもsignalとtrack終了を確認する。10秒はstream取得後から計測する。
- [x] **Step 5: captureと状態通知を実装。** 現在フレーム・live/非mute・寸法を確認してreadPixelsを呼ぶまでawaitを入れない。getStatus/subscribeでendedとmute/unmuteを通知する。session.dispose、abort、ended、準備失敗は同じ冪等な解放経路に集約する。ブラウザのNotAllowedError等を設計書の分類へ変換し、signal由来の取消はcancelledとする。
- [x] **Step 6: GREEN確認。** `npx --no-install vitest run test/image-input`、`npm run typecheck`。fake timerで10秒と全解放ケースを確認する。
- [ ] **Step 7: コミット。** `feat: capture display frames with cancellable setup`。

### Task 4: 画像・共有状態と競合制御

**Files:** Create src/image-input/controller.ts。Modify test/image-input/helpers.ts。Test test/image-input/controller.test.ts。

**Interfaces:** `createImageInputController(adapter: ImageInputAdapter): ImageInputController`をexport。controllerはgetState()、subscribe(listener)の解除関数、importFiles(files, source): Promise<void>、startDisplay(): Promise<void>、captureDisplay(): Promise<void>、stopDisplay(): void、clear(): void、suspend(): void、dispose(): voidを持つ。suspendはpagehide用で画像・共有を解放するが、復帰後の新規操作を許可する。dispose後の操作は何も開始しない。

- [x] **Step 1: 失敗するテストを書く。** `all_file_paths_use_same_decode`、`last_started_import_wins`、`clear_invalidates_selection_and_decode`、`failed_capture_preserves_image_revision`、`repeated_capture_uses_one_session`を制御可能Promiseで検証する。ファイル署名選択のawaitも操作世代に含める。
- [x] **Step 2: 寿命の失敗テストを書く。** `stop_aborts_pending_start`、`restart_is_not_affected_by_old_completion`、`suspend_clears_and_allows_explicit_restart`、`dispose_rejects_late_updates`、`stop_does_not_cancel_file_decode`を検証。session返却前後の取消競合も含め、旧セッションだけがdisposeされることを確認する。
- [x] **Step 3: RED確認。** `npx --no-install vitest run test/image-input/controller.test.ts`を実行する。
- [x] **Step 4: 実装。** 画像操作と共有開始に独立した世代番号を持つ。画像revisionは成功採用時だけ進め、最新1枚だけを保持する。取込失敗時は元画像を保持しphaseをready/emptyへ戻す。共有startはadapterの同期開始をawaitより先に呼ぶ。共有停止はsignalをabortし購読/セッションを解放する。clearは画像操作だけ、suspend/disposeは両方を無効化する。
- [x] **Step 5: GREEN確認。** `npx --no-install vitest run test/image-input`、`npm run typecheck`。
- [ ] **Step 6: コミット。** `feat: coordinate image input state and stale results`。

### Task 5: UI統合とChromiumでの実入力検証

**Files:** Create src/ui/image-input.ts、test/browser/image-input.fixture.html、test/browser/image-input.fixture.ts、test/browser/image-input.test.ts、test/browser/display-input.test.ts。Modify src/app/app.ts、src/app/style.css、test/browser/release.test.ts。

**Interfaces:** `mountImageInput(root: HTMLElement, adapter?: ImageInputAdapter): { dispose(): void }`。既定adapterはcreateBrowserImageAdapter。mountAppのoptionsは既存Partial<SolverClientOptions>に`imageInputAdapter?: ImageInputAdapter`を加えたAppOptionsへ拡張する。既存fixtureの呼出しは互換。新fixtureはmountAppを使い、getDisplayMediaのみ置換する実アダプターを渡す。

- [x] **Step 1: 失敗するE2Eを書く。** `imports_file_paste_drop_with_identical_rgba`で同じPNG/JPEG/WebPを各経路へ渡し、プレビュー寸法・pixel値を比較する。`reselects_same_file_and_selects_first_supported`でinputリセット、混在ファイル、複数通知を確認する。`does_not_fetch_pasted_urls_or_intercept_text`と`prevents_outside_file_navigation_without_import`を確認する。
- [x] **Step 2: 共有の失敗するE2Eを書く。** `captures_changed_and_static_stream`はcanvas.captureStream(0)へrequestFrameで1枚送り準備を待つ。その後新フレームなしで反復取得し、描画変更と明示送出後は新RGBAを取得する。`updates_dimensions_on_same_stream`はcanvasを小さい別寸法へ変更して送出する。`stop_remains_available_with_closed_panel`、`external_stop_and_unsupported_keep_file_input`、`pagehide_and_dispose_release_tracks`を検証する。track.stopはendedを自動発火しないので、外部終了のfakeは明示通知する。
- [x] **Step 3: RED確認。** `npx --no-install vitest run test/browser/image-input.test.ts test/browser/display-input.test.ts`を実行する。
- [x] **Step 4: UIを実装。** 初期closedのdetails、focus可能な入力領域、file選択、共有開始/取消/停止、最新フレーム取得、クリア、role=statusの通知、画像寸法・経路、preview Canvasを設ける。Canvasはmax-height:320px、縦横比維持。summaryに状態を表示しパネル外の停止操作も残す。貼り付けのeditable targetは除外し、DataTransferのファイル以外は使わない。
- [x] **Step 5: appの寿命へ接続。** 盤面設定の前に画像mountを追加する。pagehideでcontroller.suspendとpreview消去、disposeで全listener解除とcontroller.disposeを呼ぶ。取得だけで盤面編集・解析・履歴操作を発生させない。画像を診断へ渡さない。
- [x] **Step 6: 回帰テストを調整。** release.test.tsの`document.querySelector('canvas')`を`.board-surface canvas`へ限定し、画像Canvasが追加されても盤面寸法を検証する。他の既存テストも曖昧なCanvas/statusセレクターがあれば対象を限定する。期待する盤面動作は変えない。
- [x] **Step 7: GREEN確認。** Step 3、`npm run typecheck`、`npm run build`、`npm run test:ci -- product`を順に実行。1920/1280/960pxと狭幅でパネル開閉・preview・フォーカス・共有停止をスクリーンショット確認する。
- [ ] **Step 8: コミット。** `feat: add local image input and display preview UI`。

### Task 6: 通信・保存の検証と利用案内

**Files:** Create test/browser/image-input-production.test.ts、docs/project/issue-12-image-input.md。Modify README.md、docs/project/{product,privacy,roadmap,README}.md、src/app/app.tsの通信・footer文言。

**Interfaces:** 既存startBrowserHarness(true)、診断メニューを使う。Windows確認票は実施結果と未実施を区別し、公開済みバージョンの証跡は変更しない。

- [x] **Step 1: 失敗するproductionテストを書く。** `image_operations_do_not_send_or_store_data`は実画像の取込・クリア・共有非対応・手動盤面編集を行い、リクエストが同originの静的GETだけでbodyなし、beacon/socketなし、localStorage/sessionStorage/IndexedDB/Service Workerなしを確認する。診断有効化後に画像を取り込み、JSONに画像/ファイル名/共有ラベルがないことを確認する。画像操作単独でsolver実行・盤面Undo履歴が増えないことも固定する。privacy.test.tsに、画像表示のみの案内と画像の外部送信・自動保存なしの説明が表示されることを追加する。
- [x] **Step 2: RED確認。** 新テストと`test/browser/privacy.test.ts`を実行し、古い画像未対応の説明が残る箇所を特定する。
- [x] **Step 3: 案内を更新。** 「画像は表示のみです。盤面を自動入力する機能はまだありません」をUIへ明記。最新1枚のメモリ保持・共有停止・画像/盤面の外部送信なし・自動保存なしを説明する。READMEは任意画像入力と対応形式/上限/貼り付け領域/HTTPS条件を追記。roadmapと現在地はローカル実装・検証の状態を正確に記載し、Windows確認とmain統合・Pages配信を完了したことにしない。
- [x] **Step 4: 自動検証。** `npm run typecheck`、`npm run build`、`npm run test:ci -- product`、`git diff --check`。直前のTask 5からコード変更がなく検証済みなら再実行は新規production/privacyテストに限定し、実行コマンドと結果を記録する。認識実装に変更がなければ正式認識再評価は行わない。
- [x] **Step 5: 手動確認票を作る。** Windows Chromeの共有選択/キャンセル、タブ・ウィンドウ取得、静止画面取得、ブラウザ停止、ページ離脱、OS貼り付け、Explorer D&Dの各行に環境・手順・期待結果・実施結果欄を設ける。このMacワークスペースで確認できない項目は未実施として残し、自動検証で代用したとはしない。
- [ ] **Step 6: コミット。** `docs: document and verify local image input`。

## 実行と完了の扱い

- 実行開始時に既存のOrca linked worktreeであることと差分を確認し、この作業ツリーを使う。現在の設計書は署名失敗によりstage済み・未commit。署名問題を確認し、署名なしcommitや設定変更で回避しない。
- 各タスクはRED/GREENの証拠を記録する。対象テスト成功後の無意味な反復や、実装をそのまま写すテストは追加しない。
- 実装方式は利用者が選択する。Nativeなら本セッションで順に実装し、最終的に独立レビューする。Subagent-drivenならタスクごとの実装・レビューを分離する。
- 完了報告にコード変更、実行した自動検証、残るWindows手動確認、commit署名状況を含める。未検証を検証済みとせず、許可なしにIssueへの投稿・close・Pages公開を行わない。

## 計画の自己レビュー

- 設計の全入力経路、リソース寿命、競合、エラー分類、UI、通信/保存、受け入れ条件をTask 1〜6へ割り当てた。
- P1の準備途中の取消はTask 3/4/5、P2の静止streamはTask 3/5、共有寸法上限と回復はTask 3/4/5へ割り当てた。
- Review Focusの5項目をそれぞれのタスクで検証する。共通型と関数名を後続タスクで統一した。
- CI分類は既存規則で新規test/image-inputとtest/browserをproductへ分類するため、分類コードの変更は不要。
