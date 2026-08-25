# Repository Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible ordinary CI check, MIT licensing, and minimum contribution and security policies without treating rejected spike failures as green CI.

**Architecture:** A single GitHub Actions job named `CI / quality` reads Node.js from `.node-version`, installs lockfile-pinned dependencies and Playwright Chromium, then runs the maintained regression suite and type checker. A focused Vitest file guards repository configuration against drift, while public documents define contribution, security, and rejected-spike boundaries.

**Tech Stack:** GitHub Actions, Node.js 22.12.0, npm, Playwright 1.62.1, Vitest 4.1.10, TypeScript 7.0.2, GitHub CLI

**Spec:** `docs/superpowers/specs/2026-08-26-repository-foundation-design.md`

## Global Constraints

- The only required Actions job is named exactly `CI / quality`.
- CI runs on pull requests and pushes to `main`.
- CI uses Node.js 22.12.0 from `.node-version`; `package.json` keeps `>=22.12.0` as the supported floor.
- Chromium is installed by the local Playwright 1.62.1 CLI selected by `package-lock.json`; do not fetch a floating Playwright CLI.
- `npm test` and `npm run typecheck` fail CI honestly; do not use `continue-on-error` or exit-status rewriting.
- `npm run test:spike-evidence` is never called by Actions and its failures are never converted into a passing result.
- The license is MIT with `Copyright (c) 2026 KKishikawa`.
- There are no released or supported product versions yet.
- Do not add branch protection, deployment, release configuration, CodeQL, dependency review, templates, or a code of conduct.

---

### Task 1: Reproducible Runtime and Ordinary CI

**Files:**
- Create: `.node-version`
- Create: `.github/workflows/ci.yml`
- Create: `test/repository-foundation.test.ts`

**Interfaces:**
- Consumes: `package-lock.json`; the `test` and `typecheck` scripts in `package.json`
- Produces: Node.js baseline `22.12.0`; status check `CI / quality`; repository configuration regression tests

- [ ] **Step 1: Write the failing runtime and workflow tests**

Create `test/repository-foundation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify it fails because the files do not exist**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: FAIL with `ENOENT` for `.node-version` and `.github/workflows/ci.yml`.

- [ ] **Step 3: Add the exact Node.js version file**

Create `.node-version` containing exactly `22.12.0` followed by a newline.

- [ ] **Step 4: Add the ordinary CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: CI / quality
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@v7.0.1
      - name: Set up Node.js
        uses: actions/setup-node@v7.0.0
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
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: PASS, 2 tests passed.

- [ ] **Step 6: Validate the workflow with actionlint 1.7.12**

Run: `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml`

Expected: exit 0 with no diagnostics.

- [ ] **Step 7: Commit the runtime and CI configuration**

```sh
git add .node-version .github/workflows/ci.yml test/repository-foundation.test.ts
git commit -m "ci: add reproducible quality check"
```

### Task 2: License, Contribution, Security, and Documentation

**Files:**
- Modify: `test/repository-foundation.test.ts`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Modify: `README.md:37`

**Interfaces:**
- Consumes: `.node-version`, `.github/workflows/ci.yml`, existing recognition spike reports and commands
- Produces: MIT grant, contributor contract, private security route, README runtime/CI explanation, enabled private vulnerability reporting

- [ ] **Step 1: Add failing policy and documentation assertions**

Append inside the existing `describe` block in `test/repository-foundation.test.ts`:

```ts
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
  });
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: FAIL because the public policy files do not exist and the README lacks the approved runtime text.

- [ ] **Step 3: Add the standard MIT License**

Create `LICENSE` with this exact content:

```text
MIT License

Copyright (c) 2026 KKishikawa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Add the contribution policy**

Create `CONTRIBUTING.md` with these exact sections and requirements:

````markdown
# Contributing

このリポジトリは現在、画像認識のfeasibility spike段階です。挙動やスコープを変更する場合は、実装前にIssueで目的と採用条件を合意してください。

## 開発環境

`.node-version`に記載されたNode.js 22.12.0を使用します。

```sh
npm ci
npx --no-install playwright install chromium
```

## 変更の検証

Pull Requestを作成する前に、通常の回帰テストと型チェックを実行してください。

```sh
npm test
npm run typecheck
```

`npm run test:spike-evidence`は、不採用になった認識方式の過去の採用条件を再現する専用コマンドであり、通常のgreen baselineではありません。

## 認識spike

- fixtureの正解データ、採用閾値、fail-closed条件を、テストを通す目的だけで弱めないでください。
- throwaway spikeコードは製品候補と明確に分離してください。
- 比較目的で旧spike資産を残す場合は、用途と削除条件を設計書またはspike報告書に記録してください。
````

- [ ] **Step 5: Add the security policy**

Create `SECURITY.md`:

```markdown
# Security Policy

## Supported Versions

このプロジェクトはfeasibility spike段階であり、現在サポート対象のリリースはありません。

## Reporting a Vulnerability

脆弱性の可能性がある情報を公開Issueへ投稿しないでください。GitHubの[Report a vulnerability](https://github.com/KKishikawa/minesweeper-slv/security/advisories/new)から非公開で報告してください。

現段階では修正期限やリリース提供を保証しません。報告内容を確認後、影響範囲と対応方針をGitHub上で連絡します。
```

- [ ] **Step 6: Align the README runtime, setup, and CI explanation**

Replace the runtime and setup section with:

````markdown
## 動作環境

- 開発・CI基準: `.node-version`で22.12.0に固定
- 対応Node.js: 22.12.0以上
- 正式評価: Chromium
- 参考評価: Firefox / Playwright WebKit

`package-lock.json`はPlaywright 1.62.1を固定し、Playwrightが対応するChromium revisionを管理します。通常CIとローカルセットアップは、独立したブラウザバージョンではなく、この組み合わせを使用します。

## セットアップ

```sh
npm ci
npx --no-install playwright install chromium
```
````

Insert before the ordinary validation commands:

```markdown
Pull Requestと`main`へのpushでは、`CI / quality`が同じNode.js・Chromium条件で通常の回帰テストと型チェックを実行します。
```

Replace the paragraph introducing `test:spike-evidence` with:

```markdown
棄却されたセル認識方式の採用条件2件だけを再実行します。現在の証拠では2件とも失敗し、終了コード1を返します。この専用コマンドは通常CIでは実行しません。不採用判断の正本はspike報告書とGit履歴であり、この赤いテストは次期認識設計で再利用価値を棚卸しする退役候補です。
```

- [ ] **Step 7: Run the focused test and verify all four assertions pass**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: PASS, 4 tests passed.

- [ ] **Step 8: Enable and verify private vulnerability reporting**

```sh
gh api --method PUT repos/KKishikawa/minesweeper-slv/private-vulnerability-reporting
gh api repos/KKishikawa/minesweeper-slv/private-vulnerability-reporting --jq .enabled
```

Expected: the PUT request succeeds and the GET request prints `true`.

- [ ] **Step 9: Verify the rejected spike remains an honest, separate failure**

Run by itself: `npm run test:spike-evidence`

Expected: exit 1 with exactly 2 failed tests. Do not append `|| true`, use `continue-on-error`, or include this result in a green aggregate command.

- [ ] **Step 10: Run the complete maintained validation**

Run each command separately and require exit 0:

```sh
npm test
npm run typecheck
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml
git diff --check
```

Expected: 28 test files and 237 tests pass after adding 4 repository-foundation tests; type checking and actionlint produce no diagnostics; `git diff --check` exits 0.

- [ ] **Step 11: Commit the public repository policies**

```sh
git add LICENSE CONTRIBUTING.md SECURITY.md README.md test/repository-foundation.test.ts
git commit -m "docs: add public repository policies"
```
