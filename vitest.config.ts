import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.spike.test.ts"],
  },
});
