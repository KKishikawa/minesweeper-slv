import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { TEST_GROUPS } from "../scripts/ci/test-groups.js";

const repositoryRoot = new URL("../", import.meta.url);

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

describe("repository foundation", () => {
  it("pins the development and CI Node.js version", async () => {
    await expect(readRepositoryFile(".node-version")).resolves.toBe("22.12.0\n");
  });

  it("aggregates all isolated regression groups into the required quality check", async () => {
    const workflow = await readRepositoryFile(".github/workflows/ci.yml");
    const regression = workflow.split("  regression:\n")[1]?.split("\n  quality:\n")[0];
    const quality = workflow.split("\n  quality:\n")[1];
    expect(regression).toBeDefined();
    expect(quality).toBeDefined();
    const groups = regression?.match(/group: \[([^\]]+)\]/)?.[1]?.split(",").map(group => group.trim());
    expect(groups).toEqual([...TEST_GROUPS]);
    expect(regression).toContain("fail-fast: false");
    expect(regression).toContain("timeout-minutes: 20");
    expect(regression).toContain("npx --no-install playwright install --with-deps chromium");
    expect(regression).toMatch(/if: matrix.group == 'product'\n        run: npm run typecheck/);
    expect(regression).toMatch(/if: matrix.group == 'product'\n        run: npm run build/);
    expect(regression).toContain("run: npm run test:ci -- ${{ matrix.group }}");
    expect(quality).toContain("name: CI / quality");
    expect(quality).toContain("if: always()");
    expect(quality).toContain("needs: regression");
    expect(quality).toContain("timeout-minutes: 5");
    expect(quality).toContain("CI_NEEDS: ${{ toJSON(needs) }}");
    expect(quality).toContain("run: npx --no-install tsx scripts/ci/quality-result.ts");
    for (const job of [regression, quality]) {
      expect(job).toContain("runs-on: ubuntu-24.04");
      expect(job).toContain("uses: actions/checkout@");
      expect(job).toContain("persist-credentials: false");
      expect(job).toContain("node-version-file: .node-version");
      expect(job).toContain("run: npm ci");
    }
    expect(workflow).toContain("push:\n    branches:\n      - main\n  pull_request:");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).not.toContain("test:spike-evidence");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toMatch(/\|\|\s*(true|echo)|--passWithNoTests/);
  });

  it("preserves full regression and explicit approval before publishing Pages", async () => {
    const workflow = await readRepositoryFile(".github/workflows/pages.yml");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("release_verified:");
    expect(workflow).toContain("required: true\n        type: boolean\n        default: false");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main' && inputs.release_verified");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("node-version-file: .node-version");
    const commands = [...workflow.matchAll(/^        run: (.+)$/gm)].map(match => match[1]);
    expect(commands.slice(0, 6)).toEqual([
      "npm ci", "npx --no-install playwright install --with-deps chromium",
      "npm run typecheck", "npm run build", "npm test", "npm run build:pages",
    ]);
    expect(workflow).not.toContain("test:ci");
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
