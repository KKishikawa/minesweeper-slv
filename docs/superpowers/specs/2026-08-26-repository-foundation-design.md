# Repository Foundation Design

## Context

The repository is public, but it has no continuous integration workflow,
license, or contribution and security policy. The recognition work also has
two deliberately failing acceptance tests from a rejected spike. Those tests
must not become part of the ordinary green baseline, and a failing result must
not be converted into a successful CI result.

Issue #4 establishes the repository foundation without starting product
implementation or expanding browser support.

## Goals

- Run the ordinary regression suite and TypeScript type checking for pull
  requests and pushes to `main`.
- Provide one stable status check suitable for later branch protection.
- Reproduce the supported CI runtime with Node.js 22.12.0 and the Chromium
  revision selected by the lockfile-pinned Playwright package.
- Publish the repository under the MIT License using the GitHub account name
  `KKishikawa` as the copyright holder.
- Define the minimum contribution and security policy appropriate for an
  unreleased feasibility-stage project.
- Keep rejected-spike history distinct from maintained regression behavior.

## Non-goals

- Deploying or releasing a browser product.
- Enabling branch protection or choosing a release process.
- Running rejected spike acceptance tests as an ordinary or manual Actions
  workflow.
- Turning an intentionally failing spike result into a passing check.
- Adding CodeQL, dependency review, issue templates, pull request templates,
  or a code of conduct before the project reaches product publication.
- Expanding the supported browser matrix.

## Continuous Integration

Create `.github/workflows/ci.yml` with workflow name `CI`. It runs for every
pull request and every push to `main`. A single job with the stable name
`quality` performs all required validation, so branch protection can later
require one check without coordinating multiple jobs.

The workflow grants only `contents: read`, has a finite timeout, and cancels an
older in-progress run for the same pull request or branch. The job performs
these steps in order:

1. Check out the repository.
2. Read Node.js 22.12.0 from `.node-version` and enable npm caching.
3. Install dependencies with `npm ci`.
4. Install Chromium and its Linux system dependencies with the local,
   lockfile-pinned Playwright CLI.
5. Run `npm test`.
6. Run `npm run typecheck`.

There is no `continue-on-error` and no shell wrapper that changes a failing
exit status. A failure in dependency installation, Chromium installation,
tests, or type checking fails `quality`. Separate step names make the failing
stage visible in Actions.

The workflow does not call `npm run test:spike-evidence`. The rejected cell
recognition decision is preserved by the spike reports and Git history, not by
requiring a perpetually red workflow. Issue #5 will classify existing
recognition assets as reusable, temporarily retained for a named comparison,
or ready for retirement.

## Reproducible Runtime

Add `.node-version` containing exactly `22.12.0`. The Actions workflow reads
that file, and local Node version managers can use the same value.
`package.json` continues to declare `node >=22.12.0`: the engines field states
the supported floor, while `.node-version` states the exact development and CI
baseline.

`npm ci` uses `package-lock.json`, which fixes the Playwright package version.
The workflow invokes the locally installed Playwright CLI with
`npx --no-install`, so npm cannot fetch a different CLI version. Playwright's
installed Chromium revision is therefore selected by the locked Playwright
package rather than by an independently floating browser download.

The README documents these relationships instead of hard-coding a Chromium
marketing version that can drift when Playwright is deliberately upgraded.

## License and Public Policies

Add the standard MIT License text as `LICENSE` with:

```text
Copyright (c) 2026 KKishikawa
```

Add `CONTRIBUTING.md` with the following project-specific rules:

- Discuss behavior or scope changes in an issue before implementation.
- Use the documented Node.js and Chromium setup.
- Run the ordinary regression suite and type check before proposing a change.
- Treat recognition adoption criteria as safety gates; do not weaken fixture
  truth, thresholds, or failure handling merely to obtain a green result.
- Keep throwaway spike code visibly separate from product candidates, and
  record the decision and retirement condition for any spike asset retained as
  a comparison baseline.

Add `SECURITY.md` stating that there are currently no released or supported
versions. Potential vulnerabilities must not be disclosed in a public issue;
reporters should use GitHub private vulnerability reporting. Enable that
repository setting and verify it through the GitHub API.

Update the README so it agrees with `.node-version`, the workflow, the
Playwright/Chromium locking rule, and the separation between ordinary CI and
historical spike decisions. The README must not suggest that rejected spike
tests are part of the required green baseline.

## Validation

Before completion:

1. Run `npm test` and confirm all ordinary regression tests pass.
2. Run `npm run typecheck` and confirm it passes.
3. Run `npm run test:spike-evidence` once and confirm the known two acceptance
   tests still fail, proving they remain outside the ordinary suite.
4. Validate the Actions workflow syntax with an Actions-aware static checker.
5. Check that `.node-version`, README, and the workflow all specify Node.js
   22.12.0 and the same Playwright-controlled Chromium policy.
6. Verify private vulnerability reporting is enabled.
7. Run `git diff --check`.

The expected failure in step 3 is recorded separately and is never included in
a combined command whose overall result is presented as green.

## Issue Traceability

The approved decisions are recorded on Issue #4. The recognition asset
retention and retirement rule is also recorded on Issue #5 because it affects
the design of the next cell-recognition spike and is not fully implied by that
issue's original text. No duplicate note is added to Issue #8 at this stage;
its existing adoption-gate requirements are sufficient until the next
recognition approach exists.
