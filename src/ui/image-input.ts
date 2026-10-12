import { createBrowserImageAdapter } from '../image-input/browser';
import { createImageInputController } from '../image-input/controller';
import type { ImageErrorCode, ImageInputAdapter, ImageInputState, ImageSource } from '../image-input/types';

const messages: Record<ImageErrorCode, string> = {
  cancelled: '取込を取り消しました。', stopped: '共有を停止しました。',
  'permission-declined': '共有がキャンセルされたか、許可されませんでした。',
  unsupported: 'この環境では対応していません。ファイル・貼り付け・ドロップをお使いください。',
  'source-unavailable': '共有可能な画面がありません。',
  'activation-required': '開始ボタンから画面共有をもう一度お試しください。',
  'capture-failed': '共有を開始できませんでした。再試行するか、他の入力方法をお使いください。',
  'read-failed': '画像またはフレームを読み込めませんでした。もう一度お試しください。',
  'unsupported-format': 'PNG・JPEG・WebPの画像を選んでください。',
  'no-image': '画像ファイルがありません。',
  'too-large': '画像が大きすぎます。20 MiB以下、各辺8,192px以下、16,777,216画素以下の画像をお使いください。',
};
const sources: Record<ImageSource, string> = { file: 'ファイル', paste: '貼り付け', drop: 'ドロップ', display: '画面共有' };

function transferFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const items = Array.from(data.items).filter(item => item.kind === 'file');
  return items.length ? items.flatMap(item => { const file = item.getAsFile(); return file ? [file] : []; }) : Array.from(data.files);
}
function hasFiles(data: DataTransfer | null): boolean {
  return data !== null && (Array.from(data.types).includes('Files') || Array.from(data.items).some(item => item.kind === 'file'));
}
function editable(target: EventTarget | null): boolean {
  return target instanceof Element && (target.closest('input, textarea, select') !== null
    || (target instanceof HTMLElement && target.isContentEditable));
}

export function mountImageInput(root: HTMLElement, adapter: ImageInputAdapter = createBrowserImageAdapter()): { dispose(): void } {
  root.innerHTML = `
    <section class="image-input-card" aria-label="画像入力">
      <details class="image-input">
        <summary>画像を取り込む（任意） <span class="image-summary-state"></span></summary>
        <div class="image-input-content">
          <div class="image-input-zone" tabindex="0" role="group" aria-label="画像の貼り付け・ドロップ領域" aria-describedby="image-input-help">
            <p id="image-input-help">ここに画像をドロップ、またはフォーカスしてCtrl+V / ⌘Vで貼り付けできます。</p>
            <label class="image-file-label">画像ファイルを選択 <input class="image-file" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>
            <p class="image-input-limits">PNG・JPEG・WebP · 20 MiB以下 · 各辺8,192px以下、16,777,216画素以下</p>
          </div>
          <div class="image-actions">
            <button class="display-start" type="button">画面共有を開始</button>
            <button class="display-cancel" type="button" hidden>共有開始を取り消す</button>
            <button class="display-capture" type="button" hidden>最新フレームを取得</button>
            <button class="image-clear" type="button" disabled>画像をクリア</button>
          </div>
          <p class="image-status" role="status" aria-live="polite"></p>
          <p class="display-status" role="status" aria-live="polite"></p>
          <p class="image-metadata"></p>
          <canvas class="image-preview" width="0" height="0" role="img" aria-label="取得した画像のプレビュー" hidden></canvas>
        </div>
      </details>
      <div class="image-sharing-controls" hidden><span class="image-sharing-state"></span><button class="display-stop" type="button">共有を停止</button></div>
      <p class="image-reference-note">画像は表示のみです。盤面を自動入力する機能はまだありません。</p>
    </section>`;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const input = get<HTMLInputElement>('.image-file');
  const zone = get('.image-input-zone');
  const preview = get<HTMLCanvasElement>('.image-preview');
  const controller = createImageInputController(adapter);
  const events = new AbortController();
  let previewRevision: number | null = null;
  let cancelledImageState: ImageInputState | null = null;
  let disposed = false;

  function render(state: ImageInputState) {
    // Sharing-only updates preserve the chooser notice; image progress replaces it.
    if (cancelledImageState && (state.phase !== cancelledImageState.phase
      || state.image !== cancelledImageState.image || state.imageResult !== cancelledImageState.imageResult)) {
      cancelledImageState = null;
    }
    input.disabled = !adapter.supportsFiles;
    const requesting = state.sharing === 'requesting';
    const active = state.sharing === 'active';
    const sharingText = requesting ? '共有元を選択中' : active ? state.muted ? '共有中（フレーム待機）' : '共有中' : state.sharing === 'ended' ? '共有終了' : '共有なし';
    get('.image-summary-state').textContent = sharingText;
    get('.image-sharing-state').textContent = sharingText;
    get<HTMLButtonElement>('.display-start').hidden = active || requesting;
    get<HTMLButtonElement>('.display-start').disabled = !adapter.supportsDisplay;
    get('.display-cancel').hidden = !requesting;
    get('.image-sharing-controls').hidden = !active && !requesting;
    get('.display-stop').textContent = requesting ? '共有開始を取り消す' : '共有を停止';
    get('.display-capture').hidden = !active;
    get<HTMLButtonElement>('.display-capture').disabled = state.muted || state.phase === 'loading';
    get<HTMLButtonElement>('.image-clear').disabled = state.image === null && state.phase !== 'loading';
    get('.image-status').textContent = cancelledImageState ? messages.cancelled
      : state.phase === 'loading' ? '画像を読み込んでいます。'
      : state.imageResult === 'multiple' ? '複数の対応画像から最初の1枚を取り込みました。'
      : state.imageResult === 'success' ? '画像を取り込みました。'
      : state.imageResult ? messages[state.imageResult] : '画像はまだ取り込まれていません。';
    get('.display-status').textContent = state.displayResult ? messages[state.displayResult]
      : !adapter.supportsDisplay ? messages.unsupported
      : requesting ? '共有元を選択中です。開始を取り消せます。'
      : active ? state.muted ? '共有中です。フレームを待っています。' : '共有中です。「最新フレームを取得」で画像を取り込めます。' : '';
    if (state.image === null) {
      preview.width = 0; preview.height = 0; preview.hidden = true; previewRevision = null;
      get('.image-metadata').textContent = '';
    } else {
      const { image, source, revision } = state.image;
      get('.image-metadata').textContent = `${image.width} × ${image.height}px · ${sources[source]}`;
      if (previewRevision !== revision) {
        preview.width = image.width; preview.height = image.height;
        const context = preview.getContext('2d');
        if (context) context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
        previewRevision = revision;
      }
      preview.hidden = false;
    }
  }
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  const on = (target: EventTarget, type: string, listener: EventListener) => target.addEventListener(type, listener, { signal: events.signal });
  on(input, 'change', () => {
    const files = Array.from(input.files ?? []); input.value = '';
    if (files.length) { cancelledImageState = null; void controller.importFiles(files, 'file'); }
  });
  on(input, 'cancel', () => { cancelledImageState = controller.getState(); render(cancelledImageState); });
  on(zone, 'paste', event => {
    if (editable(event.target)) return;
    const files = transferFiles((event as ClipboardEvent).clipboardData);
    if (!files.length) return;
    event.preventDefault(); cancelledImageState = null; void controller.importFiles(files, 'paste');
  });
  on(zone, 'dragover', event => { if (hasFiles((event as DragEvent).dataTransfer)) event.preventDefault(); });
  on(zone, 'drop', event => {
    const files = transferFiles((event as DragEvent).dataTransfer);
    if (!files.length) return;
    event.preventDefault(); cancelledImageState = null; void controller.importFiles(files, 'drop');
  });
  // Files dropped outside the input area must not navigate away from the app.
  for (const type of ['dragover', 'drop']) on(window, type, event => {
    if (hasFiles((event as DragEvent).dataTransfer)) event.preventDefault();
  });
  on(get('.display-start'), 'click', () => { void controller.startDisplay(); });
  on(get('.display-cancel'), 'click', () => controller.stopDisplay());
  on(get('.display-stop'), 'click', () => controller.stopDisplay());
  on(get('.display-capture'), 'click', () => { cancelledImageState = null; void controller.captureDisplay(); });
  on(get('.image-clear'), 'click', () => { cancelledImageState = null; controller.clear(); });
  on(window, 'pagehide', () => controller.suspend());
  return { dispose() {
    if (disposed) return;
    disposed = true; events.abort(); controller.dispose(); unsubscribe();
    preview.width = 0; preview.height = 0; root.replaceChildren();
  } };
}
