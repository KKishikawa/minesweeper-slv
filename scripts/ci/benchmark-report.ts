import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TEST_GROUPS } from "./test-groups.js";

export type Condition = "A" | "B" | "C";
export interface FileTiming { path: string; elapsedMs: number; assertionMs: number; tests: string[]; statuses: string[] }
export interface JobTiming { name: string; conclusion: string | null; startedAt: string | null; completedAt: string | null; steps: { name: string; conclusion: string | null; startedAt: string | null; completedAt: string | null }[]; labels: string[] }
export interface ArtifactTiming { group: string; durationMs: number; maxRssKiB: number | null; rssScope: string; rssUnavailableReason: string | null; nodeVersion: string; chromiumVersion: string | null; exitCode: number; signal: string | null; reportMissing: boolean }
export interface BenchmarkRun { condition: Condition | null; runId: number; attempt: number; controlSha: string | null; targetSha: string | null; conclusion: string | null; createdAt: string | null; startedAt: string | null; finishedAt: string | null; jobs: JobTiming[]; files: FileTiming[]; artifacts: ArtifactTiming[]; missingArtifacts: string[]; issues: string[] }
export interface Statistics { median: number | null; min: number | null; max: number | null }
export interface RunMetrics { queueSeconds: number | null; workflowStartDelaySeconds: number | null; preparationSeconds: number | null; wallSeconds: number | null; totalSeconds: number | null; runnerMinutes: number | null }
export interface JobWait { name: string; readyAt: string | null; startedAt: string | null; waitSeconds: number | null; readyBasis: string; estimated: true }
export interface HeavyFileSummary { path: string; elapsedMs: Statistics; assertionMs: Statistics; presentRuns: number; missingRuns: number; unavailableReason: string | null }
export interface ConditionSummary { count: number; workflowStartDelaySeconds: Statistics; totalSeconds: Statistics; heavyFiles: HeavyFileSummary[]; queueSeconds: Statistics; preparationSeconds: Statistics; wallSeconds: Statistics; runnerMinutes: Statistics; files: { path: string; elapsedMs: Statistics; assertionMs: Statistics }[]; commonFileElapsedMs: Statistics; configurationElapsedMs: Statistics }
export interface BenchmarkComparison { comparable: boolean; reasons: string[]; runs: (BenchmarkRun & { metrics: RunMetrics; jobWaits: JobWait[] })[]; historicalReference: Record<Condition, { measuredWallSeconds: number | null; savedSeconds: number | null; reductionPercent: number | null }>; conditions: Record<Condition, ConditionSummary>; reductions: { AtoB: number | null; BtoC: number | null; AtoC: number | null }; testSetDifferences: { runId: number; attempt: number; added: string[]; removed: string[]; addedFiles: string[]; removedFiles: string[]; allowedConfigurationDifference: boolean }[]; commonFilePaths: string[] }
export interface Transport { json(endpoint: string, paginate: boolean): Promise<unknown>; artifact(repository: string, id: number, entry: "metadata.json" | "vitest.json"): Promise<string> }
const BASELINE = "1a01eac18f389e7933be9937ad7fa4aa8be476b7";
const CONDITIONS = ["A", "B", "C"] as const;
const HISTORICAL_SECONDS = 755;
const HEAVY_FILES = [
  "test/recognition/formal-runner.test.ts", "test/recognition/folds.test.ts", "test/recognition/generated-bank.test.ts",
  "test/recognition/browser-grid-resample.test.ts", "test/recognition/browser-grid-fallback.test.ts", "test/recognition/evaluate-grid-fallback.test.ts",
] as const;
// Issue-approved configuration changes; evaluation/test paths are never broadly exempted.
const ADDED_CI_FILES = new Set(["test-groups", "quality-result", "run-tests", "benchmark-report"].map(name => `test/ci/${name}.test.ts`));
const FOUNDATION_FILE = "test/repository-foundation.test.ts";
const configurationFile = (path: string) => ADDED_CI_FILES.has(path) || path === FOUNDATION_FILE;
function statistics(values: (number | null)[]): Statistics {
  const sorted = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { median: sorted.length ? (sorted[middle]! + sorted[Math.floor((sorted.length - 1) / 2)]!) / 2 : null, min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
}
function seconds(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const result = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function selectedJobs(run: BenchmarkRun): JobTiming[] {
  return run.jobs.filter(job => run.condition === "C" ? job.name.startsWith("Grouped / ") : job.name === `Serial / ${run.condition}`);
}
function metrics(run: BenchmarkRun): RunMetrics {
  const selected = selectedJobs(run);
  const first = selected.flatMap(job => job.startedAt ? [job.startedAt] : []).sort()[0];
  const last = run.condition === "C" ? run.jobs.find(job => job.name === "Benchmark / quality")?.completedAt : selected[0]?.completedAt;
  const executed = run.jobs.filter(job => job.conclusion !== "skipped");
  const durations = executed.map(job => seconds(job.startedAt, job.completedAt));
  return { queueSeconds: seconds(run.createdAt, first), workflowStartDelaySeconds: seconds(run.createdAt, run.startedAt), totalSeconds: seconds(run.createdAt, last), preparationSeconds: seconds(run.startedAt, first), wallSeconds: seconds(first, last), runnerMinutes: durations.some(d => d === null) || !durations.length ? null : durations.reduce<number>((sum, d) => sum + d!, 0) / 60 };
}
// The API exposes starts/completions, not dependency-ready/enqueued timestamps.
// These are elapsed dependency-ready-to-start estimates, not pure runner queue telemetry.
function jobWaits(run: BenchmarkRun): JobWait[] {
  const validateEnd = run.jobs.find(job => job.name === "validate")?.completedAt ?? null;
  const regressionEnds = TEST_GROUPS.map(group => run.jobs.find(job => job.name === `Grouped / ${group}`)?.completedAt ?? null);
  const qualityReady = regressionEnds.every(end => end !== null) ? [...regressionEnds].sort().at(-1) ?? null : null;
  return run.jobs.map((job): JobWait => {
    let readyAt: string | null = null;
    let readyBasis = "unknown workflow dependency";
    if (job.conclusion === "skipped") readyBasis = "not executed";
    else if (job.name === "validate") { readyAt = run.createdAt; readyBasis = "workflow created_at"; }
    else if (job.name.startsWith("Serial / ") || job.name.startsWith("Grouped / ")) { readyAt = validateEnd; readyBasis = "validate completed_at"; }
    else if (job.name === "Benchmark / quality") { readyAt = qualityReady; readyBasis = "all regression completed_at"; }
    return { name: job.name, readyAt, startedAt: job.startedAt, waitSeconds: seconds(readyAt, job.startedAt), readyBasis, estimated: true };
  });
}
function testSet(run: BenchmarkRun): string[] { return run.files.flatMap(file => file.tests.map(test => `${file.path} :: ${test}`)).sort(); }
export function summarizeRuns(input: readonly BenchmarkRun[]): BenchmarkComparison {
  const runs = input.map(run => ({ ...run, metrics: metrics(run), jobWaits: jobWaits(run) }));
  const reasons: string[] = [];
  const testSetDifferences: BenchmarkComparison["testSetDifferences"] = [];
  const reference = runs.find(run => run.condition === "A") ?? runs[0];
  const referenceSet = new Set(reference ? testSet(reference) : []);
  const referenceFiles = new Set(reference?.files.map(file => file.path) ?? []);
  const commonFilePaths = [...referenceFiles].filter(path => !configurationFile(path) && runs.every(run => run.files.some(file => file.path === path))).sort();
  const targetSets = new Map<string | null, string>();
  const identities = new Set<string>();
  for (const run of runs) {
    const prefix = `run ${run.runId}:${run.attempt}`;
    const issue = (message: string) => reasons.push(`${prefix}: ${message}`);
    if (identities.has(prefix)) issue("duplicate run/attempt"); identities.add(prefix);
    if (!run.condition) issue("condition unknown");
    if (run.attempt !== 1) issue(`rerun attempt ${run.attempt}; retain and remeasure independently`);
    if (run.conclusion !== "success") issue(`run conclusion ${run.conclusion ?? "pending"}`);
    run.issues.forEach(issue); run.missingArtifacts.forEach(name => issue(`missing artifact ${name}`));
    if (!run.controlSha || !run.targetSha) issue("missing control/target SHA");
    if (run.condition === "A" && run.targetSha !== BASELINE) issue("A target SHA is not fixed baseline");
    const selected = selectedJobs(run);
    const expected = run.condition === "C" ? TEST_GROUPS.map(group => `Grouped / ${group}`) : [`Serial / ${run.condition}`];
    for (const name of ["validate", ...expected, ...(run.condition === "C" ? ["Benchmark / quality"] : [])]) {
      const jobs = run.jobs.filter(job => job.name === name);
      if (jobs.length !== 1) issue(`expected exactly one job ${name}`);
      for (const job of jobs) if (job.conclusion !== "success") issue(`${name}: ${job.conclusion ?? "pending"}`);
    }
    for (const [key, value] of Object.entries(run.metrics)) if (value === null) issue(`missing/invalid ${key} timestamps`);
    for (const wait of run.jobWaits) if (wait.readyBasis !== "not executed" && wait.waitSeconds === null) issue(`${wait.name}: dependency wait unmeasured`);
    if (!selected.length || !run.files.length || !run.artifacts.length) issue("missing regression results");
    for (const group of run.condition === "C" ? TEST_GROUPS : ["all"]) {
      if (!run.artifacts.some(artifact => artifact.group === group)) issue(`missing ${group} metadata`);
      if (run.artifacts.filter(artifact => artifact.group === group).length > 1) issue(`duplicate ${group} metadata`);
    }
    for (const artifact of run.artifacts) {
      if (artifact.exitCode !== 0 || artifact.signal || artifact.reportMissing) issue(`${artifact.group}: child failure/signal/JSON missing`);
      if (artifact.maxRssKiB === null) issue(`${artifact.group}: RSS unmeasured (${artifact.rssUnavailableReason ?? "unknown"})`);
    }
    if (run.files.some(file => file.statuses.some(status => status !== "passed"))) issue("non-passed assertion (failure/pending/todo)");
    const current = new Set(testSet(run));
    const added = [...current].filter(test => !referenceSet.has(test));
    const removed = [...referenceSet].filter(test => !current.has(test));
    const currentFiles = new Set(run.files.map(file => file.path));
    const addedFiles = [...currentFiles].filter(path => !referenceFiles.has(path));
    const removedFiles = [...referenceFiles].filter(path => !currentFiles.has(path));
    if (added.length || removed.length || addedFiles.length || removedFiles.length) {
      const allowedConfigurationDifference = run.condition !== "A" && reference?.condition === "A" && removedFiles.length === 0
        && addedFiles.every(path => ADDED_CI_FILES.has(path))
        && [...added, ...removed].every(test => {
          const path = test.split(" :: ")[0]!;
          return path === FOUNDATION_FILE || (addedFiles.includes(path) && ADDED_CI_FILES.has(path));
        });
      if (!allowedConfigurationDifference) issue("test set differs");
      testSetDifferences.push({ runId: run.runId, attempt: run.attempt, added, removed, addedFiles, removedFiles, allowedConfigurationDifference });
    }
    const currentIdentity = JSON.stringify({ files: [...currentFiles].sort(), tests: [...current].sort() });
    const priorIdentity = targetSets.get(run.targetSha);
    if (priorIdentity && priorIdentity !== currentIdentity) issue("same target SHA test set differs");
    targetSets.set(run.targetSha, currentIdentity);
    if (run.files.length !== new Set(run.files.map(file => file.path)).size) issue("duplicate test files");
  }
  const control = new Set(runs.map(run => run.controlSha));
  if (control.size > 1) reasons.push("mixed control SHA");
  const targets = new Set(runs.filter(run => run.condition === "B" || run.condition === "C").map(run => run.targetSha));
  if (targets.size > 1) reasons.push("mixed B/C target SHA");
  const versions = new Set(runs.flatMap(run => run.artifacts.map(a => `${a.nodeVersion}/${a.chromiumVersion}`)));
  if (versions.size > 1 || runs.some(run => run.artifacts.some(a => !a.chromiumVersion || !a.nodeVersion))) reasons.push("Node/Chromium environment differs or missing");
  const labels = new Set(runs.flatMap(run => selectedJobs(run).map(job => [...job.labels].sort().join(","))));
  if (labels.size > 1) reasons.push("runner labels differ");
  const conditions = Object.fromEntries(CONDITIONS.map(condition => {
    const subset = runs.filter(run => run.condition === condition);
    if (subset.length < 3) reasons.push(`${condition}: at least 3 runs required (${subset.length})`);
    const paths = [...new Set(subset.flatMap(run => run.files.map(file => file.path)))];
    const files = paths.map(path => {
      const durations = subset.flatMap(run => run.files.filter(file => file.path === path));
      return { path, elapsedMs: statistics(durations.map(file => file.elapsedMs)), assertionMs: statistics(durations.map(file => file.assertionMs)) };
    }).sort((a, b) => (b.elapsedMs.median ?? 0) - (a.elapsedMs.median ?? 0));
    const heavyFiles = HEAVY_FILES.map(path => {
      const timings = subset.map(run => run.files.find(file => file.path === path));
      const missingRuns = timings.filter(file => file === undefined).length;
      return { path, presentRuns: subset.length - missingRuns, missingRuns, unavailableReason: !subset.length ? "no runs" : missingRuns ? `file missing in runs ${subset.filter((_, index) => timings[index] === undefined).map(run => `${run.runId}:${run.attempt}`).join(", ")}` : null, elapsedMs: statistics(missingRuns ? [] : timings.map(file => file?.elapsedMs ?? null)), assertionMs: statistics(missingRuns ? [] : timings.map(file => file?.assertionMs ?? null)) };
    });
    return [condition, { count: subset.length, heavyFiles, workflowStartDelaySeconds: statistics(subset.map(run => run.metrics.workflowStartDelaySeconds)), totalSeconds: statistics(subset.map(run => run.metrics.totalSeconds)), queueSeconds: statistics(subset.map(run => run.metrics.queueSeconds)), preparationSeconds: statistics(subset.map(run => run.metrics.preparationSeconds)), wallSeconds: statistics(subset.map(run => run.metrics.wallSeconds)), runnerMinutes: statistics(subset.map(run => run.metrics.runnerMinutes)), files, commonFileElapsedMs: statistics(subset.map(run => run.files.filter(file => commonFilePaths.includes(file.path)).reduce((sum, file) => sum + file.elapsedMs, 0))), configurationElapsedMs: statistics(subset.map(run => run.files.filter(file => configurationFile(file.path)).reduce((sum, file) => sum + file.elapsedMs, 0))) }];
  })) as Record<Condition, ConditionSummary>;
  const comparable = !reasons.length;
  const reduction = (from: Condition, to: Condition) => {
    const a = conditions[from].wallSeconds.median; const b = conditions[to].wallSeconds.median;
    return comparable && a !== null && b !== null && a > 0 ? (a - b) / a * 100 : null;
  };
  const historicalReference = Object.fromEntries(CONDITIONS.map(condition => {
    const measuredWallSeconds = comparable ? conditions[condition].wallSeconds.median : null;
    return [condition, { measuredWallSeconds, savedSeconds: measuredWallSeconds === null ? null : HISTORICAL_SECONDS - measuredWallSeconds, reductionPercent: measuredWallSeconds === null ? null : (HISTORICAL_SECONDS - measuredWallSeconds) / HISTORICAL_SECONDS * 100 }];
  })) as BenchmarkComparison["historicalReference"];
  return { comparable, reasons, runs, conditions, historicalReference, reductions: { AtoB: reduction("A", "B"), BtoC: reduction("B", "C"), AtoC: reduction("A", "C") }, testSetDifferences, commonFilePaths };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("Expected JSON array"); return value; }
function string(value: unknown): string { if (typeof value !== "string") throw new Error("Expected string"); return value; }
function nullableString(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Expected nonnegative number"); return value; }
export function parseVitestReport(value: unknown): FileTiming[] {
  const report = object(value);
  if (typeof report.success !== "boolean") throw new Error("Missing Vitest success");
  return array(report.testResults).map(value => {
    const file = object(value); const name = string(file.name).replaceAll("\\", "/");
    const marker = name.lastIndexOf("/test/");
    const path = marker >= 0 ? name.slice(marker + 1) : name;
    if (!path.startsWith("test/") || path.includes("../")) throw new Error("Unknown Vitest file path");
    const start = number(file.startTime); const end = number(file.endTime);
    if (end < start) throw new Error("Invalid Vitest file times");
    const assertions = array(file.assertionResults).map(object);
    return { path, elapsedMs: end - start, assertionMs: assertions.reduce((sum, a) => sum + (a.duration == null ? 0 : number(a.duration)), 0), tests: assertions.map(a => string(a.fullName)), statuses: assertions.map(a => string(a.status)) };
  });
}
const defaultTransport: Transport = {
  async json(endpoint, paginate) {
    const args = ["api", endpoint, ...(paginate ? ["--paginate", "--slurp"] : [])];
    return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
  },
  async artifact(repository, id, entry) {
    const directory = mkdtempSync(resolve(tmpdir(), "ci-benchmark-"));
    try {
      const archive = resolve(directory, "artifact.zip");
      writeFileSync(archive, execFileSync("gh", ["api", `repos/${repository}/actions/artifacts/${id}/zip`], { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
      return execFileSync("unzip", ["-p", archive, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  },
};
export async function collectRun(repository: string, id: string, transport: Transport = defaultTransport): Promise<BenchmarkRun> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^\d+(?::[1-9]\d*)?$/.test(id)) throw new Error("Invalid repository or run ID[:attempt]");
  const [runId, requestedAttempt] = id.split(":").map(Number);
  const run: BenchmarkRun = { condition: null, runId: runId!, attempt: requestedAttempt || 1, controlSha: null, targetSha: null, conclusion: null, createdAt: null, startedAt: null, finishedAt: null, jobs: [], files: [], artifacts: [], missingArtifacts: [], issues: [] };
  const endpoint = `repos/${repository}/actions/runs/${runId}`;
  try {
    const info = object(await transport.json(requestedAttempt ? `${endpoint}/attempts/${requestedAttempt}` : endpoint, false));
    run.attempt = number(info.run_attempt); run.controlSha = nullableString(info.head_sha); run.conclusion = nullableString(info.conclusion);
    run.createdAt = nullableString(info.created_at); run.startedAt = nullableString(info.run_started_at); run.finishedAt = nullableString(info.updated_at);
    const pages = array(await transport.json(`${endpoint}/attempts/${run.attempt}/jobs`, true));
    run.jobs = pages.flatMap(page => array(object(page).jobs)).map(value => {
      const job = object(value);
      return { name: string(job.name), conclusion: nullableString(job.conclusion), startedAt: nullableString(job.started_at), completedAt: nullableString(job.completed_at), labels: job.labels ? array(job.labels).map(string) : [], steps: array(job.steps).map(value => { const s = object(value); return { name: string(s.name), conclusion: nullableString(s.conclusion), startedAt: nullableString(s.started_at), completedAt: nullableString(s.completed_at) }; }) };
    });
    const hinted = run.jobs.find(job => /^Serial \/ [AB]$/.test(job.name))?.name.at(-1);
    if (hinted === "A" || hinted === "B") run.condition = hinted;
    else if (run.jobs.some(job => job.name.startsWith("Grouped / ") && job.conclusion !== "skipped")) run.condition = "C";
    const artifactPages = array(await transport.json(`${endpoint}/artifacts`, true));
    const artifacts = artifactPages.flatMap(page => array(object(page).artifacts)).map(object).filter(a => /^benchmark-[ABC]-/.test(string(a.name)));
    const seen = new Set<string>();
    for (const artifact of artifacts) {
      const name = string(artifact.name);
      if (seen.has(name)) run.issues.push(`duplicate artifact ${name}; attempt attribution ambiguous`); seen.add(name);
      if (artifact.expired === true) { run.missingArtifacts.push(`${name} (expired)`); continue; }
      const artifactId = number(artifact.id);
      let metadata: Record<string, unknown>;
      try { metadata = object(JSON.parse(await transport.artifact(repository, artifactId, "metadata.json"))); }
      catch { run.missingArtifacts.push(`${name}/metadata.json`); continue; }
      try {
        if (metadata.schemaVersion !== 1) throw new Error("Unsupported schema");
        const condition = string(metadata.condition); const group = string(metadata.group);
        if (!CONDITIONS.some(c => c === condition) || name !== `benchmark-${condition}-${group}` || (condition === "C" ? !TEST_GROUPS.some(g => g === group) : group !== "all")) throw new Error("Artifact identity mismatch");
        if (run.condition && run.condition !== condition) throw new Error("Condition mismatch");
        run.condition = condition as Condition;
        const controlSha = string(metadata.controlSha); const targetSha = string(metadata.targetSha);
        if (!/^[a-f\d]{40}$/i.test(controlSha) || !/^[a-f\d]{40}$/i.test(targetSha) || (run.controlSha && run.controlSha !== controlSha) || (run.targetSha && run.targetSha !== targetSha)) throw new Error("SHA mismatch");
        run.controlSha = controlSha; run.targetSha = targetSha;
        if (metadata.spawnError) run.issues.push(`${name}: spawn error`);
        if (typeof metadata.reportMissing !== "boolean") throw new Error("Missing report flag");
        run.artifacts.push({ group, durationMs: number(metadata.durationMs), maxRssKiB: metadata.maxRssKiB === null ? null : number(metadata.maxRssKiB), rssScope: string(metadata.rssScope), rssUnavailableReason: nullableString(metadata.rssUnavailableReason), nodeVersion: string(metadata.nodeVersion), chromiumVersion: nullableString(metadata.chromiumVersion), exitCode: number(metadata.exitCode), signal: nullableString(metadata.signal), reportMissing: metadata.reportMissing });
      } catch { run.issues.push(`${name}: invalid/inconsistent metadata`); continue; }
      try { const json = JSON.parse(await transport.artifact(repository, artifactId, "vitest.json")); if (object(json).success !== true) run.issues.push(`${name}: Vitest success false`); run.files.push(...parseVitestReport(json)); }
      catch { run.missingArtifacts.push(`${name}/vitest.json (missing or invalid)`); }
    }
    const groups = run.condition === "C" ? TEST_GROUPS : ["all"];
    for (const group of groups) if (!run.artifacts.some(a => a.group === group)) run.missingArtifacts.push(`benchmark-${run.condition ?? "unknown"}-${group}`);
  } catch { run.issues.push("GitHub API collection failed"); }
  return run;
}
function shown(value: number | null): string { return value === null ? "未測定" : value.toFixed(2); }
function range(stat: Statistics): string { return `${shown(stat.median)} (${shown(stat.min)}–${shown(stat.max)})`; }
export function renderComparison(comparison: BenchmarkComparison): string {
  const lines = ["# CI performance comparison", "", `比較状態: ${comparison.comparable ? "比較可能" : "比較不可 / 未測定条件あり"}。異常runも全件保持。`, "", "条件別の値は中央値 (最小–最大)。canonical queueはAPI created_at→最初の選択検証job開始。workflow開始遅延はcreated_at→run_started_at、準備はrun_started_at→最初の検証開始で、queueの細分値。wallはA/B serial開始→終了、C最初のgroup開始→quality終了。queue込み総時間はcreated_at→その検証終了。runner分数はvalidateとqualityを含む、実行した全job時間の合計。", "", "| 条件 | run数 | canonical queue秒 | workflow開始遅延秒 | 準備秒 | 検証wall秒 | queue込み総秒 | 総runner分数 |", "| --- | ---: | --- | --- | --- | --- | --- | --- |"];
  for (const condition of CONDITIONS) { const s = comparison.conditions[condition]; lines.push(`| ${condition} | ${s.count} | ${range(s.queueSeconds)} | ${range(s.workflowStartDelaySeconds)} | ${range(s.preparationSeconds)} | ${range(s.wallSeconds)} | ${range(s.totalSeconds)} | ${range(s.runnerMinutes)} |`); }
  lines.push("", ...Object.entries(comparison.reductions).map(([key, value]) => `${key}: ${value === null ? "未測定 / 比較不可" : `${shown(value)}%`}`), "", "歴史的記録: 12分35秒 (755秒)。別環境・過去runの参考値でありAの代用にはしない。目安8分48秒 (528秒) だけで完了判定しない。A→Cの3回以上の同条件比較が必要。", "", "A/B評価実装は同一（Task 4で安全な再計算削減なし）。B/Cは同じtarget SHA。許容する差分はこのIssueの4既知CI unit testファイルの追加とfoundation構成assertionの追加/置換のみ。同一target SHA内の差は許容しない。全差分へ記録し、既存評価assertionの固定は別途diffで確認する。", "", "## 比較を妨げる条件", "", ...(comparison.reasons.length ? comparison.reasons.map(reason => `- ${reason}`) : ["- なし"]), "", "## 重い6ファイル (elapsedとassertion合計を分離)", "", "Vitest testResults[].endTime-startTimeは最早assertion開始→最終assertion終了のミリ秒（module import/transformや前後setup全体を含まない）。assertionResults[].duration合計はassertion時間でありelapsedの代用にしない。絶対checkoutパスはtest/から正規化。numTotalTestSuitesはファイル数として使用しない。");
  for (const condition of CONDITIONS) {
    lines.push("", `### ${condition}`, "", "| 固定ファイル | elapsed ms 中央値 (範囲) | assertion ms 中央値 (範囲) | 計測run数 | 欠測理由 |", "| --- | --- | --- | --- | --- |");
    lines.push(...comparison.conditions[condition].heavyFiles.map(f => `| ${f.path} | ${range(f.elapsedMs)} | ${range(f.assertionMs)} | ${f.presentRuns}/${comparison.conditions[condition].count} | ${f.unavailableReason ?? "none"} |`));
  }
  lines.push("", "## 歴史的755秒に対する参考比較", "", "対象は条件別の検証wall中央値。差秒=755−wall、率=(755−wall)/755×100。別環境・過去runの参考比較で、A→C判定から独立する。未測定または比較不可ならnull/未測定とし、成功runだけを選別しない。", "", "| 条件 | 実測wall中央値 秒 | 歴史値との差秒 | 歴史値に対する短縮率 |", "| --- | --- | --- | --- |");
  for (const condition of CONDITIONS) { const h = comparison.historicalReference[condition]; lines.push(`| ${condition} | ${shown(h.measuredWallSeconds)} | ${shown(h.savedSeconds)} | ${h.reductionPercent === null ? "未測定" : `${shown(h.reductionPercent)}%`} |`); }
  lines.push("", "## 各jobの依存待ち時間（推定）", "", "Actions APIはdependency-ready/enqueued時刻を提供しないため、依存ready推定→started_atを保存する。validate ready=workflow created_at（初期workflow schedulingを含む）、serial/regression ready=validate completed_at、quality ready=全5regressionの最遅completed_at。scheduleとrunner待ちを含むelapsed推定であり、純粋なrunner queue実測ではない。欠落/矛盾する依存時刻はnull/未測定、意図的skipは未実行。", "", "| run:attempt | job | ready推定 UTC | start UTC | 待ち秒 | ready根拠 |", "| --- | --- | --- | --- | --- | --- |");
  for (const run of comparison.runs) for (const wait of run.jobWaits) lines.push(`| ${run.runId}:${run.attempt} | ${wait.name} | ${wait.readyAt ?? "未測定"} | ${wait.startedAt ?? "未測定"} | ${shown(wait.waitSeconds)} | ${wait.readyBasis} |`);
  if (!comparison.runs.length) lines.push("| 未測定 | 未測定 | 未測定 | 未測定 | 未測定 | no runs |");
  lines.push("", "## 共通既存ファイルと構成検証の時間", "", `全runに共通する既存ファイル ${comparison.commonFilePaths.length}件（foundationと4既知CI unit testを除外）。各file時間は上記とJSONへ保持。合計はassertion-spanの和であり並列wall timeではない。`, "", "| 条件 | 共通file elapsed ms 合計 中央値 (範囲) | 構成検証 elapsed ms 合計 中央値 (範囲) |", "| --- | --- | --- |");
  for (const condition of CONDITIONS) { const summary = comparison.conditions[condition]; lines.push(`| ${condition} | ${range(summary.commonFileElapsedMs)} | ${range(summary.configurationElapsedMs)} |`); }
  lines.push("", "## run別の記録", "", "JSON詳細には全job/step UTC時刻、結論、再実行attempt、欠落artifact、ファイル時間/全assertion集合、RSS値とscopeを保存。RSSはGNU timeのcommandとwaited-for descendantsの最大値であり、全processの同時RSS合計ではない。", "");
  for (const run of comparison.runs) { lines.push(`- run ${run.runId}:${run.attempt}, ${run.condition ?? "unknown"}, ${run.conclusion ?? "pending"}; control=${run.controlSha ?? "unknown"}; target=${run.targetSha ?? "unknown"}; queue=${shown(run.metrics.queueSeconds)}s; preparation=${shown(run.metrics.preparationSeconds)}s; wall=${shown(run.metrics.wallSeconds)}s; queue-inclusive total=${shown(run.metrics.totalSeconds)}s; workflow-start delay=${shown(run.metrics.workflowStartDelaySeconds)}s; runner=${shown(run.metrics.runnerMinutes)}min`); for (const a of run.artifacts) lines.push(`  - ${a.group}: child=${a.durationMs}ms, RSS=${a.maxRssKiB ?? "未測定"}KiB; scope=${a.rssScope}; unavailable=${a.rssUnavailableReason ?? "none"}`); }
  if (!comparison.runs.length) lines.push("- 未測定。Actions run IDは未取得。remote failure/cancel/timeout/flaky検証、Linux GNU time測定、A/B/C最低各3回は保留。");
  lines.push("", "## 検証集合差", "");
  if (!comparison.testSetDifferences.length) lines.push(comparison.runs.length ? "差分なし。" : "未測定。baselineとの差分は実run取得後に照合する。");
  for (const diff of comparison.testSetDifferences) lines.push(`run ${diff.runId}:${diff.attempt} (${diff.allowedConfigurationDifference ? "approved configuration difference" : "comparison blocker"})`, ...diff.addedFiles.map(path => `- added file (${path.startsWith("test/ci/") ? "CI unit test" : "review required"}): ${path}`), ...diff.removedFiles.map(path => `- removed baseline file (review required): ${path}`), ...diff.added.map(test => `- added: ${test}`), ...diff.removed.map(test => `- removed: ${test}`));
  return `${lines.join("\n")}\n`;
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string) => { const index = args.indexOf(name); if (index < 0 || index + 1 >= args.length) throw new Error(`Required ${name}`); return args[index + 1]!; };
  const ids = option("--run-ids").split(",").filter(Boolean);
  const output = resolve(option("--output"));
  const repository = args.includes("--repo") ? option("--repo") : JSON.parse(execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).nameWithOwner as string;
  const runs: BenchmarkRun[] = [];
  for (const id of ids) runs.push(await collectRun(repository, id));
  const comparison = summarizeRuns(runs);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, renderComparison(comparison));
  writeFileSync(`${output}.json`, `${JSON.stringify(comparison, null, 2)}\n`);
  if (!comparison.comparable) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(() => { process.stderr.write("Benchmark collection failed; verify arguments and existing gh authentication.\n"); process.exitCode = 1; });
