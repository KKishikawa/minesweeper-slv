# Project Information and Roadmap Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish repository-local current project documentation and an ADR log, then align the public README and GitHub Issues around a manual-board-entry MVP that can progress independently of recognition research.

**Architecture:** `docs/project` becomes the scoped source of truth for current product, roadmap, and session entry information; `docs/decisions` records one durable decision per ADR with an indexed active/superseded view. Dated Superpowers documents remain historical evidence, the root README remains a public summary, and GitHub Issues remain operational work items whose dependencies mirror the repository-local roadmap.

**Tech Stack:** Markdown, GitHub Issues, GitHub CLI, Node.js 22.12.0, TypeScript 7.0.2, Vitest 4.1.10

**Spec:** `docs/superpowers/specs/2026-08-28-project-information-and-roadmap-design.md`

## Global Constraints

- The first MVP is a browser application that solves a manually entered Minesweeper position without requiring image input or automatic recognition.
- Image and board processing remain completely local; no backend or external analysis API is introduced.
- An uncertain or inconsistent board never reaches the solver until the user confirms or corrects it.
- Product-core progress is independent of recognition adoption; Issue #8 gates recognition integration, not the manual-board-entry MVP.
- The previous manual solver is a design and specification reference only, not a compatibility target, migration source, runtime dependency, or repository prerequisite.
- Describe the work as building the current product from independently stated requirements; do not characterize it as modernization work on the previous solver.
- Historical specifications, spike reports, and plans stay in place and retain their original evidence.
- Do not infer missing historical rationale; backfill ADRs only from recorded evidence.
- Do not create a fixture-export Issue during this migration.
- Preserve existing Git commit-signing configuration. Never disable signing or retry a signing failure unsigned.

## File Structure

### Files to create

- `docs/project/README.md`: short session entry point, current state, current milestone, next executable work, and authority map.
- `docs/project/product.md`: current product purpose, manual-board-entry MVP, durable constraints, later milestones, and the role of the previous solver reference.
- `docs/project/roadmap.md`: track structure, actual gates, Issue mapping, milestone acceptance, and current execution order.
- `docs/decisions/README.md`: ADR log grouped by active and superseded decisions.
- `docs/decisions/0001-process-data-locally.md`: local-only processing decision.
- `docs/decisions/0002-conditionally-adopt-initial-cell-recognition.md`: superseded initial limited-adoption decision.
- `docs/decisions/0003-reject-current-cell-recognition-candidates.md`: current cell-recognition disposition.
- `docs/decisions/0004-partially-adopt-fail-closed-grid-detection.md`: current grid-detection disposition.
- `docs/decisions/0005-require-manual-confirmation-before-solving-uncertain-boards.md`: solver safety boundary.
- `docs/decisions/0006-use-chromium-as-formal-recognition-evaluator.md`: browser evidence authority.
- `docs/decisions/0007-deliver-manual-board-entry-mvp-first.md`: first MVP boundary.
- `docs/decisions/0008-decouple-product-core-from-recognition-adoption.md`: roadmap gate change.

### Files to modify

- `test/repository-foundation.test.ts`: guard the current-document entry points, ADR log, primary links, and absence of the obsolete global gate.
- `README.md`: publish the new MVP/current-state summary and link to `docs/project/README.md`.
- `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md`: add a historical-document notice without rewriting its body.

### External state to modify

- GitHub Issue #1: replace the single recognition-gated phase sequence with independent product-core, recognition-research, and image-assistance tracks.
- GitHub Issues #5 through #8: retain their recognition sequence while limiting #8's gate to recognition-dependent work.
- GitHub Issues #9 through #16: align titles, scope, dependencies, labels, and acceptance criteria with the manual-board-entry MVP and later image-assistance work.

---

### Task 1: Current Project Entry, Product Definition, and Roadmap

**Files:**
- Create: `docs/project/README.md`
- Create: `docs/project/product.md`
- Create: `docs/project/roadmap.md`
- Modify: `test/repository-foundation.test.ts`

**Interfaces:**
- Consumes: the approved reorganization spec, root `README.md`, Issue #1, Issues #5 through #16, and the dated full product design
- Produces: stable Markdown entry points used by the ADR log, public README, and GitHub Issue updates

- [ ] **Step 1: Add a failing current-project-document test**

Add this test inside the existing `describe("repository foundation", ...)` block:

```ts
  it("provides current project, product, and roadmap sources of truth", async () => {
    const [project, product, roadmap] = await Promise.all([
      readRepositoryFile("docs/project/README.md"),
      readRepositoryFile("docs/project/product.md"),
      readRepositoryFile("docs/project/roadmap.md"),
    ]);

    expect(project).toContain("[製品定義](product.md)");
    expect(project).toContain("[ロードマップ](roadmap.md)");
    expect(project).toContain("[ADR log](../decisions/README.md)");
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
```

- [ ] **Step 2: Run the focused test and verify it fails for missing files**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: FAIL with `ENOENT` for `docs/project/README.md`, `product.md`, and `roadmap.md`; the existing repository-foundation tests remain passing.

- [ ] **Step 3: Create the current project entry point**

Create `docs/project/README.md` with these exact sections and responsibilities:

```markdown
# プロジェクト現在地

## 現在の目標

最初のMVPは、画像認識なしでも、手動盤面入力とsolverでマインスイーパーの問題を解けるブラウザアプリです。

## 現在の状態

- 手動盤面入力型MVP: 設計済み、実装計画が次の作業
- 盤面グリッド検出: Chromium正式評価16ケース中14ケースをfail-closedで部分採用
- セル認識: 現在評価済みの候補は不採用。認識研究トラックで再設計する
- ブラウザ製品: 未実装

## 次の作業

Issue #9で手動盤面入力型MVPの実装計画を作成する。認識研究はIssue #5から独立して進められる。

## 現在の正本

- [製品定義](product.md)
- [ロードマップ](roadmap.md)
- [ADR log](../decisions/README.md)

## 歴史資料

`docs/superpowers/specs`は各時点の設計、`docs/superpowers/spikes`は実験結果、`docs/superpowers/plans`は実施手順と作業記録です。現在の製品定義、順序、判断が歴史資料と異なる場合は、上記の現在の正本を優先します。
```

- [ ] **Step 4: Create the current product definition**

Create `docs/project/product.md`. Include these sections and requirements as complete prose:

- `目的`: a desktop-browser Minesweeper solver that runs locally and can later accept image assistance.
- `最初のMVP`: user-entered width, height, and total mines; an all-closed initial board; mouse and keyboard entry of closed, empty, flag, and 1 through 8; validation; certain-safe, certain-mine, and best-guess proposals; Japanese UI; keyboard access; local execution.
- `安全契約`: uncertain or inconsistent cells stop solver execution; manual correction updates validation and solver state without requiring recognition.
- `MVPの非対象`: image upload, clipboard, drag-and-drop, display capture, cell recognition, automatic clicking, backend, and numerical probability display.
- `後続マイルストーン`: image input, recognition integration, and explicit user-controlled fixture-candidate export after separate design approval.
- `認識との関係`: recognition enhances entry but is not required for the first useful product.
- `参考実装の扱い`: use the exact sentence `以前の手動solverは、現在の製品の設計・仕様を検討する際の参考に限って利用する。互換性、移植、実行時依存、リポジトリへの収録は要件にしない。`

Do not copy branding, endpoint behavior, source text, or implementation details from the external reference.

- [ ] **Step 5: Create the track-based roadmap**

Create `docs/project/roadmap.md` with:

- a current milestone naming the manual-board-entry MVP;
- Track 1 with `#9 -> #10 -> (#11 and #14 in parallel) -> #15 -> #16`;
- Track 2 with `#5 -> #6 -> #7 -> #8`;
- Track 3 with #12 for shared image acquisition and #13 for adopted-recognizer integration;
- a gate table stating that #8 gates #13 but not #9, #10, #11, #14, #15, or the MVP scope of #16;
- per-milestone quality gates rather than one final recognition-dependent quality phase;
- a statement that fixture-candidate export remains a future milestone, not a current Issue;
- a mapping table for Issues #5 through #16 showing track, immediate dependency, and whether currently executable.

The issue table must show #9 and #5 as independently executable after this reorganization. #10 remains dependent on #9. #13 remains dependent on an adopted #8 result, #10, and #12.

- [ ] **Step 6: Run the focused test and verify the current documents pass**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: PASS for all repository-foundation tests.

- [ ] **Step 7: Check Markdown and staged whitespace**

Run: `git diff --check`

Expected: exit 0 with no diagnostics.

- [ ] **Step 8: Commit the current project documents**

```sh
git add docs/project/README.md docs/project/product.md docs/project/roadmap.md test/repository-foundation.test.ts
git commit -m "docs: establish current project sources"
```

### Task 2: ADR Log and Initial Decisions

**Files:**
- Create: `docs/decisions/README.md`
- Create: `docs/decisions/0001-process-data-locally.md`
- Create: `docs/decisions/0002-conditionally-adopt-initial-cell-recognition.md`
- Create: `docs/decisions/0003-reject-current-cell-recognition-candidates.md`
- Create: `docs/decisions/0004-partially-adopt-fail-closed-grid-detection.md`
- Create: `docs/decisions/0005-require-manual-confirmation-before-solving-uncertain-boards.md`
- Create: `docs/decisions/0006-use-chromium-as-formal-recognition-evaluator.md`
- Create: `docs/decisions/0007-deliver-manual-board-entry-mvp-first.md`
- Create: `docs/decisions/0008-decouple-product-core-from-recognition-adoption.md`
- Modify: `test/repository-foundation.test.ts`

**Interfaces:**
- Consumes: `docs/project/product.md`, `docs/project/roadmap.md`, dated specs, spike reports, and their recorded dates and decision literals
- Produces: indexed active/superseded decisions linked by `docs/project/README.md`

- [ ] **Step 1: Add a failing ADR-log integrity test**

Add this test to `test/repository-foundation.test.ts`:

```ts
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
    expect(adrs[1]).toContain("Status: superseded");
    expect(adrs[1]).toContain("0003-reject-current-cell-recognition-candidates.md");
    for (const adr of adrs) {
      expect(adr).toMatch(/Status: (accepted|superseded)/);
      expect(adr).toContain("## Context");
      expect(adr).toContain("## Decision");
      expect(adr).toContain("## Consequences");
      expect(adr).toContain("## Evidence");
    }
  });
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing ADR log**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: FAIL with `ENOENT` for `docs/decisions/README.md` and the ADR files.

- [ ] **Step 3: Create the ADR log**

Create `docs/decisions/README.md` with:

- a short explanation that ADRs record current and superseded architectural decisions while spike reports retain measurements;
- an `Active` table listing 0001 and 0003 through 0008 with date, one-sentence decision, and link;
- a `Superseded` table listing 0002 and its replacement 0003;
- the update rule: add a new ADR, mark the old ADR superseded, and link both directions;
- a link back to `../project/README.md`.

- [ ] **Step 4: Backfill ADRs 0001 through 0006 from recorded evidence**

Use this exact status/date/decision/evidence mapping:

| ADR | Status | Date | Decision | Required evidence |
| --- | --- | --- | --- | --- |
| 0001 | accepted | 2026-08-16 | Process images and boards locally in the browser; no backend analysis API. | `2026-08-16-minesweeper-solver-design.md` privacy and architecture sections |
| 0002 | superseded | 2026-08-17 | Conditionally adopt the first cell classifier for native-scale, original-encoding sources only. | `2026-08-16-image-recognition-report.md`; superseded by 0003 |
| 0003 | accepted | 2026-08-23 | Do not adopt either evaluated prototype classifier; return to recognition design. | multi-prototype design and report; supersedes 0002 |
| 0004 | accepted | 2026-08-24 | Adopt the deterministic grid path for the exact 11 direct / 3 fallback / 2 fail-closed matrix. | canonical-grid partial-adoption and UX-amendment specs; final fallback report |
| 0005 | accepted | 2026-08-16 | Stop solver execution for uncertain or inconsistent boards until manual confirmation. | full product design lines describing validation and manual correction |
| 0006 | accepted | 2026-08-23 | Use Chromium for formal recognition decisions; treat Firefox and Playwright WebKit as informational. | multi-prototype design/report and canonical-grid report |

Each ADR must use the headings `Context`, `Considered Options`, `Decision`, `Consequences`, and `Evidence`. Where the historical evidence does not enumerate alternatives explicitly, state only the alternatives that the linked design actually records.

For ADR 0002, include:

```markdown
Status: superseded by [ADR 0003](0003-reject-current-cell-recognition-candidates.md)
```

For ADR 0003, include:

```markdown
Supersedes: [ADR 0002](0002-conditionally-adopt-initial-cell-recognition.md)
```

- [ ] **Step 5: Record ADRs 0007 and 0008 from the approved 2026-08-28 design**

ADR 0007 records:

- manual board entry plus the local solver is the first MVP;
- image input and recognition are later enhancements;
- the prior solver informs requirements but is not a compatibility target or project dependency;
- the consequence is earlier user value and a stable product surface for later image assistance.

ADR 0008 records:

- product-core and recognition-research tracks may proceed independently;
- #8 gates #13 and other recognition-dependent integration only;
- #9, #10, #11, #14, #15, and the manual-MVP scope of #16 do not depend on recognition adoption;
- the consequence is a synchronization requirement between repository roadmap documents and GitHub Issues.

Both use date `2026-08-28`, status `accepted`, and cite the approved reorganization spec.

- [ ] **Step 6: Run the focused test and verify the ADR log passes**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: PASS for all repository-foundation tests.

- [ ] **Step 7: Review every evidence link and decision status**

Run:

```sh
rg -n "Status:|Supersedes:|superseded by|docs/superpowers" docs/decisions
```

Expected: eight ADR status lines; ADR 0002 links to 0003; ADR 0003 links to 0002; every ADR contains one or more repository-relative evidence links.

- [ ] **Step 8: Commit the ADR log**

```sh
git add docs/decisions test/repository-foundation.test.ts
git commit -m "docs: add architectural decision log"
```

### Task 3: Public and Historical Navigation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md`
- Modify: `test/repository-foundation.test.ts`

**Interfaces:**
- Consumes: the current project documents and ADR log from Tasks 1 and 2
- Produces: a public summary and historical notice that route readers to current sources without altering historical evidence

- [ ] **Step 1: Add failing navigation and obsolete-gate assertions**

Add this test to `test/repository-foundation.test.ts`:

```ts
  it("routes public and historical readers to the current project sources", async () => {
    const [readme, historicalDesign] = await Promise.all([
      readRepositoryFile("README.md"),
      readRepositoryFile("docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md"),
    ]);

    expect(readme).toContain("docs/project/README.md");
    expect(readme).toContain("手動盤面入力型MVP");
    expect(readme).toContain("認識研究");
    expect(readme).not.toContain("次期セル認識方式の採用まで閉鎖");
    expect(historicalDesign).toContain("../../project/README.md");
    expect(historicalDesign).toContain("../../decisions/README.md");
    expect(historicalDesign).toContain("現在有効な製品定義");
  });
```

- [ ] **Step 2: Run the focused test and verify it fails on the old navigation**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: FAIL because the root README still describes a closed global product gate and the dated design lacks the notice.

- [ ] **Step 3: Update the root README current-state summary**

Preserve setup, runtime, verification commands, public project policies, and historical report links. Replace the product-state and roadmap summary so that it states:

- the first target is the manual-board-entry MVP;
- product-core work can proceed without recognition adoption;
- grid detection remains partially adopted at 14/16 fail-closed;
- current cell-recognition candidates remain rejected;
- recognition continues on an independent research track;
- `docs/project/README.md` is the current project entry point;
- `docs/decisions/README.md` is the ADR log;
- Issue #1 is the GitHub work dashboard.

Remove the sentence that says product implementation is closed until the next cell recognizer is adopted. Do not describe any unimplemented MVP function as currently available.

- [ ] **Step 4: Add a current-source notice to the dated full design**

Insert this block immediately after the H1 in `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md`:

```markdown
> [!NOTE]
> この文書は2026-08-16時点の承認済み設計を保存した歴史資料です。現在有効な製品定義とロードマップは[プロジェクト現在地](../../project/README.md)、現在有効な判断と置換関係は[ADR log](../../decisions/README.md)を参照してください。
```

Do not rewrite the dated design's recognition section or implementation order.

- [ ] **Step 5: Run the focused test and verify navigation passes**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: PASS for all repository-foundation tests.

- [ ] **Step 6: Scan current documents for the obsolete global gate**

Run:

```sh
rg -n "製品実装ゲート.*閉鎖|次期セル認識方式の採用まで閉鎖|#8 が.*Phase 2以降には着手しません" README.md docs/project docs/decisions
```

Expected: no matches. Matches in dated historical specs, spike reports, or plans are permitted because those collections retain historical evidence.

- [ ] **Step 7: Commit public and historical navigation**

```sh
git add README.md docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md test/repository-foundation.test.ts
git commit -m "docs: route readers to current project state"
```

### Task 4: GitHub Roadmap and Issue Dependencies

**Files:**
- Modify externally: GitHub Issues #1 and #5 through #16

**Interfaces:**
- Consumes: `docs/project/roadmap.md`, `docs/project/product.md`, and ADRs 0007 and 0008
- Produces: GitHub work items whose titles, dependencies, scope, and labels match the repository-local current roadmap

- [ ] **Step 1: Capture the pre-change Issue state**

Run:

```sh
gh issue list --state all --limit 50 --json number,title,state,labels,url
gh issue view 1 --json number,title,body,state,url
```

Expected: #9 through #16 carry `blocked`; Issue #1 states that all Phase 2 work waits for #8.

- [ ] **Step 2: Replace Issue #1 with the track-based dashboard**

Keep the title `[Roadmap] ブラウザ版 Minesweeper Solver の製品化`. Write this exact reviewed body to `/tmp/minesweeper-slv-issue-1-body.md` using `apply_patch`:

```markdown
## 目的

ブラウザ内でマインスイーパーの盤面を解析できる製品へ、利用可能な到達点ごとに進むための作業ダッシュボードです。

現在有効な情報は、リポジトリの `docs/project/README.md` と `docs/project/roadmap.md` を正本とします。GitHub Issueは個々の作業状態を管理します。

## 現在地

- 次の製品目標: 画像認識なしでも使える手動盤面入力型MVP
- グリッド検出: Chromium正式評価16ケース中14ケースをfail-closedで部分採用
- セル認識: 現在評価済みの候補は不採用。独立した認識研究を継続
- ブラウザ製品: 未実装

## Track 1: 手動盤面入力型MVP

- [ ] #9
- [ ] #10
- [ ] #11
- [ ] #14
- [ ] #15
- [ ] #16

## Track 2: 認識研究

- [ ] #5
- [ ] #6
- [ ] #7
- [ ] #8

## Track 3: 画像支援と認識統合

- [ ] #12
- [ ] #13

## ゲート原則

#8は#13と、認識方式を必要とする後続作業だけをゲートします。#9、#10、#11、#14、#15、および手動盤面入力型MVPを対象とする#16は、認識採用を待たずに進められます。

品質確認は最後の一度だけではなく、手動盤面入力型MVP、画像入力、認識統合、公開リリースの各到達点で実施します。
```

Apply it without shell substitution:

```sh
gh issue edit 1 --body-file /tmp/minesweeper-slv-issue-1-body.md
```

- [ ] **Step 3: Clarify the recognition Issue sequence**

For Issues #5, #6, and #7, preserve scope and acceptance criteria. Add this exact roadmap note after the parent-roadmap line:

```markdown
トラック: 認識研究。このIssue列は製品コアと並行可能であり、#8の判断は認識統合Issue #13をゲートする。
```

For Issue #8:

- replace wording that calls it the product-phase gate with wording that calls it the recognition-integration gate;
- change the rejection consequence from keeping all product Issues blocked to keeping #13 and other recognition-dependent work blocked;
- change the dependency/gate acceptance item to require updating the recognition track and #13, not blocking the manual MVP.

Preserve #5 -> #6 -> #7 -> #8 dependencies.

- [ ] **Step 4: Reframe Issue #9 as the executable MVP plan**

Change the title to:

```text
[MVP] 手動盤面入力型MVPの実装計画を作成する
```

Its scope must cover board model, validation, local solver, manual board entry, rendering, integrated Japanese UI, milestone E2E, file responsibilities, worker messages, state transitions, TDD steps, and commit boundaries. Explicitly exclude image input and automatic recognition. Replace the dependency section with:

```markdown
## 依存関係

- 本Issueは現在着手可能
- 認識採用Issue #8には依存しない
```

Remove the `blocked` label from #9 only:

```sh
gh issue edit 9 --remove-label blocked
```

- [ ] **Step 5: Update product-core Issue dependencies**

Apply these exact dependency outcomes while preserving unrelated scope and acceptance criteria:

| Issue | Title change | Required dependencies | Required scope correction |
| --- | --- | --- | --- |
| #10 | none | #9 only | remove the requirement that #8 be adopted |
| #11 | none | #10 | no recognition dependency |
| #14 | `[盤面UI] Canvas盤面表示と手動入力を実装する` | #10 | remove #12; describe entry as primary MVP input, not only recognition correction |
| #15 | prefix title with `[MVP UI]` | #11 and #14 | remove #12 and #13; scope the flow to board setup, manual entry, validation, solver result, errors, responsive layout, and accessibility |
| #16 | `[MVP品質] E2E、アクセシビリティ、プライバシー、公開準備を完了する` | #15 and completed MVP-track Issues | replace image-file and display-capture E2E with manual board creation through solver proposal; retain local-only/network, layout, production build, and release documentation checks |

Issues #10, #11, #14, #15, and #16 keep the `blocked` label until their immediate prerequisite closes. Their bodies must not claim that #8 is the blocker.

- [ ] **Step 6: Update image-assistance and recognition-integration dependencies**

For #12:

- retain file, paste, drag-and-drop, and display-capture scope;
- depend on #10 only;
- state that shared pixel acquisition can be implemented without an adopted recognizer;
- keep `blocked` while #10 is open.

For #13:

- depend on an adopted #8 result, #10, #12, and the board-state/manual-entry boundary from #14;
- retain grid-not-found, needs-review, revision, and last-valid-board behavior;
- state that #13 is the point at which recognition adoption becomes a product gate;
- keep `blocked`.

- [ ] **Step 7: Verify every Issue body and label after mutation**

Run:

```sh
for issue_number in 1 5 6 7 8 9 10 11 12 13 14 15 16; do gh issue view "$issue_number" --json number,title,body,labels,state; done
```

Expected:

- #1 shows three tracks and limits the #8 gate to recognition-dependent work;
- #9 has no `blocked` label and states it is currently executable;
- #10, #11, #12, #14, #15, and #16 do not depend on #8;
- #14 does not depend on #12;
- #15 does not depend on #12 or #13;
- #13 still depends on an adopted #8 result;
- #5 through #8 describe the recognition-research track.

### Task 5: Cross-System Consistency and Final Verification

**Files:**
- Modify only if verification exposes a mismatch: `README.md`, `docs/project/*.md`, `docs/decisions/*.md`, `test/repository-foundation.test.ts`

**Interfaces:**
- Consumes: all local documentation and updated GitHub Issues
- Produces: verified agreement between repository-local current sources, the public summary, the ADR log, and operational work items

- [ ] **Step 1: Run the focused repository-foundation tests**

Run: `npx vitest run test/repository-foundation.test.ts`

Expected: PASS with every test in the file passing.

- [ ] **Step 2: Run the full ordinary regression suite**

Run: `npm test`

Expected: exit 0 with no failed test files or tests. The intentionally rejected spike-evidence suite is not part of this command.

- [ ] **Step 3: Run type checking**

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript diagnostics.

- [ ] **Step 4: Verify formatting and worktree scope**

Run:

```sh
git diff --check
git status --short
```

Expected: no whitespace diagnostics. Any listed files are limited to corrections required by this plan; unrelated user changes remain untouched.

- [ ] **Step 5: Verify current-source language and links**

Run:

```sh
rg -n "手動盤面入力型MVP|認識研究|ADR log|#8|#13" README.md docs/project docs/decisions
rg -n "製品実装ゲート.*閉鎖|次期セル認識方式の採用まで閉鎖|#8 が.*Phase 2以降には着手しません" README.md docs/project docs/decisions
```

Expected: the first command shows the new current-state vocabulary and gate links. The second command returns no matches.

- [ ] **Step 6: Verify GitHub Issue operational state one final time**

Run:

```sh
gh issue list --state open --limit 20
gh issue view 1 --json body
gh issue view 9 --json title,body,labels
gh issue view 13 --json title,body,labels
```

Expected: #9 is the executable manual-MVP planning Issue; #5 is independently executable recognition work; #13 remains recognition-gated; Issue #1 matches `docs/project/roadmap.md`.

- [ ] **Step 7: Commit any verification-driven correction**

If Steps 1 through 6 required a local correction, stage only those files and commit:

```sh
git add README.md docs/project docs/decisions test/repository-foundation.test.ts
git commit -m "docs: align project roadmap references"
```

If no local file changed, do not create an empty commit.
