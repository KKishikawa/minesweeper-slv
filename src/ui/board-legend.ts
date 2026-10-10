import { createBoard, editCell } from '../board/board';
import type { SolverProposal } from '../solver/types';
import { renderBoard } from './board-renderer';

const rendered = new WeakMap<HTMLCanvasElement, { symbol: string | undefined; dpr: number }>();

// Use the actual board renderer so the legend cannot drift to different glyphs.
export function renderLegend(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-symbol]').forEach(canvas => {
    const symbol = canvas.dataset.symbol;
    const dpr = window.devicePixelRatio || 1;
    const previous = rendered.get(canvas);
    if (previous && previous.symbol === symbol && previous.dpr === dpr) return;
    let board = createBoard(1, 1, 0, 0);
    if (symbol === 'flag' || symbol === 'flag-safe') board = editCell(board, 0, 'flag');
    const proposal: SolverProposal = {
      safe: symbol === 'safe' || symbol === 'flag-safe' ? [0] : [],
      mines: symbol === 'mine' ? [0] : [],
      guesses: symbol === 'guess' ? [0] : [], primaryGuess: null,
    };
    const pixels = Math.round(24 * dpr);
    if (canvas.width !== pixels) canvas.width = pixels;
    if (canvas.height !== pixels) canvas.height = pixels;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderBoard(ctx, board, proposal, { status: 'valid' }, -1, 24);
      rendered.set(canvas, { symbol, dpr });
    }
  });
}
