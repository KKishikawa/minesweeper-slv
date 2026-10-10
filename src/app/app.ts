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
      <p class="privacy-badge">端末内で解析 · 保存・送信なし</p>
    </header>
    <section class="settings-card" aria-labelledby="settings-heading"><h2 id="settings-heading"><span class="step">01</span> 盤面の設定</h2><div class="settings-mount"></div></section>
    <section class="workbench" aria-labelledby="board-heading">
      <h2 id="board-heading"><span class="step">02</span> 盤面を入力</h2>
      <div class="workspace"><div class="editor-mount"></div>
        <aside class="information" aria-label="解析と設定">
          <section class="result-card"><p class="eyebrow">次の一手</p><p class="status" role="status" aria-live="polite"></p><p class="status-detail"></p><p class="proposal-counts"></p><button class="reanalyze" type="button">再解析する</button></section>
          <fieldset class="flag-policy"><legend>入力旗の扱い</legend>
            <label><input type="radio" name="flag-policy" value="trusted" checked>入力旗を地雷として扱う</label>
            <label><input type="radio" name="flag-policy" value="reconsidered">入力旗を再検討する</label>
            <label class="auto-policy"><input type="checkbox" name="auto-reconsider">矛盾したときに入力旗を自動で再検討する</label>
          </fieldset>
          <p class="policy-note">地雷として扱う設定では、成立する誤った旗は検出できません。すべての旗を評価し直す場合は再検討を選んでください。</p>
          <p class="effective-policy"></p>
          <section class="legend" aria-label="凡例"><h3>表示の見方</h3>
            <p class="legend-items"><span><canvas data-symbol="flag" aria-hidden="true"></canvas> 入力旗</span><span><canvas data-symbol="safe" aria-hidden="true"></canvas> 提案: 安全 S</span></p>
            <p class="legend-items"><span><canvas data-symbol="mine" aria-hidden="true"></canvas> 提案: 地雷 M</span><span><canvas data-symbol="guess" aria-hidden="true"></canvas> 推測候補 ?</span></p>
            <p class="legend-items"><span><canvas data-symbol="flag-safe" aria-hidden="true"></canvas> 入力旗と提案が両方ある例</span></p>
            <p class="legend-note">再検討中も左の旗は入力として残り、右に解析の提案を表示します。提案は入力を変更しません。青い枠は操作中のセルです。</p>
          </section>
        </aside>
      </div>
    </section>
    <footer>画像入力には対応していません。再読み込みすると盤面は初期化されます。<div class="diagnostics-mount"></div></footer>`;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const workspace = get<HTMLDivElement>('.workspace');
  const editorRoot = get<HTMLDivElement>('.editor-mount');
  let state = createAppState(createBoard(9, 9, 10, 0));
  const controller = new AbortController();
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
  function render() {
    const layout = computeLayout(workspace.clientWidth, state.board.width);
    workspace.dataset.placement = layout.placement;
    editorRoot.style.setProperty('--board-cell-size', String(layout.cellSize));
    editor.update(state.board, state.proposal, state.validation);
    renderLegend(get('.legend'));
    get('.status').textContent = statusText(state);
    get('.result-card').dataset.phase = state.phase;
    get('.proposal-counts').textContent = state.proposal ? `安全 ${state.proposal.safe.length} · 地雷 ${state.proposal.mines.length} · 推測候補 ${state.proposal.guesses.length}` : '';
    get('.status-detail').textContent = state.phase === 'guess-required' ? '確定できる手がありません。? は地雷の可能性が最も低い同率の候補です。'
      : state.phase === 'inconsistent' ? '数字・入力旗・総地雷数を確認してください。'
      : state.phase === 'limit-reached' ? state.limitReason === 'timeout'
        ? 'Workerの待機時間の上限に達しました。盤面を更新するか、再解析してください。'
        : state.limitReason === 'node-budget' ? '探索ノード数の上限に達しました。盤面を更新するか、再解析してください。'
          : '解析量または待機時間の上限に達しました。盤面を更新するか、再解析してください。'
      : state.phase === 'error' ? '解析を完了できませんでした。再解析をお試しください。'
      : state.phase === 'needs-review' ? '要確認のセルと盤面の寸法を確認してください。'
      : '入力した情報をもとに解析します。';
    get('.effective-policy').textContent = state.effectivePolicy === 'reconsidered' ? '入力旗を再検討して解析しています。' : '';
  }
  function dispatch(action: AppAction) {
    const next = transition(state, action); state = next.state; render();
    for (const effect of next.effects) {
      if (effect.type === 'cancel') client.cancel();
      else {
        const request = { ...effect.request, diagnostics: history.enabled };
        history.start(request, { policy: state.policy, autoReconsider: state.autoReconsider, timeoutMs: options.timeoutMs ?? 5000 });
        diagnosticsMenu.update();
        client.run(request);
      }
    }
  }
  const policy = () => dispatch({ type: 'settings-changed',
    policy: get<HTMLInputElement>('input[value="reconsidered"]').checked ? 'reconsidered' : 'trusted',
    autoReconsider: get<HTMLInputElement>('input[name="auto-reconsider"]').checked });
  root.querySelectorAll('input[name="flag-policy"], input[name="auto-reconsider"]').forEach(input => input.addEventListener('change', policy, { signal: controller.signal }));
  get('.reanalyze').addEventListener('click', () => dispatch({ type: 'solve' }), { signal: controller.signal });
  let observedWidth = workspace.clientWidth;
  const observer = new ResizeObserver(() => {
    const width = workspace.clientWidth;
    if (width !== observedWidth) { observedWidth = width; render(); }
  });
  observer.observe(workspace);
  dispatch({ type: 'solve' });
  return { dispose() { observer.disconnect(); controller.abort(); client.dispose(); diagnosticsMenu.dispose(); editor.dispose(); settings.dispose(); root.replaceChildren(); } };
}
