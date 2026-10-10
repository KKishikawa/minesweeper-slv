import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { constants } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { recreateArtifactDirectory } from "../artifact-directory.js";
import { TEST_GROUPS, type TestGroup } from "./test-groups.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function gitSha(root: string): string | null {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

function chromiumVersion(root: string): { chromiumVersion: string | null; chromiumUnavailableReason: string | null } {
  try {
    const require = createRequire(path.join(root, "package.json"));
    const { chromium } = require("playwright") as typeof import("playwright");
    const version = execFileSync(chromium.executablePath(), ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { chromiumVersion: version, chromiumUnavailableReason: null };
  } catch (error) {
    return { chromiumVersion: null, chromiumUnavailableReason: String(error) };
  }
}

export async function runVitest(options: {
  repositoryRoot: string; group: TestGroup | "all"; outputDirectory: string;
}): Promise<number> {
  const { group } = options;
  if (group !== "all" && !TEST_GROUPS.some((known) => known === group)) {
    throw new Error(`Unknown CI test group: ${group}`);
  }
  const root = path.resolve(options.repositoryRoot);
  const requestedOutput = path.resolve(options.outputDirectory);
  // The reserved-directory API rejects escapes and symlink components before deletion.
  const output = await recreateArtifactDirectory(root, path.relative(root, requestedOutput).split(path.sep));
  const reportPath = path.join(output, "vitest.json");
  const rssPath = path.join(output, "max-rss-kib.txt");
  const env = { ...process.env };
  delete env.CI_TEST_GROUP;
  if (group !== "all") env.CI_TEST_GROUP = group;
  const browser = chromiumVersion(root);
  const targetSha = gitSha(root);
  const controlSha = process.env.CI_CONTROL_SHA ?? gitSha(repositoryRoot);
  const args = [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`];
  const linux = process.platform === "linux";
  const command = linux ? "/usr/bin/time" : process.execPath;
  const commandArgs = linux ? ["-f", "%M", "-o", rssPath, process.execPath, ...args] : args;
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const result = await new Promise<{ exitCode: number; signal: NodeJS.Signals | null; spawnError: string | null }>(resolveExit => {
    try {
      const child = spawn(command, commandArgs, { cwd: root, env, stdio: "inherit" });
      let spawnError: string | null = null;
      child.once("error", error => { spawnError = String(error); });
      child.once("close", (code, signal) => resolveExit({
        exitCode: spawnError ? 1 : code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 1), signal, spawnError,
      }));
    } catch (error) {
      resolveExit({ exitCode: 1, signal: null, spawnError: String(error) });
    }
  });
  const finishedAt = new Date().toISOString();
  const durationMs = performance.now() - start;
  let reportMissing = false;
  try { await readFile(reportPath); } catch { reportMissing = true; }
  let maxRssKiB: number | null = null;
  let rssUnavailableReason: string | null = linux ? null : "GNU time RSS collection requires Linux";
  if (linux) {
    try {
      // GNU time may prefix its value with a child exit/signal diagnostic.
      const rssReport = await readFile(rssPath, "utf8");
      const terminatedSignal = rssReport.match(/Command terminated by signal (\d+)/)?.[1];
      if (terminatedSignal !== undefined && result.signal === null) {
        result.signal = Object.entries(constants.signals).find(([, value]) => value === Number(terminatedSignal))?.[0] as NodeJS.Signals | undefined ?? null;
      }
      const lines = rssReport.trim().split("\n");
      const lastLine = lines.at(-1) ?? "";
      const value = Number(lastLine);
      if (!/^\d+$/.test(lastLine) || !Number.isFinite(value) || value < 0) throw new Error("Invalid GNU time RSS value");
      maxRssKiB = value;
    } catch (error) { rssUnavailableReason = String(error); }
  }
  await writeFile(path.join(output, "metadata.json"), JSON.stringify({
    schemaVersion: 1, group, targetSha, controlSha, condition: process.env.CI_BENCHMARK_CONDITION ?? null,
    nodeVersion: process.version, ...browser, startedAt, finishedAt, durationMs, ...result, reportMissing,
    maxRssKiB, rssScope: "GNU time maximum resident set size of the Vitest command and its waited-for descendants; not the simultaneous RSS sum of all processes", rssUnavailableReason,
  }, null, 2) + "\n");
  return result.exitCode;
}

export async function runTests(group: TestGroup | "all", outputDirectory: string): Promise<number> {
  return runVitest({ repositoryRoot, group, outputDirectory });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  try {
    const group = process.argv[2];
    if (group === "--external-all" && process.argv[3]) {
      const targetRoot = path.resolve(process.argv[3]);
      process.exitCode = await runVitest({ repositoryRoot: targetRoot, group: "all", outputDirectory: path.join(targetRoot, "test/artifacts/ci/all") });
    } else if (group === "all" || TEST_GROUPS.some(known => known === group)) {
      process.exitCode = await runTests(group as TestGroup | "all", path.join(repositoryRoot, "test/artifacts/ci", group as string));
    } else {
      throw new Error(`Usage: npm run test:ci -- <${[...TEST_GROUPS, "all"].join("|")}>`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
