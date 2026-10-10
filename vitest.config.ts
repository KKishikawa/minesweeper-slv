import { readdirSync } from "node:fs";

import { defineConfig } from "vitest/config";

import { classifyTest, TEST_GROUPS, validatePartition } from "./scripts/ci/test-groups.js";

function testFiles(directory = "test"): string[] {
  return readdirSync(new URL(`./${directory}/`, import.meta.url), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? testFiles(path) : path.endsWith(".test.ts") ? [path] : [];
  });
}

const group = process.env.CI_TEST_GROUP;
let include = ["test/**/*.test.ts"];
if (group !== undefined) {
  if (!TEST_GROUPS.some((known) => known === group)) {
    throw new Error(`Unknown CI test group: ${group}`);
  }
  const paths = testFiles();
  validatePartition(paths);
  include = paths.filter((path) => classifyTest(path) === group);
}

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    include,
    exclude: ["test/**/*.spike.test.ts"],
  },
});
