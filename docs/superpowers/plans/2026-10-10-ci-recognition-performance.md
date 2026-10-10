# CI Recognition Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 必要な全検証を維持し、通常CIのwall timeを変更前から30%以上短縮する。

**Architecture:** 通常テスト集合を共有manifestで5グループへ分類し、各グループは独立runner内で直列実行する。既存の `CI / quality` は全結果を厳密に検査する集約ジョブとなる。計測専用workflowは固定refで変更前・直列、変更後・直列、変更後・分割を比較する。

**Tech Stack:** Node.js 22.12.0、TypeScript、Vitest 4.1.10、lockfile指定Playwright/Chromium、GitHub Actions ubuntu-24.04。

**Spec:** [承認済み設計](../specs/2026-10-10-ci-recognition-performance-design.md)

## Global Constraints

- 全PR/main pushで全通常テストを実行し、グループ内は `fileParallelism: false`。Pagesも完全回帰を維持。
- `npm test` は完全直列回帰。`*.spike.test.ts` は除外し、赤い `test:spike-evidence` へ通常評価を移さない。
- 閾値、fixtures/正解、fold数、matrix、反復数、既存assertion、fail-closed条件、依存関係を固定。
- 必須job ID `quality` と名前 `CI / quality`、現行権限・concurrency取消・公開承認条件を維持。
- Git署名設定を維持。署名失敗を無署名再試行で回避しない。
- baseline SHAは `1a01eac18f389e7933be9937ad7fa4aa8be476b7`。変更後も完全SHAで固定。
- A/B/C最低3回ずつ。全体改善はA→Cで判定。8分48秒以下だけで完了扱いにしない。

## Review Focus

1. 新規テスト・移動・明示指定の削除：重複/欠落を検知し、新規通常テストは既定グループへ入る（Task 1）。
2. setup失敗、cancelled、skipped：集約成功へ変換しない（Task 2）。
3. テスト失敗時のreport欠落：終了コードを維持し、欠落を明示する（Task 3）。
4. baselineへの最適化混入：固定SHA、許容diff、計測patch hashを記録する（Task 4/5）。
5. 画像入力のmutation、呼出し間cache、holdout漏洩：再利用を評価呼出し内へ限定し既存独立検証を維持する（Task 4）。

## File Map

- `scripts/ci/test-groups.ts`: グループと分類/集合検証の唯一の定義。
- `scripts/ci/quality-result.ts`: 依存job結果の厳密判定とCLI。
- `scripts/ci/run-tests.ts`: ローカル/CIのグループ選択とVitest report保存。
- `scripts/ci/benchmark-report.ts`: Actions APIの時間・結論とVitest artifactsを比較表へまとめるCLI。
- `test/ci/test-groups.test.ts`, `quality-result.test.ts`, `run-tests.test.ts`, `benchmark-report.test.ts`: 上記の失敗条件と契約を検証。
- `vitest.config.ts`, `package.json`, `.github/workflows/ci.yml`, `test/repository-foundation.test.ts`: 分割設定と集約への変更。
- `.github/workflows/ci-benchmark.yml`: 手動A/B/C比較専用。Pages公開を呼ばない。
- `README.md`, `CONTRIBUTING.md`: 実行条件/完全検証/部分実行コマンド。
- `docs/project/evidence/ci-performance/2026-10-10/profile.md`, `comparison.md`: プロファイルと比較結果。raw artifactsは `test/artifacts/ci/` とActionsへ保存。

---

### Task 1: テスト分類と分割実行の基盤

**Files:** Create `scripts/ci/test-groups.ts`, `test/ci/test-groups.test.ts`; Modify `vitest.config.ts`。

**Interfaces:** `TEST_GROUPS = ['product', 'formal', 'holdout', 'grid-compatibility', 'recognition'] as const`; `TestGroup` はそのunion。`classifyTest(path: string): TestGroup | null` と `validatePartition(paths: readonly string[]): void` をexport。pathはrepository相対POSIX形式。spikeはnull、通常recognitionは既定recognition、他の通常テストはproduct。

- [ ] **Step 1: 分割集合のテストを追加する。** 6ファイルの分類を設計表と照合。実ファイル列挙と各グループ和集合の一致、重複なし、空グループなし、存在しない明示指定の失敗をassert。新規 `test/recognition/new.test.ts` はrecognition、新規 `test/ci/new.test.ts` はproduct、spikeはnull、同一path重複はthrowをassert。
- [ ] **Step 2: `npx --no-install vitest run test/ci/test-groups.test.ts` を実行し、module未実装で失敗することを確認する。**
- [ ] **Step 3: 分類/集合検証とconfigを実装する。** configは `CI_TEST_GROUP` が未設定なら従来の全対象、設定済みなら共有分類と一致するincludeを選ぶ。未知値は設定ロード時にthrowし、空選択で成功させない。明示グループはformal 1件、holdout 2件、grid-compatibility 2件。独立したデフォルト除外一覧を増やさない。
- [ ] **Step 4: 分類テストと `npm run typecheck` を実行する。** 実suiteの `vitest list --filesOnly` 相当の一覧を各グループで取得し、通常全体との完全一致とspike除外を確認。config/importの新規test/ci自身もproductに含む。
- [ ] **Step 5: 対象3ファイルをコミットする。** Message: `feat: define complete CI test groups`。

### Task 2: 必須チェックの集約と通常workflow

**Files:** Create `scripts/ci/quality-result.ts`, `test/ci/quality-result.test.ts`, 最小の `scripts/ci/run-tests.ts`; Modify `.github/workflows/ci.yml`, `package.json`, `test/repository-foundation.test.ts`, `README.md`, `CONTRIBUTING.md`。

**Interfaces:** `allJobsSucceeded(results: Readonly<Record<string, string>>, expectedJobs: readonly string[]): boolean`。通常workflowの検証job IDは `regression`（5グループのmatrix）、集約は `quality`。集約のexpectedJobsは `['regression']`。matrixは `fail-fast: false`。

- [ ] **Step 1: 判定テストを追加する。** 全successのみtrue、failure/cancelled/skipped/未知値/欠落/空expectedJobs/余分な結果はfalse。repository-foundationに5グループ、always集約、needs、失敗隠蔽なし、runtime、Pagesの完全回帰コマンドと公開条件をassertする検証を追加する。
- [ ] **Step 2: `npx --no-install vitest run test/ci/quality-result.test.ts test/repository-foundation.test.ts` が新しい要件で失敗することを確認する。**
- [ ] **Step 3: 判定関数/CLIとworkflowを実装する。** CLIはneeds JSONをenvで受け、全結果を厳密比較して終了コード0/1を返す。quality自身でcheckout/Node/npm ciを行いローカルtsx経由で呼ぶ。検証matrix各jobは20分timeout、独立setupとChromium導入。productのみtypecheck/build、その後は各グループ実行。集約は5分timeout、`if: always()`、`needs: regression`。matrix値は共有manifestとの一致をfoundationで検証。
- [ ] **Step 4: ドキュメントを更新する。** `test:ci` はグループ選択用（例 `npm run test:ci -- product`）。この段階はmanifestを読むtsx CLIからVitestを起動する最小実装をTask 3の `run-tests.ts` に置き、Task 3で記録処理を拡張する。README/CONTRIBUTINGはtypecheck → build → npm testを完全検証として案内し、全PR/main push・Pagesの全検証を明記する。
- [ ] **Step 5: 対象テスト/typecheckと `npm run build && npm run test:ci -- product` を実行する。** productに全製品ブラウザとfoundationが入り、Pages workflowの実行条件を変更していないことをdiffで確認する。
- [ ] **Step 6: このtaskの対象ファイルと最小 `run-tests.ts` をコミットする。** Message: `ci: aggregate isolated regression jobs`。

### Task 3: 時間記録とA/B/C手動workflow

**Files:** Extend `scripts/ci/run-tests.ts`; Create `test/ci/run-tests.test.ts`, `.github/workflows/ci-benchmark.yml`; Modify `.github/workflows/ci.yml`, `test/repository-foundation.test.ts`。

**Interfaces:** `runTests(group: TestGroup | 'all', outputDirectory: string): Promise<number>`。CLI引数は `<group|all>`、artifact rootは `test/artifacts/ci/<group>/`。`metadata.json` はschemaVersion 1、group、対象SHA、Node/Chromium版、開始/終了UTC、exitCode、reportMissing、RSS値と計測scopeを保存。Vitest JSONは `vitest.json`。

- [ ] **Step 1: subprocess契約のテストを追加する。** 小さな一時Vitest suiteでsuccessは0、故意のfailは非0、存在しないgroupは実行前に非0、JSON欠落はmetadataで明示。テストchildが返す非0をreport保存で0へ変換しない。既存300秒timeout等のconfigを上書きしない。
- [ ] **Step 2: `npx --no-install vitest run test/ci/run-tests.test.ts` が記録未実装で失敗することを確認する。**
- [ ] **Step 3: runnerの記録を実装する。** Vitestのdefault/JSON reporterで全テストとファイル時間を残し、stdoutを利用者へ流す。全体実行もグループ実行も直列。LinuxはGNU timeのmax RSSとscopeを保存し、未対応OSはnullと理由を保存。全processの同時RSS合計とは呼ばない。signal/spawn失敗も非0とmetadataへ記録する。
- [ ] **Step 4: 通常workflowにartifact uploadを追加する。** 各グループのmetadata/JSONを `always()` で保存。既存Action同様、upload-artifactは公式releaseの完全SHAへ固定し、解決したSHAを記録する。artifactがテスト失敗を隠さない。foundationで固定revisionと全グループ記録を検証する。
- [ ] **Step 5: 手動benchmark workflowを実装する。** inputsは `condition`（A/B/C）と `after_sha`（完全SHA）、baselineは固定値。入力はenvで渡し、SHAは40桁hexとして検証しshellコードへ直接展開しない。A/Bのjobsは変更前CIと同じセットアップ、typecheck/build/直列全テストを実行。Aへ変更後runnerや共有helperをコピーしない。reporter指定と外側GNU timeは共通workflowで適用し、対象refと制御refを別記録する。CはTask 2の構成と同じ5グループと集約を実行。conditionで意図した他条件をskipしても、C内の検証skipを成功にしない。
- [ ] **Step 6: foundationでAの固定SHA、B/Cの同一SHA入力、mainへの限定なし、Pagesを呼ばないこと、artifact保存、各条件の実行対象を検証する。** branch名・不正SHAの拒否も検証する。metadataとファイル集合を確認し、runnerテスト/typecheck/productを再実行。未解決のworkflowはdefault branch登録/利用可能なrefを確認してからdispatchする（未承認のmain mergeは行わない）。
- [ ] **Step 7: このtaskの変更をコミットする。** Message: `ci: record regression timings and benchmark fixed refs`。

### Task 4: 重い6ファイルのプロファイルと再計算削減の判断

**Files:** Create `docs/project/evidence/ci-performance/2026-10-10/profile.md`; 評価実装は下記判定で必要な場合のみ変更。

**Interfaces:** Task 3のJSON/metadataと既存正式runnerのcandidate/fold elapsed値を使用。追加CPU profileはVitest forksへ `--execArgv=--cpu-prof` と出力directory指定を渡し、通常性能比較とは別runにする。

- [ ] **Step 1: baseline checkoutを読み取り専用の測定対象として用意する。** 既存linked worktreeは維持し、追加worktreeが必要なら実行時にusing-git-worktreesを適用。baselineのtracked評価コードを変更後コードへ置換しない。
- [ ] **Step 2: 6ファイルを1ファイルずつ直列にプロファイルする。** 各時間と、candidate/samples/入力生成/calibration/folds/grid/resample/browser転送/証拠書込みの内訳を記録する。CPU profileだけでbrowser待ち時間を説明しない。不足区間は計測だけのpatchを保存してA/B両方へ対応させ、hashと差分を記録。比較本番runはprofileなしで行う。
- [ ] **Step 3: 安全な再計算削減の可否をprofile.mdで決定する。** 評価呼出し内の不変入力生成/読込み再利用のみ候補。独立folds/formalの統合、認識結果cache、UX反復削減、productionアルゴリズム変更は対象外。候補なしの場合は見送り理由と残す検証を記録してStep 6へ進む。
- [ ] **Step 4: 候補がある場合、計測で特定した関数の契約を維持する回帰テストを先に追加し、失敗を確認する。** 同一評価内の取得回数減少、別呼出しは再取得、engine/fixture/hashが異なる入力の非共有、入力mutation検知をassert。既存holdout漏洩とpublic/diagnostic/geometry/hashの検証は削除しない。
- [ ] **Step 5: 特定箇所だけを実装し、その回帰テストと対応する重いファイルを実行する。** 対象ファイル・関数・変更理由と数値をprofile.mdへ追記。共有結果の使い回しで独立実評価を省略していないことをdiffで確認する。
- [ ] **Step 6: profile.mdと必要な限定変更をコミットする。** Message: `perf: document recognition profile and reduce verified recomputation`（削減なしなら `docs: record recognition evaluation profile`）。追加設計が必要ならここで設計更新レビューへ戻る。

### Task 5: 比較集計、失敗検知、完了判定

**Files:** Create `scripts/ci/benchmark-report.ts`, `test/ci/benchmark-report.test.ts`, `docs/project/evidence/ci-performance/2026-10-10/comparison.md`。

**Interfaces:** `summarizeRuns(runs: readonly BenchmarkRun[]): BenchmarkComparison`。`BenchmarkRun` はcondition A/B/C、runId、controlSha/targetSha、結論、作成/最初job開始/集約終了UTC、全jobsの開始/終了/step時刻、file durations/集合、RSSとscope、欠落artifactと再実行の記録を持つ。`BenchmarkComparison` は条件別中央値/範囲、A→B/B→C/A→C短縮率、runner分数、失敗/欠落、比較可否を持つ。CLIは `--run-ids` と `--output` を受け、既存認証の `gh api` でActions jobs/artifactsを読む。秘密情報をreportへ出さない。

- [ ] **Step 1: 既知時刻で集計テストを追加する。** queueとwall timeの分離、並列job時間のsumとcritical pathの相違、A→C短縮率、各条件3件未満、SHA混在、テスト集合差、失敗/timeout/再実行/JSON欠落をassert。異常runを黙って除外せず、比較不可の理由を返す。
- [ ] **Step 2: 集計テストの失敗を確認し、関数/CLIを実装して成功を確認する。** API paginationを扱い、全job（集約含む）の総秒数/60をrunner分数とする。ファイル時間はVitest JSONの意味を確認して変換し、elapsedとassertion時間を混同しない。
- [ ] **Step 3: `npm run typecheck && npm run build && npm test` を実行する。** Task 2/3のproduct実行に加え、残り4グループを直列に個別実行し、完全suiteとの集合/成否一致を記録。既に確認済みのチェックは新変更に影響がない限り無目的に反復しない。
- [ ] **Step 4: 測定対象の変更後実装を署名コミットし、完全SHAを固定する。** baselineとの差分が設計の許容範囲内か確認し、テスト追加/構成検証の変更を一覧化。benchmark用の制御workflow refも記録する。
- [ ] **Step 5: Actionsで故意の失敗を検知する。** 一時refに1グループだけ失敗するテストを置き、regression/qualityが失敗し他グループが実行されることを確認。取消runもquality成功にならないことを確認。一時変更を本実装へ混ぜない。workflow起動前にpush/dispatchの既存承認範囲を確認し、未承認なら具体的refと測定runを提示して承認を得る。
- [ ] **Step 6: A→B→Cを3組、並走させず実行する。** 同じNode/lock/Chromium/runner/action版。全run IDと失敗も記録。baselineへ変更後評価コードが入っていないdiffを保存。artifact保存に失敗した条件はその事実を残し、必要な再測定は理由付きで追加する。
- [ ] **Step 7: 集計CLIでcomparison.mdを生成しレビューする。** queue、wall time、総runner分数、重い6ファイル、memory scope、timeout/flaky、検証集合差を記録。A→B/B→C/A→Cと歴史的12分35秒の両方を示す。再計算削減なしならA/Bの評価実装が同一であることを明示。短縮率未達ならIssueを完了扱いにせず、再分割の候補を測定値から判断する。
- [ ] **Step 8: 報告と集計ツールをコミットする。** Message: `docs: record CI performance comparison and failure checks`。実装レビューで設計/Issueの全条件を照合し、未測定条件を残して成功を主張しない。

## 計画レビューと実行方法

共有manifest、workflow、記録、比較が順に依存するため、このセッションでのNative実行を推奨する。計画レビューと実行方法の選択後に実装を開始する。実装のレビューや委譲は、選択された方式と適用skillに従う。
