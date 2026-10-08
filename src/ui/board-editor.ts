import type { BoardSnapshot, CellValue, ValidationResult } from '../board/types';
import type { SolverProposal } from '../solver/types';
import { renderBoard } from './board-renderer';

export function mountBoardEditor(root: HTMLElement, onEdit: (index: number, value: CellValue) => void, onReset: () => void): {
  update(board: BoardSnapshot, proposal: SolverProposal | null, validation: ValidationResult): void;
  dispose(): void;
} {
  root.classList.add('board-editor');
  const palette = document.createElement('div'); palette.className = 'palette'; palette.setAttribute('aria-label', '入力する値');
  let tool: CellValue = 'closed';
  let selected = 0;
  let board: BoardSnapshot | null = null;
  let proposal: SolverProposal | null = null;
  let validation: ValidationResult = { status: 'valid' };
  const values: CellValue[] = ['closed', 0, 'flag', 1, 2, 3, 4, 5, 6, 7, 8];
  const paletteButtons = values.map(value => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = value === 'closed' ? '閉じる' : value === 'flag' ? '旗' : value === 0 ? '空き' : String(value);
    button.setAttribute('aria-pressed', String(value === tool));
    button.addEventListener('click', () => {
      tool = value;
      paletteButtons.forEach((other, index) => other.setAttribute('aria-pressed', String(values[index] === tool)));
    });
    palette.append(button); return button;
  });
  const help = document.createElement('p'); help.className = 'editor-help';
  help.textContent = '入力する値を選んでセルをクリック。矢印で移動、0 / Spaceで空き、Fで旗、Deleteで閉じる、1〜8で数字。';
  const surface = document.createElement('div'); surface.className = 'board-surface'; surface.style.position = 'relative';
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.style.display = 'block';
  const grid = document.createElement('div'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', '盤面');
  Object.assign(grid.style, { position: 'absolute', inset: '0' });
  surface.append(canvas, grid);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '盤面をリセット'; reset.className = 'reset-button';
  reset.addEventListener('click', onReset);
  root.append(palette, help, surface, reset);
  let buttons: HTMLButtonElement[] = [];
  function draw() {
    if (!board) return;
    const configured = Number.parseFloat(getComputedStyle(root).getPropertyValue('--board-cell-size'));
    const size = Number.isFinite(configured) ? configured : Math.min(40, Math.floor(root.clientWidth / board.width));
    if (size <= 0) return;
    const width = size * board.width;
    const height = size * board.height;
    surface.style.width = `${width}px`; surface.style.height = `${height}px`;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); renderBoard(ctx, board, proposal, validation, selected, size); }
    buttons.forEach((button, index) => {
      const cell = board!.cells[index]!;
      const observed = cell.value === 'closed' ? '閉じたセル' : cell.value === 'flag' ? '入力旗' : cell.value === 0 ? '空き' : `数字${cell.value}`;
      const suggestion = proposal?.safe.includes(index) ? ' 提案: 安全 S' : proposal?.mines.includes(index) ? ' 提案: 地雷 M' : proposal?.guesses.includes(index) ? ' 提案: 推測 ?' : '';
      const concern = cell.uncertain ? ' 要確認' : validation.status !== 'valid' && validation.cells.includes(index) ? ' 矛盾' : '';
      button.setAttribute('aria-label', `行${Math.floor(index / board!.width) + 1} 列${index % board!.width + 1} ${observed}${suggestion}${concern}`);
      button.setAttribute('aria-selected', String(index === selected)); button.tabIndex = index === selected ? 0 : -1;
      Object.assign(button.style, { position: 'absolute', left: `${index % board!.width * size}px`, top: `${Math.floor(index / board!.width) * size}px`, width: `${size}px`, height: `${size}px`, background: 'transparent', padding: '0', border: '0', borderRadius: '0' });
    });
  }
  function select(index: number) { selected = index; draw(); buttons[index]?.focus(); }
  const click = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-cell]');
    if (!target || !board) return;
    select(Number(target.dataset.cell)); onEdit(selected, tool);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (!board || !(event.target as HTMLElement).matches('[data-cell]')) return;
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (dx || dy) {
      event.preventDefault();
      const x = Math.max(0, Math.min(board.width - 1, selected % board.width + dx));
      const y = Math.max(0, Math.min(board.height - 1, Math.floor(selected / board.width) + dy));
      select(y * board.width + x); return;
    }
    const value: CellValue | null = event.key === '0' || event.key === ' ' ? 0 : event.key.toLowerCase() === 'f' ? 'flag'
      : event.key === 'Delete' ? 'closed' : /^[1-8]$/.test(event.key) ? Number(event.key) as CellValue : null;
    if (value !== null) { event.preventDefault(); onEdit(selected, value); }
  };
  const focusin = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    if (target.dataset.cell !== undefined) { selected = Number(target.dataset.cell); draw(); }
  };
  grid.addEventListener('focusin', focusin);
  grid.addEventListener('click', click); grid.addEventListener('keydown', keydown);
  const observer = new ResizeObserver(draw); observer.observe(root);
  return {
    update(nextBoard, nextProposal, nextValidation) {
      const rebuild = !board || board.width !== nextBoard.width || board.height !== nextBoard.height;
      board = nextBoard; proposal = nextProposal; validation = nextValidation;
      selected = Math.min(selected, board.cells.length - 1);
      grid.setAttribute('aria-rowcount', String(board.height)); grid.setAttribute('aria-colcount', String(board.width));
      if (rebuild) {
        grid.replaceChildren(); buttons = [];
        for (let y = 0; y < board.height; y++) {
          const row = document.createElement('div'); row.setAttribute('role', 'row');
          for (let x = 0; x < board.width; x++) {
            const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'gridcell');
            button.dataset.cell = String(y * board.width + x); button.className = 'board-cell';
            row.append(button); buttons.push(button);
          }
          grid.append(row);
        }
      }
      draw();
    },
    dispose() { observer.disconnect(); grid.removeEventListener('focusin', focusin); grid.removeEventListener('click', click); grid.removeEventListener('keydown', keydown); reset.removeEventListener('click', onReset); root.replaceChildren(); },
  };
}
