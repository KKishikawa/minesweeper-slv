import type { createDiagnosticHistory } from '../app/diagnostic-history';

export function mountDiagnosticsMenu(root: HTMLElement, history: ReturnType<typeof createDiagnosticHistory>):
  { update(): void; dispose(): void } {
  root.innerHTML = `<details class="diagnostics-menu">
    <summary>開発者向け診断</summary>
    <div class="diagnostics-content">
      <label><input type="checkbox" name="diagnostics-enabled"> 診断履歴を取得する</label>
      <p>有効化してから盤面を操作するか、再解析してください。直近100件をこのページ内だけに保持し、再読み込みで消えます。OFFにすると取得を停止します。</p>
      <p class="diagnostics-count"></p>
      <div class="diagnostics-actions"><button type="button" class="diagnostics-download">診断JSONをダウンロード</button>
        <button type="button" class="diagnostics-clear">診断履歴を削除</button></div>
      <p>必要に応じて<a href="https://github.com/KKishikawa/minesweeper-slv/issues/new" target="_blank" rel="noopener noreferrer">GitHubで不具合を報告</a>し、JSONを共有してください。公開Issueへの投稿内容は公開されます。ダウンロードだけでも利用できます。</p>
    </div>
  </details>`;
  const toggle = root.querySelector<HTMLInputElement>('input')!;
  const download = root.querySelector<HTMLButtonElement>('.diagnostics-download')!;
  const clear = root.querySelector<HTMLButtonElement>('.diagnostics-clear')!;
  const count = root.querySelector<HTMLElement>('.diagnostics-count')!;
  const controller = new AbortController();
  const update = () => {
    toggle.checked = history.enabled;
    count.textContent = `診断履歴: ${history.count}件`;
    download.disabled = clear.disabled = history.count === 0;
  };
  toggle.addEventListener('change', () => { history.setEnabled(toggle.checked); update(); }, { signal: controller.signal });
  clear.addEventListener('click', () => { history.clear(); update(); }, { signal: controller.signal });
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([history.exportJson(__BUILD_IDENTITY__)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `minesweeper-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, { signal: controller.signal });
  update();
  return { update, dispose() { controller.abort(); root.replaceChildren(); } };
}
