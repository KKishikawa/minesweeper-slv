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

    expect(workflow).toBe(`name: CI

on:
  push:
    branches:
      - main
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: CI / quality
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Install Chromium
        run: npx --no-install playwright install --with-deps chromium
      - name: Run ordinary regression tests
        run: npm test
      - name: Run type checking
        run: npm run typecheck
`);
    expect(workflow).toContain("name: CI / quality");
    expect(workflow).toContain("node-version-file: .node-version");
    expect(workflow).toContain("npx --no-install playwright install --with-deps chromium");
    expect(workflow).toContain("run: npm test");
    expect(workflow).toContain("run: npm run typecheck");
    expect(workflow).not.toContain("test:spike-evidence");
    expect(workflow).not.toContain("continue-on-error");
  });

  it("publishes the approved license and contribution policy", async () => {
    const license = await readRepositoryFile("LICENSE");
    const contributing = await readRepositoryFile("CONTRIBUTING.md");

    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 KKishikawa");
    expect(contributing).toContain("npm test");
    expect(contributing).toContain("npm run typecheck");
    expect(contributing).toContain("spike");
  });

  it("documents private security reporting and the reproducible runtime", async () => {
    const security = await readRepositoryFile("SECURITY.md");
    const readme = await readRepositoryFile("README.md");

    expect(security).toContain("security/advisories/new");
    expect(security).toContain("サポート対象のリリースはありません");
    expect(readme).toContain("`.node-version`で22.12.0");
    expect(readme).toContain("Playwright 1.62.1");
    expect(readme).toContain("通常CI");
    expect(readme).not.toMatch(/通常の回帰テスト\d+件/);
  });
});
