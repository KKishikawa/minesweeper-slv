# Test Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** テストが掲げる検証と実際の検証を一致させ、応答fixture、再現性、乱数被覆、非同期検証を改善する。

**Architecture:** 製品コードを変更せず、既存のテストとブラウザfixtureを修正する。小さな応答契約修正を1タスクにまとめ、認識生成・solverの生成ケース・ブラウザの応答順制御はそれぞれ独立に実装・レビューする。

**Tech Stack:** TypeScript、Vitest、Playwright Chromium、既存のNode.js/npm環境。

**Spec:** この会話で承認された修正方針。下記の「合意した設計」に全文を保存する。

## 合意した設計

- `test/repository-foundation.test.ts` を削除する（前ターンで削除済み）。過去の証拠文書とbenchmarkの過去比較用参照は履歴として維持する。
- 不正応答と `messageerror` を別テストにし、後者で実際にハンドラーを呼ぶ。
- `solved` と `guess-required` のfixtureを分け、推測は `safe/mines: []`、`guesses: [0, 1]`、`primaryGuess: 0` とする。
- prototype bankは拒否時にも独立に2回生成し、時間・出力先を除いた結果を比較する。
- 3×3ケースは固定seedを維持し、乱数の下位ビットへの依存を解消する。
- 古い応答をテストから明示的に送信し、500ms待機を置き換える。

## Global Constraints

- 製品コード（`src/`）、認識アルゴリズム、採用閾値、画像fixtureと正解データ、依存関係は変更しない。
- 独立oracleとの比較、既存の拒否条件、画像hashとケース別の検証を維持する。
- テスト数を減らす目的のskip、条件緩和、曖昧な例外捕捉を追加しない。
- 既存Git署名設定を尊重する。署名失敗時は無署名で再試行せず、設定を変更せず報告する。
- 同じ作業ツリーで実装者は逐次実行し、サブエージェントは追加のエージェントを起動しない。
- 実装者は担当ファイルの検証とself-reviewを行い、全体検証は全タスク統合後にコーディネーターが1回行う。

## Review Focus

- Workerのmessageerror後にタイマーが残り、後からtimeoutの二重通知を出さないこと（Task 1）。
- 履歴復元がphaseだけでなく推測候補・primaryGuessを保つこと（Task 1）。
- 2回目だけ成功・別例外・異なる拒否結果になった場合、再現性テストが失敗すること（Task 2）。
- ケース生成の偏りが戻った場合、明示的な被覆検証が失敗すること（Task 3）。
- 古い応答を実際に送る前にテストが通ってしまわないこと（Task 4）。

---

### Task 1: Worker応答と履歴fixtureの契約

**Files:** Modify `test/app/solver-client.test.ts`, `test/app/state.test.ts`.

**Interfaces:** 既存の `createSolverClient`、fakeWorker、`transition` を利用し、製品APIは変更しない。

- [ ] 不正応答の既存テストを適切に改名し、独立したmessageerrorケースを追加する。fake timersで `onmessageerror` を呼び、現request/revisionのerror通知1件、Worker終了、タイムアウト経過と追加イベント後にも通知1件を検証する。クライアントをdisposeしタイマーを片付ける。
- [ ] `npm test -- test/app/solver-client.test.ts` を実行し、messageerror処理を一時的に無効化した場合に新規テストが失敗することを確認する。一時変更は必ず戻し、製品コードをdiffに残さない。
- [ ] `solveState` のstatusに応じた応答fixtureを作り、guess-requiredの復元assertionをproposal全体 `safe: [], mines: [], guesses: [0, 1], primaryGuess: 0` に更新する。テスト対象のtransitionを期待値生成に使わない。
- [ ] `npm test -- test/app/solver-client.test.ts test/app/state.test.ts` を実行し全件成功を確認する。
- [ ] 担当diffをself-reviewし、担当2ファイルだけcommitして、コマンド・結果・mutation確認をreportへ記録する。

### Task 2: 拒否されたprototype bankの再現性

**Files:** Modify `test/recognition/generated-bank.test.ts`.

**Interfaces:** `generatePrototypeBank({ outputPath })` と `NoPassingThresholdError.candidate: FinalBankCandidate` を利用する。

- [ ] 成功・既知の拒否だけを明確に区別する生成結果helperをテスト内に作る。予期しない例外はそのままthrowする。異なる出力先で必ず2回独立に `generatePrototypeBank` を呼ぶ。
- [ ] 拒否時は両方のerror型・name/message・candidateを比較する。candidate比較では `evaluationCases[].elapsedMs` だけを除外し、geometry、calibration、thresholds、bank、Chromium version、derivativeの画像hash・寸法・version、cellsを保持する。出力先はcandidateに含まれない。元の238閾値、16ケース、未検出ケース、480セル、出力未生成のassertionを維持する。
- [ ] 成功時は既存のserialized bankと出力モジュールの同一性・codec round-tripを維持し、成功/拒否の混在を失敗として扱う。
- [ ] 最小の比較helper検証で時間差は許容し、画像hashまたはケース別結果の差は比較失敗することを確認する。再現性本体は実生成を使う。
- [ ] `npm test -- test/recognition/generated-bank.test.ts` を実行する。既存180秒で不足が実測された場合だけ、2回分に根拠のある上限へ調整し結果をreportする。
- [ ] 担当diffをself-reviewし、担当ファイルだけcommitして、コマンド・結果・所要時間をreportへ記録する。

### Task 3: 3×3 solverケース生成の被覆

**Files:** Modify `test/solver/solve.test.ts`.

**Interfaces:** `oracle(board)` は既存の独立総当たり実装をそのまま使う。生成ケースは3×3、400試行、seed 823を維持する。

- [ ] 観測modeの9セル分の組み合わせを収集し、400試行で100種類以上、各セル位置で4modeすべてを検証する。固定seedの具体的な全出力一覧は固定しない。
- [ ] 既存LCGの `random() % 4` のままでは被覆assertionが失敗することを確認する。
- [ ] 固定seedの決定論的な乱数生成で上位ビットを利用し、mask/mode/誤った総地雷数を生成する。可読性を保つ最小のテスト内helperに留める。
- [ ] すべての生成盤面を既存oracleと比較し、失敗メッセージにseed・trialを含める。solved、guess-required、inconsistentの各状態が生成されることも確認する。
- [ ] `npm test -- test/solver/solve.test.ts` を実行し全件成功を確認する。
- [ ] 担当diffをself-reviewし、担当ファイルだけcommitして、RED/GREENと被覆数をreportへ記録する。

### Task 4: 古いWorker応答を決定論的に送るブラウザfixture

**Files:** Modify `test/browser/app.fixture.ts`, `test/browser/mvp.test.ts`.

**Interfaces:** 新規fixture mode `controlled-late` と、root上の `release-stale-solver-results` イベントを使う。既存 `late` modeはdiagnostic-failuresでも使用するため維持する。

- [ ] `mvp.test.ts` の古い応答ケースを `controlled-late` へ移す。初期盤面と次のall-safe盤面の応答を保持し、新しいtied-guess応答だけを直ちに返す契約にする。
- [ ] fixture未対応時に新しいテストが失敗することを確認する。500ms待機は削除し、送信前にtied-guess表示と古い応答送信数0を確認する。
- [ ] fixtureで初期盤面とall-safe盤面の応答をイベント発火まで保持する。イベントで古い応答を確実に送信し、rootの `data-stale-solver-results-sent` に送信数を公開する。terminateは古いイベントを消さない既存のテスト用動作を保つ。
- [ ] rootのイベントをdispatchした後、送信数2を確認してからstatusと推測提案が維持され、all-safe提案が出ないことを確認する。setTimeoutによる古い応答待機に依存しない。
- [ ] `npm test -- test/browser/mvp.test.ts test/browser/diagnostic-failures.test.ts test/browser/history.test.ts test/browser/input-stability.test.ts` を実行し、共有fixtureの既存modeに影響がないことを確認する。
- [ ] 担当diffをself-reviewし、担当2ファイルだけcommitして、RED/GREENとコマンド・結果をreportへ記録する。

## 統合・完了条件

- [ ] 各タスクの仕様適合・品質レビューを通過させる。指摘の修正は担当実装者に戻し、修正diffを再レビューする。
- [ ] `npm run typecheck && npm run build && npm test` を実行し、通常テスト全体が成功することを確認する。意図的な子プロセス失敗ログと親suiteの結果を区別する。
- [ ] `git diff --check` と変更範囲を確認し、全ブランチレビューを行う。
- [ ] 計画のcheckboxを更新し、最終結果を記録・commitする。merge/pushは行わず、作業ブランチに結果を残す。
