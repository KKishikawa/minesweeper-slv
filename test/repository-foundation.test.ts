import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../", import.meta.url);

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

describe("repository foundation", () => {
  it("pins the development and CI Node.js version", async () => {
    await expect(readRepositoryFile(".node-version")).resolves.toBe("22.12.0\n");
  });

  it("defines one honest ordinary CI quality check", async () => {
    const workflow = await readRepositoryFile(".github/workflows/ci.yml");

    expect(workflow).toContain("name: CI / quality");
    expect(workflow).toContain("node-version-file: .node-version");
    expect(workflow).toContain("npx --no-install playwright install --with-deps chromium");
    expect(workflow).toContain("run: npm test");
    expect(workflow).toContain("run: npm run typecheck");
    expect(workflow).not.toContain("test:spike-evidence");
    expect(workflow).not.toContain("continue-on-error");
  });
});
