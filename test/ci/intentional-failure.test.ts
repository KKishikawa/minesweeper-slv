import { expect, test } from "vitest";

// Temporary Actions smoke only. Never merge this branch.
test("intentional product failure for Actions fail-closed smoke", () => {
  expect("intentional smoke failure").toBe("successful regression");
});
