import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { allJobsSucceeded } from "../../scripts/ci/quality-result.js";

describe("required CI job aggregation", () => {
  it("accepts only the exact expected successful jobs", () => {
    expect(allJobsSucceeded({ regression: "success" }, ["regression"])).toBe(true);
    expect(allJobsSucceeded({ build: "success", test: "success" }, ["test", "build"])).toBe(true);
  });

  it.each(["failure", "cancelled", "skipped", "pending", "SUCCESS", ""])(
    "rejects the regression result %j", (result) => {
      expect(allJobsSucceeded({ regression: result }, ["regression"])).toBe(false);
    },
  );

  it("rejects missing, empty, or extra job results", () => {
    expect(allJobsSucceeded({}, ["regression"])).toBe(false);
    expect(allJobsSucceeded({}, [])).toBe(false);
    expect(allJobsSucceeded({ regression: "success" }, [])).toBe(false);
    expect(allJobsSucceeded({ regression: "success", surprise: "success" }, ["regression"])).toBe(false);
    expect(allJobsSucceeded({ build: "success" }, ["build", "test"])).toBe(false);
  });

  it.each([
    ['{"regression":{"result":"success"}}', 0],
    ['{"regression":{"result":"failure"}}', 1],
    ['{"regression":{"result":"cancelled"}}', 1],
    ['{"regression":{"result":"skipped"}}', 1],
    ['{"regression":{"result":"unknown"}}', 1],
    ['{"regression":{"result":"success"},"extra":{"result":"success"}}', 1],
    ['{}', 1],
    ['{"regression":{}}', 1],
    ['{"regression":null}', 1],
    ['[]', 1],
    ['null', 1],
    ['not json', 1],
    [undefined, 1],
  ])("CLI returns the required exit code for needs %j", (needs, expectedCode) => {
    const env = { ...process.env };
    delete env.CI_NEEDS;
    if (needs !== undefined) env.CI_NEEDS = needs;
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url)),
      "scripts/ci/quality-result.ts",
    ], { cwd: fileURLToPath(new URL("../../", import.meta.url)), env, encoding: "utf8" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(expectedCode);
  });
});
