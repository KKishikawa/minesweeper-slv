import type { BoardSnapshot } from '../board/types';
import type { SolverRequest } from '../workers/protocol';
import type { SolverRunDiagnostic } from './solver-client';

export interface BuildIdentity { version: string; commit: string | null; dirty: boolean | null }
export interface DiagnosticEntry {
  requestId: number;
  revision: number;
  startedAt: string;
  board: BoardSnapshot;
  policy: 'trusted';
  effectivePolicy: 'trusted';
  autoReconsider: false;
  maxNodes: number;
  timeoutMs: number;
  diagnostic: SolverRunDiagnostic | null;
}

// Memory only. Removing or disabling in-flight entries prevents later responses
// from restoring deleted history or recording after the user switches OFF.
export function createDiagnosticHistory() {
  let enabled = false;
  let entries: DiagnosticEntry[] = [];
  return {
    get enabled() { return enabled; },
    setEnabled(value: boolean) {
      enabled = value;
      if (!enabled) entries = entries.filter(entry => entry.diagnostic !== null);
    },
    start(request: SolverRequest, context: { timeoutMs?: number }) {
      if (!enabled) return;
      entries.push({ requestId: request.requestId, revision: request.revision, startedAt: new Date().toISOString(),
        board: structuredClone(request.board), policy: 'trusted', effectivePolicy: 'trusted',
        autoReconsider: false, maxNodes: request.options.maxNodes, timeoutMs: context.timeoutMs ?? 5000, diagnostic: null });
      if (entries.length > 100) entries.shift();
    },
    finish(diagnostic: SolverRunDiagnostic) {
      const entry = entries.find(entry => entry.requestId === diagnostic.requestId && entry.revision === diagnostic.revision);
      if (!entry || entry.diagnostic !== null) return;
      entry.diagnostic = structuredClone(diagnostic);
    },
    entries() { return structuredClone(entries); },
    get count() { return entries.length; },
    clear() { entries = []; },
    exportJson(build: BuildIdentity): string {
      return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), build,
        entries: entries.map(({ diagnostic, ...entry }) => ({ ...entry,
          ...(diagnostic ?? { outcome: 'running', elapsedMs: null,
            statistics: null, statisticsSource: 'unavailable', error: null }) })) }, null, 2) + '\n';
    },
  };
}
