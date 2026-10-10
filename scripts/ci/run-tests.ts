import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { TEST_GROUPS, type TestGroup } from "./test-groups.js";

export async function runTests(group: TestGroup | "all", outputDirectory: string): Promise<number> {
  // Task 3 will add timing records in this directory.
  void outputDirectory;
  if (group !== "all" && !TEST_GROUPS.some((known) => known === group)) {
    throw new Error(`Unknown CI test group: ${group}`);
  }
  const env = { ...process.env };
  delete env.CI_TEST_GROUP;
  if (group !== "all") env.CI_TEST_GROUP = group;
  const child = spawn(process.execPath, [
    fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url)), "run",
  ], { cwd: fileURLToPath(new URL("../../", import.meta.url)), env, stdio: "inherit" });
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code ?? 1));
  });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  const group = process.argv[2];
  if (group === "all" || TEST_GROUPS.some((known) => known === group)) {
    try {
      process.exitCode = await runTests(group as TestGroup | "all", "artifacts/ci");
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  } else {
    console.error(`Usage: npm run test:ci -- <${[...TEST_GROUPS, "all"].join("|")}>`);
    process.exitCode = 1;
  }
}
