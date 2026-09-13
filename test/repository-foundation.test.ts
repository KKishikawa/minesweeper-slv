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

  it("provides current project, product, and roadmap sources of truth", async () => {
    const [project, product, roadmap] = await Promise.all([
      readRepositoryFile("docs/project/README.md"),
      readRepositoryFile("docs/project/product.md"),
      readRepositoryFile("docs/project/roadmap.md"),
    ]);

    expect(project).toContain("[製品定義](product.md)");
    expect(project).toContain("[ロードマップ](roadmap.md)");
    expect(project).toContain("[ADR log](../decisions/README.md)");
    expect(project).toContain("[Issue #9](https://github.com/KKishikawa/minesweeper-slv/issues/9)");
    expect(project).toContain("[Issue #5](https://github.com/KKishikawa/minesweeper-slv/issues/5)");
    expect(project).toContain("[specs](../superpowers/specs/)");
    expect(project).toContain("[spikes](../superpowers/spikes/)");
    expect(project).toContain("[plans](../superpowers/plans/)");
    expect(project).toContain("手動盤面入力");
    expect(product).toContain("画像認識なしでも");
    expect(product).toContain("手動盤面入力とsolver");
    expect(product).toContain("完全にローカル");
    expect(product).toContain("不確実");
    expect(product).toContain("設計・仕様を検討する際の参考");
    expect(roadmap).toContain("手動盤面入力型MVP");
    expect(roadmap).toContain("認識研究");
    expect(roadmap).toContain("画像支援と認識統合");
    expect(roadmap).toContain("#8");
    expect(roadmap).toContain("#13");
    expect(roadmap).not.toContain("#8 が「採用」へ到達するまで、Phase 2以降には着手しません");
  });

  it("indexes active and superseded architectural decisions", async () => {
    const adrPaths = [
      "0001-process-data-locally.md",
      "0002-conditionally-adopt-initial-cell-recognition.md",
      "0003-reject-current-cell-recognition-candidates.md",
      "0004-partially-adopt-fail-closed-grid-detection.md",
      "0005-require-manual-confirmation-before-solving-uncertain-boards.md",
      "0006-use-chromium-as-formal-recognition-evaluator.md",
      "0007-deliver-manual-board-entry-mvp-first.md",
      "0008-decouple-product-core-from-recognition-adoption.md",
    ];
    const [index, ...adrs] = await Promise.all([
      readRepositoryFile("docs/decisions/README.md"),
      ...adrPaths.map((path) => readRepositoryFile(`docs/decisions/${path}`)),
    ]);

    for (const path of adrPaths) {
      expect(index).toContain(`](${path})`);
    }
    expect(index).toContain("## Active");
    expect(index).toContain("## Superseded");
    expect(adrs[1]).toContain(
      "Status: superseded by [ADR 0003](0003-reject-current-cell-recognition-candidates.md)",
    );
    expect(adrs[2]).toContain(
      "Supersedes: [ADR 0002](0002-conditionally-adopt-initial-cell-recognition.md)",
    );
    for (const adr of adrs) {
      expect(adr).toMatch(/Status: (accepted|superseded)/);
      expect(adr).toMatch(/Decision date: 2026-08-(16|17|23|24|28)/);
      expect(adr).toContain("## Context");
      expect(adr).toContain("## Decision");
      expect(adr).toContain("## Consequences");
      expect(adr).toContain("## Evidence");
      expect(adr).toMatch(/\]\(\.\.\/(superpowers|project)\//);
    }
  });

  it("routes public and contributor-facing readers to current project sources", async () => {
    const [readme, contributing, historicalDesign] = await Promise.all([
      readRepositoryFile("README.md"),
      readRepositoryFile("CONTRIBUTING.md"),
      readRepositoryFile("docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md"),
    ]);

    expect(readme).toContain("docs/project/README.md");
    expect(readme).toContain("docs/decisions/README.md");
    expect(readme).toContain("手動盤面入力型MVP");
    expect(readme).toContain("認識研究");
    expect(readme).not.toContain("次期セル認識方式を設計・検証し");
    expect(contributing).toContain("docs/project/README.md");
    expect(contributing).toContain("docs/decisions/README.md");
    expect(historicalDesign).toContain("../../project/README.md");
    expect(historicalDesign).toContain("../../decisions/README.md");
    expect(historicalDesign).toContain("現在有効な製品定義");
  });
});
