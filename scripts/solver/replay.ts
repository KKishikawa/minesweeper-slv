import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { BoardSnapshot } from '../../src/board/types';
import type { SolverStatistics } from '../../src/solver/types';
import { solve } from '../../src/solver/solve';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function isBoard(value: unknown): value is BoardSnapshot {
  return record(value) && count(value.width) && value.width >= 1 && value.width <= 30
    && count(value.height) && value.height >= 1 && value.height <= 30
    && count(value.totalMines) && value.totalMines <= value.width * value.height
    && count(value.revision) && Array.isArray(value.cells) && value.cells.length === value.width * value.height
    && value.cells.every(cell => record(cell) && (cell.source === 'manual' || cell.source === 'recognition')
      && typeof cell.uncertain === 'boolean' && (cell.value === 'closed' || cell.value === 'flag'
        || (count(cell.value) && cell.value <= 8)));
}

// Replays the synchronous solver only. Worker startup, timeout and cancellation
// are measured in the browser and cannot be reconstructed from a JSON snapshot.
export function replayDiagnosticExport(input: unknown, entryIndex: number) {
  if (!record(input) || input.schemaVersion !== 1 || !Array.isArray(input.entries)) throw new Error('Unsupported diagnostic JSON (expected schemaVersion 1)');
  if (!count(entryIndex) || entryIndex >= input.entries.length) throw new Error('Diagnostic entry index is out of range');
  const entry: unknown = input.entries[entryIndex];
  if (!record(entry) || !isBoard(entry.board) || !count(entry.maxNodes)
    || (entry.effectivePolicy !== 'trusted' && entry.effectivePolicy !== 'reconsidered')) throw new Error('Malformed diagnostic entry');
  if (entry.effectivePolicy === 'reconsidered') throw new Error('再検討方式は削除されたため、元のbuild commitの旧版で再実行する必要があります。');
  let statistics: SolverStatistics | null = null;
  const result = solve(entry.board, { maxNodes: entry.maxNodes }, sample => { statistics = sample; });
  return { entryIndex, sourceBuild: input.build ?? null, originalOutcome: entry.outcome ?? null,
    effectivePolicy: entry.effectivePolicy, maxNodes: entry.maxNodes,
    workerTimeoutReproduced: false, result, statistics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [file, index = '0', ...extra] = process.argv.slice(2);
    if (!file || !/^\d+$/.test(index) || extra.length) throw new Error('Usage: npm run diagnostics:replay -- <export.json> [entry-index (zero-based)]');
    process.stdout.write(JSON.stringify(replayDiagnosticExport(JSON.parse(readFileSync(file, 'utf8')), Number(index)), null, 2) + '\n');
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
