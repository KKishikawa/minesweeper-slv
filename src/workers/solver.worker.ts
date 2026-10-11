import { validateBoard } from '../board/validate';
import { solve } from '../solver/solve';
import type { SolverRequest, SolverResponse } from './protocol';
import type { SolverStatistics } from '../solver/types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function isRequest(value: unknown): value is SolverRequest {
  if (!record(value) || value.kind !== 'solve' || !integer(value.requestId) || !integer(value.revision)
    || 'policy' in value || !record(value.options)
    || !integer(value.options.maxNodes) || !record(value.board)) return false;
  if ('diagnostics' in value && typeof value.diagnostics !== 'boolean') return false;
  const board = value.board;
  return integer(board.width) && board.width >= 1 && board.width <= 30
    && integer(board.height) && board.height >= 1 && board.height <= 30
    && integer(board.totalMines) && board.totalMines <= board.width * board.height
    && board.revision === value.revision && Array.isArray(board.cells)
    && board.cells.length === board.width * board.height
    && board.cells.every(cell => record(cell) && (cell.source === 'manual' || cell.source === 'recognition')
      && typeof cell.uncertain === 'boolean' && (cell.value === 'closed' || cell.value === 'flag'
        || (integer(cell.value) && cell.value <= 8)));
}
self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isRequest(event.data)) return;
  const request = event.data;
  let response: SolverResponse;
  let statistics: SolverStatistics | undefined;
  let lastSent = -Infinity;
  const observe = request.diagnostics ? (sample: SolverStatistics) => {
    const stageChanged = sample.stage !== statistics?.stage;
    statistics = sample;
    const now = performance.now();
    if (stageChanged || now - lastSent >= 100) {
      self.postMessage({ kind: 'progress', requestId: request.requestId, revision: request.revision, statistics });
      lastSent = now;
    }
  } : undefined;
  try {
    const validation = validateBoard(request.board);
    if (validation.status === 'needs-review') {
      response = { kind: 'error', requestId: request.requestId, revision: request.revision, message: '入力を確認してください' };
    } else {
      const result = solve(request.board, request.options, observe);
      response = { kind: 'result', requestId: request.requestId, revision: request.revision, result };
    }
  } catch (error) {
    response = { kind: 'error', requestId: request.requestId, revision: request.revision,
      message: error instanceof Error ? error.message : String(error) };
  }
  if (statistics) response.statistics = statistics;
  self.postMessage(response);
};
