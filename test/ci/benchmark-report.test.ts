import { describe, expect, it } from "vitest";
import { collectRun, parseVitestReport, renderComparison, summarizeRuns, type BenchmarkRun } from "../../scripts/ci/benchmark-report.js";

const sha = "b".repeat(40);
const iso = (seconds: number) => new Date(Date.UTC(2026, 9, 10) + seconds * 1000).toISOString();
function run(condition: "A" | "B" | "C", runId = 1): BenchmarkRun {
  const grouped = condition === "C";
  const job = (name: string, start: number, end: number) => ({ name, conclusion: "success", startedAt: iso(start), completedAt: iso(end), steps: [], labels: ["ubuntu-24.04"] });
  return {
    condition, runId, attempt: 1, controlSha: sha,
    targetSha: condition === "A" ? "1a01eac18f389e7933be9937ad7fa4aa8be476b7" : sha,
    conclusion: "success", createdAt: iso(0), startedAt: iso(5), finishedAt: iso(grouped ? 120 : 210),
    jobs: [job("validate", 5, 10), ...(grouped ? ["product", "formal", "holdout", "grid-compatibility", "recognition"].map(group => job(`Grouped / ${group}`, 20, 110)) : [job(`Serial / ${condition}`, 20, 210)]), ...(grouped ? [job("Benchmark / quality", 115, 120)] : [])],
    files: [{ path: "test/a.test.ts", elapsedMs: 1000, assertionMs: 300, tests: ["a passes"], statuses: ["passed"] }],
    artifacts: (grouped ? ["product", "formal", "holdout", "grid-compatibility", "recognition"] : ["all"]).map(group => ({ group, durationMs: 1000, maxRssKiB: 400, rssScope: "GNU time maximum", rssUnavailableReason: null, nodeVersion: "v22.12.0", chromiumVersion: "151", exitCode: 0, signal: null, reportMissing: false })),
    missingArtifacts: [], issues: [],
  };
}
const nine = () => ["A", "B", "C"].flatMap((c, i) => [0, 1, 2].map(n => run(c as "A" | "B" | "C", i * 3 + n + 1)));

describe("benchmark report", () => {
  it("separates queue, preparation, wall and all executed runner minutes", () => {
    const summary = summarizeRuns(nine());
    expect(summary.comparable).toBe(true);
    expect(summary.conditions.C.queueSeconds.median).toBe(20);
    expect(summary.conditions.C.preparationSeconds.median).toBe(15);
    expect(summary.conditions.C.wallSeconds.median).toBe(100);
    expect(summary.conditions.C.runnerMinutes.median).toBeCloseTo(460 / 60);
    expect(summary.reductions.AtoC).toBeCloseTo((190 - 100) / 190 * 100);
    expect(summary.conditions.C.files[0]?.elapsedMs.median).toBe(1000);
  });
  it("reports queue-inclusive total and dependency-ready waiting estimates for every job", () => {
    const result = summarizeRuns(nine());
    expect(result.conditions.C.totalSeconds.median).toBe(120);
    expect(result.conditions.C.workflowStartDelaySeconds.median).toBe(5);
    const waits = result.runs.find(r => r.condition === "C")!.jobWaits;
    expect(waits.find(job => job.name === "validate")).toMatchObject({ readyAt: iso(0), waitSeconds: 5, readyBasis: "workflow created_at", estimated: true });
    expect(waits.find(job => job.name === "Grouped / recognition")).toMatchObject({ readyAt: iso(10), waitSeconds: 10, readyBasis: "validate completed_at" });
    expect(waits.find(job => job.name === "Benchmark / quality")).toMatchObject({ readyAt: iso(110), waitSeconds: 5, readyBasis: "all regression completed_at" });
    expect(renderComparison(result)).toContain("quality | 2026-10-10T00:01:50.000Z");
    expect(renderComparison(result)).toContain("queue込み総秒");
  });
  it("uses the latest regression completion and leaves missing dependencies/skipped jobs unmeasured", () => {
    const r = run("C"); r.jobs.find(job => job.name === "Grouped / recognition")!.completedAt = iso(114);
    expect(summarizeRuns([r]).runs[0]!.jobWaits.at(-1)?.waitSeconds).toBe(1);
    r.jobs.find(job => job.name === "Grouped / formal")!.completedAt = null;
    const result = summarizeRuns([r]);
    expect(result.runs[0]!.jobWaits.at(-1)?.waitSeconds).toBeNull();
    expect(result.reasons.join("\n")).toContain("quality: dependency wait unmeasured");
    const a = run("A"); a.jobs.push({ name: "Benchmark / quality", conclusion: "skipped", startedAt: null, completedAt: null, steps: [], labels: [] });
    expect(summarizeRuns([a]).runs[0]!.jobWaits.at(-1)).toMatchObject({ waitSeconds: null, readyAt: null, readyBasis: "not executed" });
  });
  it("computes the historical 755-second reference separately from A-to-C", () => {
    const result = summarizeRuns(nine());
    expect(result.historicalReference.C).toEqual({ measuredWallSeconds: 100, savedSeconds: 655, reductionPercent: 655 / 755 * 100 });
    expect(result.reductions.AtoC).not.toBe(result.historicalReference.C.reductionPercent);
    expect(renderComparison(result)).toContain("655.00");
    const empty = summarizeRuns([]);
    expect(empty.historicalReference.C).toEqual({ measuredWallSeconds: null, savedSeconds: null, reductionPercent: null });
    const failed = nine(); failed[0]!.conclusion = "failure";
    expect(summarizeRuns(failed).historicalReference.C.savedSeconds).toBeNull();
  });
  it("always reports the six specified heavy files, including missing values, regardless of rank", () => {
    const runs = nine();
    for (const r of runs) {
      r.files[0]!.elapsedMs = 999999;
      r.files.push({ path: "test/recognition/formal-runner.test.ts", elapsedMs: 1, assertionMs: 0.5, tests: ["formal"], statuses: ["passed"] });
    }
    const result = summarizeRuns(runs);
    expect(result.conditions.C.heavyFiles.map(file => file.path)).toEqual([
      "test/recognition/formal-runner.test.ts", "test/recognition/folds.test.ts", "test/recognition/generated-bank.test.ts",
      "test/recognition/browser-grid-resample.test.ts", "test/recognition/browser-grid-fallback.test.ts", "test/recognition/evaluate-grid-fallback.test.ts",
    ]);
    expect(result.conditions.C.heavyFiles[0]?.elapsedMs.median).toBe(1);
    expect(result.conditions.C.heavyFiles[1]?.elapsedMs.median).toBeNull();
    expect(result.conditions.C.heavyFiles[1]?.unavailableReason).toContain("file missing in runs");
    const report = renderComparison(result);
    expect(report).toContain("test/recognition/folds.test.ts | 未測定");
    expect(report).not.toContain("test/a.test.ts | 999999");
  });
  it.each([
    ["insufficient", (runs: BenchmarkRun[]) => runs.pop(), "at least 3"],
    ["mixed target", (runs: BenchmarkRun[]) => { runs[4]!.targetSha = "d".repeat(40); }, "target SHA"],
    ["mixed control", (runs: BenchmarkRun[]) => { runs[4]!.controlSha = "d".repeat(40); }, "control SHA"],
    ["test set", (runs: BenchmarkRun[]) => { runs[4]!.files[0]!.tests.push("extra"); }, "test set differs"],
    ["failure", (runs: BenchmarkRun[]) => { runs[4]!.conclusion = "failure"; }, "failure"],
    ["timeout", (runs: BenchmarkRun[]) => { runs[4]!.jobs[1]!.conclusion = "timed_out"; }, "timed_out"],
    ["rerun", (runs: BenchmarkRun[]) => { runs[4]!.attempt = 2; }, "attempt 2"],
    ["missing JSON", (runs: BenchmarkRun[]) => { runs[4]!.missingArtifacts.push("vitest.json"); }, "vitest.json"],
    ["cancelled", (runs: BenchmarkRun[]) => { runs[4]!.conclusion = "cancelled"; }, "cancelled"],
    ["quality skipped", (runs: BenchmarkRun[]) => { runs[8]!.jobs.at(-1)!.conclusion = "skipped"; }, "skipped"],
    ["environment", (runs: BenchmarkRun[]) => { runs[4]!.artifacts[0]!.nodeVersion = "other"; }, "Node/Chromium"],
  ])("retains %s runs with an explicit comparison blocker", (_name, mutate, reason) => {
    const runs = nine(); mutate(runs);
    const result = summarizeRuns(runs);
    expect(result.comparable).toBe(false);
    expect(result.reasons.join("\n")).toContain(reason);
    expect(result.runs).toHaveLength(runs.length);
    expect(result.reductions.AtoC).toBeNull();
  });
  it("reports file additions separately without treating identical files as identical assertions", () => {
    const runs = nine(); runs[4]!.files.push({ path: "test/ci/new.test.ts", elapsedMs: 1, assertionMs: 1, tests: ["new"], statuses: ["passed"] });
    expect(summarizeRuns(runs).testSetDifferences[0]?.added).toEqual(["test/ci/new.test.ts :: new"]);
  });
  it("detects an absent file even if it had no assertions", () => {
    const runs = nine(); runs[0]!.files.push({ path: "test/old.test.ts", elapsedMs: 0, assertionMs: 0, tests: [], statuses: [] });
    const result = summarizeRuns(runs);
    expect(result.comparable).toBe(false);
    expect(result.testSetDifferences[0]?.removedFiles).toEqual(["test/old.test.ts"]);
  });
  it("blocks missing group artifacts in directly supplied runs", () => {
    const runs = nine(); runs[8]!.artifacts.pop();
    expect(summarizeRuns(runs).reasons.join("\n")).toContain("missing recognition metadata");
  });
  it("records expired artifacts and missing Vitest entries", async () => {
    const result = await collectRun("o/r", "12", {
      json: async endpoint => endpoint.endsWith("/jobs") ? [{ jobs: [{ name: "Serial / A", conclusion: "failure", steps: [] }] }] : endpoint.endsWith("/artifacts") ? [{ artifacts: [{ name: "benchmark-A-all", id: 1, expired: true }] }] : { run_attempt: 1, conclusion: "failure" },
      artifact: async () => { throw new Error("must not download expired"); },
    });
    expect(result.missingArtifacts).toContain("benchmark-A-all (expired)");
    expect(result.conclusion).toBe("failure");
  });
  it("allows only the four approved CI file additions and retains their raw durations/differences", () => {
    const runs = nine();
    for (const r of runs.filter(r => r.condition !== "A")) for (const file of ["test-groups", "quality-result", "run-tests", "benchmark-report"]) r.files.push({ path: `test/ci/${file}.test.ts`, elapsedMs: 20, assertionMs: 10, tests: ["configuration test"], statuses: ["passed"] });
    const result = summarizeRuns(runs);
    expect(result.comparable).toBe(true);
    expect(result.testSetDifferences).toHaveLength(6);
    expect(result.testSetDifferences[0]?.allowedConfigurationDifference).toBe(true);
    expect(result.commonFilePaths).toEqual(["test/a.test.ts"]);
    expect(result.conditions.C.commonFileElapsedMs.median).toBe(1000);
    expect(result.conditions.C.configurationElapsedMs.median).toBe(80);
  });
  it("allows foundation assertion replacement while preserving raw added/removed assertions", () => {
    const runs = nine();
    for (const r of runs) r.files.push({ path: "test/repository-foundation.test.ts", elapsedMs: 20, assertionMs: 10, tests: [r.condition === "A" ? "old CI structure" : "new CI structure"], statuses: ["passed"] });
    const result = summarizeRuns(runs);
    expect(result.comparable).toBe(true);
    expect(result.testSetDifferences[0]?.removed).toEqual(["test/repository-foundation.test.ts :: old CI structure"]);
    expect(result.commonFilePaths).toEqual(["test/a.test.ts"]);
  });
  it("rejects unknown additions, missing baseline files and missing foundation files", () => {
    for (const path of ["test/a.test.ts", "test/repository-foundation.test.ts"]) {
      const runs = nine();
      if (path.includes("foundation")) for (const r of runs) r.files.push({ path, elapsedMs: 1, assertionMs: 1, tests: ["CI check"], statuses: ["passed"] });
      runs[4]!.files = runs[4]!.files.filter(f => f.path !== path);
      expect(summarizeRuns(runs).comparable).toBe(false);
    }
    const runs = nine();
    for (const r of runs.filter(r => r.condition !== "A")) r.files.push({ path: "test/ci/unknown.test.ts", elapsedMs: 1, assertionMs: 1, tests: ["unknown"], statuses: ["passed"] });
    expect(summarizeRuns(runs).comparable).toBe(false);
  });
  it("rejects inconsistent test sets within the same target even for an approved CI path", () => {
    const runs = nine(); runs[4]!.files.push({ path: "test/ci/benchmark-report.test.ts", elapsedMs: 1, assertionMs: 1, tests: ["CI test"], statuses: ["passed"] });
    expect(summarizeRuns(runs).reasons.join("\n")).toContain("same target SHA test set differs");
  });
  it("reads Vitest milliseconds, absolute names and assertion time without suite-count assumptions", () => {
    expect(parseVitestReport({ success: true, testResults: [{ name: "/tmp/checkout/test/a.test.ts", startTime: 1000, endTime: 6000, assertionResults: [{ fullName: "a passes", duration: 50, status: "passed" }] }] })).toEqual([{ path: "test/a.test.ts", elapsedMs: 5000, assertionMs: 50, tests: ["a passes"], statuses: ["passed"] }]);
    expect(() => parseVitestReport({ success: true, testResults: [{ name: "a", startTime: 2, endTime: 1, assertionResults: [] }] })).toThrow();
  });
  it("retains unmeasured state and historical baseline without a fabricated reduction", () => {
    const report = renderComparison(summarizeRuns([]));
    expect(report).toContain("未測定"); expect(report).toContain("12分35秒"); expect(report).not.toContain("0.00%");
  });
  it("collects paginated API jobs and known archive entries via an injected transport", async () => {
    const metadata = { schemaVersion: 1, group: "all", condition: "B", targetSha: sha, controlSha: sha, durationMs: 1000, maxRssKiB: 400, rssScope: "GNU time maximum", rssUnavailableReason: null, nodeVersion: "v22", chromiumVersion: "151", exitCode: 0, signal: null, spawnError: null, reportMissing: false };
    const calls: string[] = [];
    const result = await collectRun("o/r", "12:1", {
      json: async (endpoint, paginate) => {
        calls.push(`${endpoint}:${paginate}`);
        if (endpoint.endsWith("/artifacts")) return [{ artifacts: [{ id: 9, name: "benchmark-B-all", expired: false }] }];
        if (endpoint.endsWith("/jobs")) return [{ jobs: [{ name: "validate", conclusion: "success", started_at: iso(5), completed_at: iso(10), steps: [] }] }, { jobs: [{ name: "Serial / B", conclusion: "success", started_at: iso(20), completed_at: iso(210), steps: [] }] }];
        return { id: 12, run_attempt: 1, head_sha: sha, conclusion: "success", created_at: iso(0), run_started_at: iso(5), updated_at: iso(210) };
      },
      artifact: async (_repo, _id, entry) => JSON.stringify(entry === "metadata.json" ? metadata : { success: true, testResults: [{ name: "/tmp/target/test/a.test.ts", startTime: 1000, endTime: 6000, assertionResults: [{ fullName: "passes", duration: 50, status: "passed" }] }] }),
    });
    expect(result.jobs).toHaveLength(2); expect(result.files[0]?.elapsedMs).toBe(5000);
    expect(result.condition).toBe("B"); expect(result.issues).toEqual([]);
    expect(calls).toContain("repos/o/r/actions/runs/12/attempts/1/jobs:true");
  });
  it("preserves missing/expired artifacts and API errors rather than creating a success", async () => {
    const result = await collectRun("o/r", "12", { json: async () => { throw new Error("secret token response"); }, artifact: async () => "" });
    expect(result.conclusion).toBeNull(); expect(result.issues).toContain("GitHub API collection failed");
    expect(JSON.stringify(result)).not.toContain("secret token");
  });
});
