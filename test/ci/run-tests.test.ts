import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runVitest } from "../../scripts/ci/run-tests.js";

vi.mock("node:child_process", { spy: true });

const directories: string[] = [];
const modules = fileURLToPath(new URL("../../node_modules", import.meta.url));

async function project(assertion: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ci-runner-"));
  directories.push(root);
  await symlink(modules, path.join(root, "node_modules"));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "vitest.config.mjs"),
    'export default { test: { include: ["child.test.mjs"], fileParallelism: false, testTimeout: 300000 } };');
  await writeFile(path.join(root, "child.test.mjs"),
    `import { it, expect } from "vitest"; it("child assertion", () => { ${assertion} });`);
  return root;
}

async function metadata(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, "test/artifacts/ci/all/metadata.json"), "utf8"));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("recorded Vitest subprocess", () => {
  it("keeps a successful child exit and its actual JSON test records", async () => {
    const root = await project("expect(2 + 2).toBe(4)");
    const outputDirectory = path.join(root, "test/artifacts/ci/all");
    expect(await runVitest({ repositoryRoot: root, group: "all", outputDirectory })).toBe(0);
    const record = await metadata(root);
    expect(record).toMatchObject({ schemaVersion: 1, group: "all", exitCode: 0, reportMissing: false, signal: null, spawnError: null });
    expect(record.nodeVersion).toBe(process.version);
    expect(typeof record.startedAt).toBe("string");
    expect(typeof record.finishedAt).toBe("string");
    expect(Date.parse(String(record.finishedAt))).toBeGreaterThanOrEqual(Date.parse(String(record.startedAt)));
    expect(record).toHaveProperty("chromiumVersion");
    expect(record).toHaveProperty("targetSha");
    expect(record).toHaveProperty("controlSha");
    expect(record).toHaveProperty("maxRssKiB");
    expect(record).toHaveProperty("rssScope");
    if (process.platform !== "linux") {
      expect(record.maxRssKiB).toBeNull();
      expect(record.rssUnavailableReason).toBe("GNU time RSS collection requires Linux");
    }
    const report = JSON.parse(await readFile(path.join(outputDirectory, "vitest.json"), "utf8"));
    expect(report.numTotalTests).toBe(1);
    expect(report.testResults[0].assertionResults[0].status).toBe("passed");
    expect(report.testResults[0].endTime).toBeGreaterThanOrEqual(report.testResults[0].startTime);
  });

  it("runs external all against the target checkout and records the separate control ref", async () => {
    const root = await project("expect(2 + 2).toBe(4)");
    const output = childProcess.execFileSync(process.execPath, [
      path.join(modules, "tsx/dist/cli.mjs"),
      fileURLToPath(new URL("../../scripts/ci/run-tests.ts", import.meta.url)),
      "--external-all", root,
    ], { cwd: root, env: { ...process.env, CI_TEST_GROUP: "invalid-inherited-group", CI_CONTROL_SHA: "b".repeat(40), CI_BENCHMARK_CONDITION: "A" }, encoding: "utf8", stdio: "pipe" });
    expect(output).toContain("child.test.mjs");
    expect(await metadata(root)).toMatchObject({ group: "all", condition: "A", controlSha: "b".repeat(40), exitCode: 0, reportMissing: false });
  });

  it("preserves a real failing child exit despite saving reports", async () => {
    const root = await project("expect(2 + 2).toBe(5)");
    const exitCode = await runVitest({ repositoryRoot: root, group: "all", outputDirectory: path.join(root, "test/artifacts/ci/all") });
    expect(exitCode).not.toBe(0);
    expect(await metadata(root)).toMatchObject({ exitCode, reportMissing: false });
  });

  it("rejects an unknown group before creating artifacts or launching Vitest", async () => {
    const root = await project("expect(true).toBe(true)");
    await expect(runVitest({ repositoryRoot: root, group: "unknown" as "all", outputDirectory: path.join(root, "test/artifacts/ci/all") })).rejects.toThrow("Unknown CI test group");
    await expect(metadata(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["throw", "event"])("writes nonzero metadata for native process launch failure (%s)", async failure => {
    const root = await project("expect(true).toBe(true)");
    vi.mocked(childProcess.spawn).mockImplementationOnce(() => {
      if (failure === "throw") throw new Error("native spawn denied");
      const child = new EventEmitter();
      queueMicrotask(() => {
        child.emit("error", new Error("native spawn denied"));
        child.emit("close", -2, null);
      });
      return child as childProcess.ChildProcess;
    });
    const exitCode = await runVitest({ repositoryRoot: root, group: "all", outputDirectory: path.join(root, "test/artifacts/ci/all") });
    expect(exitCode).not.toBe(0);
    expect(await metadata(root)).toMatchObject({ exitCode, reportMissing: true, spawnError: "Error: native spawn denied" });
  });

  it.each(["process.exit(7)", 'process.kill(process.pid, "SIGTERM")'])("records missing JSON and nonzero termination for %s", async (source) => {
    const root = await mkdtemp(path.join(tmpdir(), "ci-no-report-"));
    directories.push(root);
    await mkdir(path.join(root, "node_modules/vitest"), { recursive: true });
    await writeFile(path.join(root, "node_modules/vitest/vitest.mjs"), source);
    await mkdir(path.join(root, "test/artifacts/ci/all"), { recursive: true });
    await writeFile(path.join(root, "test/artifacts/ci/all/vitest.json"), '{"stale":true}');
    const exitCode = await runVitest({ repositoryRoot: root, group: "all", outputDirectory: path.join(root, "test/artifacts/ci/all") });
    expect(exitCode).not.toBe(0);
    expect(await metadata(root)).toMatchObject({ exitCode, reportMissing: true, signal: source.includes("SIGTERM") ? "SIGTERM" : null });
  });
});
