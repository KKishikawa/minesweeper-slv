import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");
const runnerUrl = pathToFileURL(path.resolve("scripts/run-multi-prototype-spike.ts")).href;

it("waits for evidence writes and exits despite a lingering handle", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "runner-cli-exit-"));
  const markerPath = path.join(directory, "summary-written.txt");
  const source = `
    import { writeFile } from "node:fs/promises";
    import { runCliAndExit } from ${JSON.stringify(runnerUrl)};
    setInterval(() => undefined, 60_000);
    void runCliAndExit(async () => {
      await writeFile(${JSON.stringify(markerPath)}, "written", "utf8");
      return 1;
    });
  `;
  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, [tsxCliPath, "--eval", source]);
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("CLI exit probe exceeded 10 seconds."));
      }, 10_000);
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).toBe(1);
    expect(await readFile(markerPath, "utf8")).toBe("written");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
