import type { BoardSnapshot, ValidationResult } from '../board/types';
import type { SolverProposal } from '../solver/types';

export function hitTest(x: number, y: number, cellSize: number, width: number, height: number): number | null {
  if (![x, y, cellSize].every(Number.isFinite) || cellSize <= 0 || x < 0 || y < 0 || x >= width * cellSize || y >= height * cellSize) return null;
  return Math.floor(y / cellSize) * width + Math.floor(x / cellSize);
}
function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.strokeStyle = '#8b452c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + height); ctx.stroke();
  ctx.fillStyle = '#ac4b2f'; ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + height * .27); ctx.lineTo(x, y + height * .53); ctx.closePath(); ctx.fill();
}

export function renderBoard(ctx: CanvasRenderingContext2D, board: BoardSnapshot, proposal: SolverProposal | null,
  validation: ValidationResult, selected: number, cellSize: number): void {
  ctx.clearRect(0, 0, board.width * cellSize, board.height * cellSize);
  const invalid = new Set(validation.status === 'valid' ? [] : validation.cells);
  const safe = new Set(proposal?.safe);
  const mines = new Set(proposal?.mines);
  const guesses = new Set(proposal?.guesses);
  board.cells.forEach((cell, index) => {
    const x = (index % board.width) * cellSize;
    const y = Math.floor(index / board.width) * cellSize;
    const hasProposal = safe.has(index) || mines.has(index) || guesses.has(index);
    const flagWithProposal = cell.value === 'flag' && hasProposal;
    const cx = x + cellSize * (flagWithProposal ? .66 : .5);
    const cy = y + cellSize / 2;
    ctx.save();
    ctx.fillStyle = typeof cell.value === 'number' ? '#f8fafb' : '#dce6e9';
    ctx.fillRect(x, y, cellSize, cellSize);
    ctx.strokeStyle = '#a6b8bf';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(cellSize * 0.52)}px system-ui`;
    ctx.fillStyle = '#173b51';
    if (typeof cell.value === 'number' && cell.value > 0) ctx.fillText(String(cell.value), cx, cy + 1);
    if (cell.value === 'flag') {
      // Keep the pole and pennant inside the focus border, beside any proposal.
      if (flagWithProposal) drawFlag(ctx, x + cellSize * .22, y + cellSize * .25, cellSize * .22, cellSize * .5);
      else drawFlag(ctx, x + cellSize * .35, y + cellSize * .2, cellSize * .41, cellSize * .6);
    }
    if (hasProposal) {
      ctx.fillStyle = safe.has(index) ? '#e0f6ea' : mines.has(index) ? '#fff0e4' : '#fff7c9';
      ctx.strokeStyle = safe.has(index) ? '#146743' : mines.has(index) ? '#873c20' : '#7a6211';
      const r = cellSize * (flagWithProposal ? .18 : .32);
      ctx.lineWidth = 1.5; ctx.beginPath();
      if (safe.has(index)) ctx.arc(cx, cy, r, 0, Math.PI * 2);
      else if (mines.has(index)) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); }
      else ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
      ctx.fill(); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `700 ${Math.round(cellSize * (flagWithProposal ? .36 : .4))}px system-ui`;
      ctx.fillText(safe.has(index) ? 'S' : mines.has(index) ? 'M' : '?', cx, cy + 1);
    }
    if (cell.uncertain) { ctx.setLineDash([3, 2]); ctx.strokeStyle = '#945c00'; ctx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6); ctx.setLineDash([]); }
    if (invalid.has(index)) { ctx.fillStyle = '#b32229'; ctx.font = `bold ${cellSize * .65}px system-ui`; ctx.fillText('×', cx, cy); }
    if (index === selected) {
      ctx.strokeStyle = '#163b54'; ctx.lineWidth = 1.5;
      // Selection stays at the perimeter; the CSS keyboard focus ring uses the same free margin.
      ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
    }
    ctx.restore();
  });
}
