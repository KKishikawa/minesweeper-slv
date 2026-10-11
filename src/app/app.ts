import { createBoard, editCell } from '../board/board';
import { createAppState, transition } from './state';
import type { AppAction } from './state';
import { createModuleSolverWorker, createSolverClient } from './solver-client';
import type { SolverClientOptions } from './solver-client';
import { mountBoardSettings } from '../ui/board-settings';
import { mountBoardEditor } from '../ui/board-editor';
import { computeLayout } from '../ui/layout';
import { statusText } from '../ui/status';
import { renderLegend } from '../ui/board-legend';
import { createDiagnosticHistory } from './diagnostic-history';
import { mountDiagnosticsMenu } from '../ui/diagnostics-menu';

export function mountApp(root: HTMLElement, options: Partial<SolverClientOptions> = {}): { dispose(): void } {
  root.innerHTML = `
    <header class="page-header"><p class="eyebrow">LOCAL MINE FINDER</p>
      <h1>マインスイーパー ソルバー</h1>
      <p class="intro">盤面を入力して、次の一手を確かめる。</p>
      <button class="privacy-badge" type="button" aria-haspopup="dialog" aria-controls="privacy-dialog">端末内で解析 · 盤面の外部送信なし <span aria-hidden="true">ⓘ</span></button>
    </header>
    <section class="settings-card" aria-labelledby="settings-heading"><h2 id="settings-heading"><span class="step">01</span> 盤面の設定</h2><div class="settings-mount"></div></section>
    <section class="workbench" aria-labelledby="board-heading">
      <h2 id="board-heading"><span class="step">02</span> 盤面を入力</h2>
      <div class="workspace"><div class="editor-panel"><div class="editor-mount"></div>
        <div class="history-controls" role="group" aria-label="盤面の履歴" aria-describedby="history-note">
          <button class="undo-button" type="button" disabled>元に戻す</button><button class="redo-button" type="button" disabled>やり直す</button>
        </div>
        <p class="history-note" id="history-note">現在を含む直近100盤面をこのページのメモリに保持します。再読み込みすると履歴は消えます。</p>
      </div>
        <aside class="information" aria-label="解析と設定">
          <section class="result-card"><p class="eyebrow">次の一手</p><p class="status" role="status" aria-live="polite"></p><p class="status-detail"></p><p class="restored-result" aria-live="polite"></p><p class="proposal-counts"></p><button class="reanalyze" type="button">再解析する</button></section>
          <p class="flag-note">入力旗は地雷として扱います。誤った旗でも数字と矛盾しなければ、その旗を前提とした提案が出ます。旗が正しいことを確認してください。</p>
          <section class="legend" aria-label="凡例"><h3>表示の見方</h3>
            <p class="legend-items"><span><canvas data-symbol="flag" aria-hidden="true"></canvas> 入力旗</span><span><canvas data-symbol="safe" aria-hidden="true"></canvas> 提案: 安全 S</span></p>
            <p class="legend-items"><span><canvas data-symbol="mine" aria-hidden="true"></canvas> 提案: 地雷 M</span><span><canvas data-symbol="guess" aria-hidden="true"></canvas> 推測候補 ?</span></p>
            <p class="legend-note">入力旗は確定地雷として残り、閉じたセルに解析の提案を表示します。提案は入力を変更しません。青い枠は操作中のセルです。</p>
          </section>
        </aside>
      </div>
    </section>
    <dialog id="privacy-dialog" class="privacy-dialog" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading" tabindex="-1" autofocus>通信・保存・不具合報告</h2>
      <p>盤面の入力と解析はブラウザ内で行い、アプリは盤面を外部へ送信しません。画像入力には対応していません。盤面はページ内のメモリに保持し、再読み込みすると初期化されます。ブラウザの保存領域への自動保存はありません。</p>
      <p>ページ表示や解析に必要な静的ファイル（HTML・CSS・JavaScript・Worker）の取得には通信が発生します。GitHub Pagesでは、GitHubがアクセス時のIPアドレスをセキュリティ目的で記録します。<a href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection">GitHub Pagesのデータ収集について</a></p>
      <p>開発者向け診断はページ末尾で有効化した後の解析を直近100件までメモリ内に記録し、JSONをダウンロードできます。OFFで取得を停止し、実行中の記録を除外します。完了済み履歴は削除するか再読み込みするまで残り、再読み込みで設定も消えます。アプリから診断データを自動送信する機能はありません。不具合の報告は、利用者自身が内容を確認して<a href="https://github.com/KKishikawa/minesweeper-slv/issues">GitHub Issue</a>へ投稿するか選べます。公開Issueの本文・添付ファイルは公開されます。</p>
      <form method="dialog"><button type="submit">閉じる</button></form>
    </dialog>
    <footer>画像入力には対応していません。再読み込みすると盤面は初期化されます。<div class="diagnostics-mount"></div></footer>`;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const workspace = get<HTMLDivElement>('.workspace');
  const editorRoot = get<HTMLDivElement>('.editor-mount');
  let state = createAppState(createBoard(9, 9, 10, 0));
  const controller = new AbortController();
  const privacyDialog = get<HTMLDialogElement>('.privacy-dialog');
  const privacyTrigger = get<HTMLButtonElement>('.privacy-badge');
  privacyTrigger.addEventListener('click', () => privacyDialog.showModal(), { signal: controller.signal });
  privacyDialog.addEventListener('close', () => privacyTrigger.focus(), { signal: controller.signal });
  const history = createDiagnosticHistory();
  const diagnosticsMenu = mountDiagnosticsMenu(get('.diagnostics-mount'), history);
  const client = createSolverClient(response => dispatch({ type: 'response', response }), { workerFactory: options.workerFactory ?? createModuleSolverWorker,
    onDiagnostic: diagnostic => { history.finish(diagnostic); diagnosticsMenu.update(); options.onDiagnostic?.(diagnostic); },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
  const settings = mountBoardSettings(get('.settings-mount'), (width, height, totalMines) =>
    dispatch({ type: 'board-changed', board: createBoard(width, height, totalMines, state.board.revision + 1) }));
  const editor = mountBoardEditor(editorRoot, (index, value) => dispatch({ type: 'board-changed', board: editCell(state.board, index, value) }), () => {
    const { width, height, totalMines, revision } = state.board;
    dispatch({ type: 'board-changed', board: createBoard(width, height, totalMines, revision + 1) });
  });
  function render(restoreSettings = false) {
    const layout = computeLayout(workspace.clientWidth, state.board.width);
    workspace.dataset.placement = layout.placement;
    editorRoot.style.setProperty('--board-cell-size', String(layout.cellSize));
    settings.update(state.board, restoreSettings);
    editor.update(state.board, state.proposal, state.validation);
    get<HTMLButtonElement>('.undo-button').disabled = state.history.cursor === 0;
    get<HTMLButtonElement>('.redo-button').disabled = state.history.cursor === state.history.entries.length - 1;
    renderLegend(get('.legend'));
    get('.status').textContent = statusText(state);
    get('.result-card').dataset.phase = state.phase;
    get('.restored-result').textContent = state.restoredResult ? '保存された解析結果を表示しています。' : '';
    get('.proposal-counts').textContent = state.proposal ? `安全 ${state.proposal.safe.length} · 地雷 ${state.proposal.mines.length} · 推測候補 ${state.proposal.guesses.length}` : '';
    get('.status-detail').textContent = state.phase === 'guess-required' ? '確定できる手がありません。? は地雷の可能性が最も低い同率の候補です。'
      : state.phase === 'inconsistent' ? '数字・入力旗・総地雷数を確認してください。編集を元に戻すこともできます。'
      : state.phase === 'limit-reached' ? state.limitReason === 'timeout'
        ? 'Workerの待機時間の上限に達しました。元に戻す、盤面の更新、再解析を試してください。'
        : state.limitReason === 'node-budget' ? '探索ノード数の上限に達しました。元に戻す、盤面の更新、再解析を試してください。'
          : '解析量または待機時間の上限に達しました。元に戻す、盤面の更新、再解析を試してください。'
      : state.phase === 'error' ? '解析を完了できませんでした。再解析をお試しください。'
      : state.phase === 'needs-review' ? '要確認のセルと盤面の寸法を確認してください。'
      : '入力した情報をもとに解析します。';
  }
  function dispatch(action: AppAction) {
    const next = transition(state, action);
    const historyMoved = (action.type === 'undo' || action.type === 'redo') && next.state.history.cursor !== state.history.cursor;
    state = next.state; render(historyMoved);
    for (const effect of next.effects) {
      if (effect.type === 'cancel') client.cancel();
      else {
        const request = { ...effect.request, diagnostics: history.enabled };
        history.start(request, { timeoutMs: options.timeoutMs ?? 5000 });
        diagnosticsMenu.update();
        client.run(request);
      }
    }
  }
  get('.reanalyze').addEventListener('click', () => dispatch({ type: 'solve' }), { signal: controller.signal });
  get('.undo-button').addEventListener('click', () => dispatch({ type: 'undo' }), { signal: controller.signal });
  get('.redo-button').addEventListener('click', () => dispatch({ type: 'redo' }), { signal: controller.signal });
  let observedWidth = workspace.clientWidth;
  const observer = new ResizeObserver(() => {
    const width = workspace.clientWidth;
    if (width !== observedWidth) { observedWidth = width; render(); }
  });
  observer.observe(workspace);
  dispatch({ type: 'solve' });
  return { dispose() { observer.disconnect(); controller.abort(); client.dispose(); diagnosticsMenu.dispose(); editor.dispose(); settings.dispose(); root.replaceChildren(); } };
}
