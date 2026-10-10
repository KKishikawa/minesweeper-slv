import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { classifyTest, TEST_GROUPS, validatePartition } from "../../scripts/ci/test-groups.js";

function testFiles(directory = "test"): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? testFiles(path) : path.endsWith(".test.ts") ? [path] : [];
  });
}

const paths = testFiles();

// Literal expectations follow the design table, independently of the manifest.
describe("CI test partition", () => {
  it.each([
    ["test/recognition/formal-runner.test.ts", "formal"],
    ["test/recognition/folds.test.ts", "holdout"],
    ["test/recognition/generated-bank.test.ts", "holdout"],
    ["test/recognition/browser-grid-resample.test.ts", "grid-compatibility"],
    ["test/recognition/browser-grid-fallback.test.ts", "grid-compatibility"],
    ["test/recognition/evaluate-grid-fallback.test.ts", "recognition"],
  ] as const)("classifies %s as %s", (path, group) => {
    expect(classifyTest(path)).toBe(group);
  });

  it("assigns new regular tests to the default groups", () => {
    expect(classifyTest("test/recognition/new.test.ts")).toBe("recognition");
    expect(classifyTest("test/ci/new.test.ts")).toBe("product");
    expect(classifyTest("test/ci/test-groups.test.ts")).toBe("product");
  });

  it("excludes spike evidence from every group", () => {
    expect(classifyTest("test/recognition/recognize.spike.test.ts")).toBeNull();
    expect(classifyTest("test/ci/new.spike.test.ts")).toBeNull();
  });

  it("covers all real regular test files exactly once with no empty group", () => {
    const regular = paths.filter((path) => !path.endsWith(".spike.test.ts"));
    const groups = TEST_GROUPS.map((group) => paths.filter((path) => classifyTest(path) === group));
    const selected = groups.flat();
    expect(groups.every((group) => group.length > 0)).toBe(true);
    expect(new Set(selected).size).toBe(selected.length);
    expect(selected.toSorted()).toEqual(regular.toSorted());
    expect(() => validatePartition(paths)).not.toThrow();
  });

  it.each([
    "test/recognition/formal-runner.test.ts",
    "test/recognition/folds.test.ts",
    "test/recognition/generated-bank.test.ts",
    "test/recognition/browser-grid-resample.test.ts",
    "test/recognition/browser-grid-fallback.test.ts",
  ])("rejects missing explicit file %s", (missing) => {
    expect(() => validatePartition(paths.filter((path) => path !== missing))).toThrow(missing);
  });

  it.each(["product", "recognition"])("rejects an empty default group %s", (group) => {
    expect(() => validatePartition(paths.filter((path) => classifyTest(path) !== group))).toThrow(group);
  });

  it("rejects repeated paths", () => {
    expect(() => validatePartition([...paths, "test/ci/test-groups.test.ts"])).toThrow(/duplicate/i);
  });
});
