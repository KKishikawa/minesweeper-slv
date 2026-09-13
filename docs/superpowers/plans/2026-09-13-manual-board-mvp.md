# 手動盤面入力型MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue #9として、画像認識を必要としない手動盤面作成からローカルsolver提案までを、#10 → (#11, #14) → #15 → #16の独立した検証単位に分解する。

**Architecture:** Vanilla TypeScriptの観測盤面を唯一の入力とし、純粋なvalidationとWorker内solverを通して別状態の提案を得る。UIは観測を書き換える操作だけを発行し、アプリ状態管理がrevision、再検討、古い応答の破棄を統括する。認識コードを製品入口からimportしない。

**Tech Stack:** TypeScript、Vite、Canvas 2D、Web Worker、Vitest、Playwright、BigInt。

**Spec:** [現行製品定義](https://github.com/KKishikawa/minesweeper-slv/blob/bfb08cd/docs/project/product.md)、[ロードマップ](https://github.com/KKishikawa/minesweeper-slv/blob/bfb08cd/docs/project/roadmap.md)、ADR 0001・0005・0007・0008。同じファイルのmain上の最新変更があれば実装前に差分を確認する。

**状態:** 2026-09-13にユーザー承認を得た実装計画。製品実装、Issue完了、リリース承認を表すものではない。同日にorigin/main `bfb08cd`とGitHub Issue #9・#10・#11・#14・#15・#16を照合した。初稿作成時のローカルHEADは`55472ad`だったため、反映用ブランチは最新main `bfb08cd`から作成した。実装も最新mainから開始する。

## Global Constraints

- 入力、検証、solverの実行は完全にローカルで行います。
- 盤面の観測値とsolverの提案は独立した状態として保持し、solver結果で利用者の入力盤面を上書きしません。
- 盤面を更新するたびにrevisionを進め、更新前に開始した非同期のsolver結果は破棄します。
- 最初のMVPには、画像アップロード、クリップボード、ドラッグ＆ドロップ、画面キャプチャ、セル認識、自動クリック、バックエンド、数値による確率表示を含めません。
- 対象はデスクトップWindowsとし、最新Chromeを主要ブラウザ、Edgeを同等の動作を想定するブラウザとします。
- 盤面セルは常に正方形とし、Canvas内にはスクロールを設けません。
- 盤面の横に情報欄を置いてもセルを24 CSS px以上に保てる場合は右サイドバーを使い、保てない場合は情報欄を盤面の下へ移します。
- 確認対象は1920×1080、1280×800、FHDのハーフ幅相当です。
- Node.jsは`.node-version`の22.12.0をCI基準とする。既存lockfileとChromiumの組合せを使う。新しいUIフレームワークを導入しない。
- 既存recognition回帰テストと不採用spike evidenceの分離を維持する。署名設定を無効にしてコミットを通さない。

## 方針と実装上の選択

1. **採用:** DOMのフォームと操作ボタン、Canvasの盤面、DOMのアクセシブルなセル表現を組み合わせる。入力と描画を分離でき、現行Vite/TypeScript資産を利用できる。
2. **比較:** Canvasのみではセルの意味とキーボード経路を別途補う必要がある。フレームワーク導入はこのMVPのための依存・状態管理移行を増やすため採用しない。

以降の数値は既存製品仕様の引用ではなく、本計画の実装提案である。盤面は幅・高さ1〜30、総地雷数0〜セル数の整数を受け付ける。30列は960px幅で24pxセルと左右余白を確保できる範囲とする。標準は9×9・10地雷。探索上限は200,000探索ノード、Worker応答監視は5秒とする。上限超過時には部分的な確定手も返さない。出荷条件を満たすかは#16で測定し、変更時は理由を記録する。

## ファイル責務と公開境界

| Issue / 単位 | 作成・変更するファイル | 責務 |
| --- | --- | --- |
| #10 / 1 | `src/board/types.ts`, `src/board/board.ts`, `test/board/board.test.ts` | DOM非依存の観測と編集 |
| #10 / 2 | `src/board/validate.ts`, `test/board/validate.test.ts` | 不確実、寸法、局所・総数矛盾 |
| #10 / 3 | `src/solver/types.ts`, `src/workers/protocol.ts`, `src/app/state.ts`, `src/app/solver-client.ts`, `test/app/state.test.ts`, `test/app/solver-client.test.ts` | メッセージ、revision、応答受付、タイムアウト |
| #10 / 3 | `index.html`, `src/main.ts`, `src/app/app.ts`, `src/app/style.css`, `test/browser/smoke.test.ts`; 変更 `package.json` | 起動、エラー表示、buildとsmoke |
| #11 / 4 | `src/solver/constraints.ts`, `test/solver/constraints.test.ts` | 基本規則・集合差分・成分分割 |
| #11 / 5 | `src/solver/enumerate.ts`, `src/solver/combine.ts`, `src/solver/solve.ts`, `test/solver/oracle.ts`, `test/solver/solve.test.ts` | 枝刈り列挙、BigInt統合、候補選択 |
| #11 / 6 | `src/workers/solver.worker.ts`, `test/browser/solver-worker.test.ts`; 変更 `src/app/solver-client.ts` | 実Worker、再検討の接続 |
| #14 / 7 | `src/ui/board-renderer.ts`, `src/ui/board-editor.ts`, `src/ui/board-settings.ts`, `test/ui/geometry.test.ts`, `test/browser/board-editor.test.ts` | 設定、描画、編集、フォーカス |
| #15 / 8 | `src/ui/status.ts`, `src/ui/layout.ts`, `test/browser/mvp.test.ts`; 変更 `src/app/app.ts`, `src/app/style.css` | 状態統合、日本語UI、レスポンシブ |
| #16 / 9 | `test/browser/release.test.ts`, `docs/project/manual-mvp-release.md`; 変更 `.github/workflows/ci.yml`, `package.json`, `README.md` | production検証、品質証跡、公開手順 |

テストは既存のVitestからPlaywrightライブラリを呼ぶ`*.test.ts`に統一する。`@playwright/test`を前提にしない。ブラウザテストはViteの`createServer`または`preview`で127.0.0.1の空きポートを使い、`afterAll`でbrowserとserverを終了する共通ヘルパー`test/browser/harness.ts`を単位3で作成する。既存の`vitest.config.ts`のincludeを利用する。

### 型契約（単位1〜3で確定）

```ts
// src/board/types.ts
export type CellValue = 'closed' | 'flag' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface BoardCell {
  readonly value: CellValue;
  readonly source: 'manual' | 'recognition';
  readonly uncertain: boolean;
}
export interface BoardSnapshot {
  readonly width: number;
  readonly height: number;
  readonly totalMines: number;
  readonly revision: number;
  readonly cells: readonly BoardCell[]; // row-major: y * width + x
}
export type FlagPolicy = 'trusted' | 'reconsidered';
export type ValidationResult =
  | { status: 'valid' }
  | { status: 'needs-review'; reason: 'uncertain' | 'dimensions'; cells: number[] }
  | { status: 'inconsistent'; reason: 'settings' | 'local' | 'total'; cells: number[] };
// board.ts
// createBoard(width, height, totalMines, revision): BoardSnapshot
// editCell(board, index, value): BoardSnapshot
// validate.ts
// validateBoard(board, policy): ValidationResult
```

`createBoard`は範囲外設定にRangeError。全セルをmanual/closed/uncertain=falseにする。`editCell`は指定セルだけmanual/uncertain=falseに変え、元データを変更せずrevision+1を返す。不正indexはRangeError。同値編集もrevisionを進める。リセット・盤面再作成は現在revision+1を渡し、0への巻き戻しをしない。

validationはまず幅・高さが有効な整数かを検査し、違反はsettingsとする。有効な寸法に対して`cells.length`不一致をdimensions、次に不確実セルをuncertainとして返す。その後、総地雷数の設定範囲、局所制約、総数制約の順に評価する。複数理由が同時に存在してもこの順の最初の理由だけを返す。settings・dimensions・totalの`cells`は空配列、uncertainは該当セル、localは制約に違反した数字セルの有効なindexを昇順・重複なしで返す。盤面全体のエラーはセルを一律着色せず状態欄で表示する。

```ts
// src/solver/types.ts (BoardSnapshot, FlagPolicyはboard/typesからimport)
export interface SolverProposal {
  safe: number[];
  mines: number[];
  guesses: number[];
  primaryGuess: number | null;
}
export type SolveResult =
  | { status: 'solved' | 'guess-required'; proposal: SolverProposal }
  | { status: 'inconsistent' }
  | { status: 'limit-reached' };
export interface SolveOptions { maxNodes: number }
// solve(board: BoardSnapshot, policy: FlagPolicy, options: SolveOptions): SolveResult
// protocol.ts
export type SolverRequest = {
  kind: 'solve'; requestId: number; revision: number;
  board: BoardSnapshot; policy: FlagPolicy; options: SolveOptions;
};
export type SolverResponse =
  | { kind: 'result'; requestId: number; revision: number; result: SolveResult }
  | { kind: 'error'; requestId: number; revision: number; message: string };
```

`solved`は確定手がある、または未確定セルがない状態。`guess-required`は成立配置が存在し確定手がない状態。safe/mines/guessesは重複なしの昇順、primaryGuessは同率guessesの最小index。確定手があればguessesは空、primaryGuessはnull。trustedで入力旗だったセルは提案対象にしない。reconsideredでは入力旗も候補に含める。矛盾・上限・errorには提案フィールドを持たせない。

認識用は予約型だけを`protocol.ts`に置く。`RecognitionRequest = { kind: 'recognize'; requestId: number; revision: number; width: number; height: number; rgba: Uint8ClampedArray }`、`RecognitionResponse = { kind: 'recognized'; requestId: number; revision: number; board: BoardSnapshot | null } | { kind: 'recognition-error'; requestId: number; revision: number; message: string }`。MVPはこれらを送受信せず、認識Workerも生成しない。#13で採用済み認識器の境界と照合してから利用する。

### 状態と非同期契約

`src/app/state.ts`に以下を置く。

```ts
export type Phase = 'editing' | 'needs-review' | 'inconsistent' | 'solving'
  | 'solved' | 'guess-required' | 'limit-reached' | 'error';
// BoardSnapshot / FlagPolicy / ValidationResult / SolverProposalは上記からimport
export interface AppState {
  board: BoardSnapshot;
  policy: FlagPolicy;
  autoReconsider: boolean;
  phase: Phase;
  validation: ValidationResult;
  proposal: SolverProposal | null;
  activeRequestId: number | null;
  nextRequestId: number;
  effectivePolicy: FlagPolicy;
  message: string | null;
}
export type AppAction =
  | { type: 'board-changed'; board: BoardSnapshot }
  | { type: 'settings-changed'; policy: FlagPolicy; autoReconsider: boolean }
  | { type: 'solve' }
  | { type: 'response'; response: SolverResponse };
export type AppEffect = { type: 'cancel' } | { type: 'run'; request: SolverRequest };
export interface Transition { state: AppState; effects: AppEffect[] }
// createAppState(board: BoardSnapshot): AppState
// transition(state: AppState, action: AppAction): Transition
// acceptsResponse(state: AppState, response: SolverResponse): boolean
```

`createAppState`は既定trusted/autoReconsider=false、activeRequestId=null、nextRequestId=1、proposal=null、effectivePolicy=trustedで検証結果に対応するediting/needs-review/inconsistentを返す（副作用なし）。`transition`が次の遷移表を実装し、effectsを配列順でappが実行する。board-changedは現revisionより大きい盤面だけを受け付け、同じか古いrevisionはstateをそのまま返しeffectsを空にする。settings-changedは観測値を保ってrevisionを増やす。各runはnextRequestIdを使い、その後1増加させる。solveは選択policyから再検証し、既存実行をcancelして再実行する。自動再検討中はeffectivePolicyがreconsideredなので再びfallbackしない。古いresponseはstateをそのまま返しeffectsを空にする。maxNodesはrun生成時に200,000を設定する。

| イベント | 遷移と副作用 |
| --- | --- |
| 編集・リセット・新盤面 | revision増加、提案と実行IDをクリア、実行Workerをterminate、再検証。validなら新しい解析を開始 |
| policy・自動再検討変更 | 観測値を保ってrevision+1、同じ無効化・再検証経路 |
| uncertain・寸法不一致 | needs-review。solverを起動しない |
| 局所・総数矛盾 | inconsistent。trustedかつautoReconsiderならreconsideredで一度だけ再検証 |
| 検証成功 | solving。単調増加requestId、現revision、effectivePolicyをrequestに記録 |
| 応答 | revisionとactiveRequestIdの両方が一致する場合のみ受付。エラー応答も同じ規則 |
| trustedの全体矛盾 | autoReconsiderなら同revision・新requestIdでreconsideredを一度だけ実行。それ以外はinconsistent |
| limit-reached | 提案なし。自動再検討しない |
| Worker error / messageerror | error、提案消去、Worker終了。再実行ボタンを提供 |
| 5秒応答なし | Worker終了、limit-reached。タイマーもrequestId/revision一致時だけ有効 |

`src/app/solver-client.ts`は次の型を公開する。

```ts
export interface SolverWorkerPort {
  postMessage(request: SolverRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}
export interface SolverClientOptions {
  workerFactory: () => SolverWorkerPort;
  timeoutMs?: number; // 既定5,000、正の有限値のみ
}
// createSolverClient(onResponse: (response: SolverResponse) => void,
//   options: SolverClientOptions):
//   { run(request: SolverRequest): void; cancel(): void; dispose(): void }
```

新requestで前Workerと監視タイマーを終了する。factoryまたはpostMessageの例外、error、messageerror、不正な応答形状は現requestのID/revisionを付けたkind:errorに変換する。timeoutは同ID/revisionのkind:result・limit-reachedへ変換する。応答済み・cancel済み・dispose済みWorkerのイベントは通知しない。有効な応答であっても現requestとID/revisionが違う場合は無視し、監視タイマーを止めない。端末応答を通知する前にタイマーとWorkerを終了する。dispose後のrunはErrorをthrowする。

#10の画面は起動確認だけでclientを呼ばず、状態遷移とclientを独立して単体検証する。未実装solverを成功扱いするスタブを製品へ入れない。#11でfactoryに`new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })`を渡し実Workerテストを行う。#15で画面操作とeffectsの実行を接続する。

## 実装手順

各単位のRED→GREEN→レビュー→署名付きコミットを完了してから次へ進む。REDは依存未導入・構文エラーではなく、対象機能の欠如または期待動作の不一致を確認する。テスト例のimportは対応するFiles欄の公開境界から行う。

### 単位1 / #10: 観測盤面

**Files:** ファイル表の単位1。**Consumes:** なし。**Produces:** BoardSnapshot、createBoard、editCell。

- [ ] 次を`test/board/board.test.ts`に書く。

```ts
it('手動編集は観測を複製してrevisionを進める', () => {
  const before = createBoard(3, 1, 1, 4);
  const after = editCell(before, 1, 1);
  expect(before.cells[1]?.value).toBe('closed');
  expect(after.revision).toBe(5);
  expect(after.cells[1]).toEqual({ value: 1, source: 'manual', uncertain: false });
});
```

- [ ] `npm test -- test/board/board.test.ts`でREDを確認。
- [ ] 型契約どおりに実装。0、1、8、flag、closedの編集、最大・最小寸法、非整数、NaN、負数、総地雷数超過、不正index、リセットrevisionのテストを追加。
- [ ] 同コマンドと`npm run typecheck`でGREEN。レビューは不変性、index範囲、提案との非結合を確認。
- [ ] この単位のファイルだけをstageし`git commit -m "feat: add manual board model"`。

### 単位2 / #10: 事前検証

**Files:** 単位2。**Consumes:** BoardSnapshot、FlagPolicy。**Produces:** validateBoard。

- [ ] 以下をテストし`npm test -- test/board/validate.test.ts`でRED。

```ts
it('隣接0への旗はtrustedだけ矛盾する', () => {
  let board = createBoard(3, 1, 1, 0);
  board = editCell(editCell(board, 0, 0), 1, 'flag');
  expect(validateBoard(board, 'trusted').status).toBe('inconsistent');
  expect(validateBoard(board, 'reconsidered').status).toBe('valid');
});
```

- [ ] 設定範囲、cells.lengthと寸法、uncertainを検査。次に各数字について`残必要地雷 = 数字 - trusted隣接旗数`が0〜隣接候補数か、盤面全体の`総地雷数 - trusted旗数`が0〜候補総数かを検証する。reconsideredでは旗を候補に数える。0も数字制約に含める。
- [ ] needs-reviewと矛盾を別々にテスト。複数の違反セルは昇順・重複なしで返す。uncertainと寸法不一致では数値制約を解かない。
- [ ] GREENと型検査。レビューは局所validが全体成立の保証ではない点、探索上限をvalidationへ偽装しない点を確認。
- [ ] `git commit -m "feat: validate manual board observations"`（単位2だけをstage）。

### 単位3 / #10: 起動とWorker境界

**Files:** 単位3と`test/browser/harness.ts`。**Consumes:** 単位1・2。**Produces:** 型契約、AppState、solver-client、起動可能な画面。

- [ ] 応答破棄テストを作り`npm test -- test/app`でRED。

```ts
it('同revisionでも古いrequestを受け付けない', () => {
  const state: AppState = {
    board: createBoard(2, 1, 1, 3), policy: 'trusted', autoReconsider: false,
    phase: 'solving', validation: { status: 'valid' }, proposal: null,
    activeRequestId: 9, nextRequestId: 10, effectivePolicy: 'trusted', message: null,
  };
  expect(acceptsResponse(state, {
    kind: 'result', requestId: 8, revision: 3, result: { status: 'inconsistent' },
  })).toBe(false);
});
```

- [ ] state関数とclientを上記遷移表どおりに実装。偽WorkerとVitest fake timersで古い成功・error・タイマー、cancel、dispose、連続編集、policy変更を検証。
- [ ] package.jsonに`dev: vite --host 127.0.0.1`、`build: vite build`、`preview: vite preview --host 127.0.0.1`を追加。index.htmlは`lang="ja"`と`src/main.ts`のmodule scriptを持つ。appは「マインスイーパー ソルバー」の見出しを表示し、例外時は日本語エラーをDOMへ出す。
- [ ] smokeで`await page.goto(baseUrl)`、`expect(await page.locator('h1').textContent()).toBe('マインスイーパー ソルバー')`、pageerrorが空であることを確認。
- [ ] `npm test -- test/app test/browser/smoke.test.ts`、`npm run typecheck`、`npm run build`がGREEN。レビューは未接続solverから架空の提案が出ないこと。
- [ ] `git commit -m "feat: establish app and revision-safe worker boundary"`。#10完了後に#11と#14を開始可能とする。

### 単位4 / #11: 制約と連結成分

**Files:** 単位4。**Consumes:** validな盤面、policy。**Produces:** `Constraint = { cells: number[]; mines: number }`、`buildConstraints(board, policy): Constraint[]`、`reduceConstraints(input: Constraint[]): { constraints: Constraint[]; safe: number[]; mines: number[]; inconsistent: boolean }`、`splitComponents(input: Constraint[]): Constraint[][]`。

- [ ] `npm test -- test/solver/constraints.test.ts`で次のREDを確認。

```ts
it('包含制約の差分から安全セルを得る', () => {
  const result = reduceConstraints([
    { cells: [0, 1], mines: 1 }, { cells: [0, 1, 2], mines: 1 },
  ]);
  expect(result.safe).toContain(2);
  expect(result.inconsistent).toBe(false);
});
```

- [ ] 隣接8方向から制約を作る。0地雷なら全安全、候補数=地雷数なら全地雷、包含集合は差分を追加。代入後に再簡約し固定点まで繰り返す。空集合の非0地雷、残数負・超過、同集合の異なる残数を矛盾とする。
- [ ] 共有候補セルで制約グラフを連結成分へ分割。交差するが包含しない制約、端と角、別成分、重複制約をテストする。
- [ ] GREENと型検査。レビューは簡約時に必要な地雷数や候補を失わないこと。
- [ ] `git commit -m "feat: derive and partition mine constraints"`。

### 単位5 / #11: 列挙・全体統合・oracle

**Files:** 単位5。**Consumes:** 単位4。**Produces:** solve、SolveResult。内部公開は`enumerateComponent(constraints: Constraint[], budget: { visited: number; maxNodes: number }): { ways: Map<number, bigint>; mineWays: Map<number, Map<number, bigint>>; limited: boolean }`、`choose(n: number, k: number): bigint`。mineWaysはcell index→成分地雷数→配置数。

- [ ] 次を作り`npm test -- test/solver/solve.test.ts`でRED。

```ts
it('同率候補を決定論的に選ぶ', () => {
  expect(solve(createBoard(2, 1, 1, 0), 'trusted', { maxNodes: 200_000 }))
    .toEqual({ status: 'guess-required', proposal: {
      safe: [], mines: [], guesses: [0, 1], primaryGuess: 0,
    } });
});
it('全体地雷数から確定安全を返す', () => {
  const result = solve(createBoard(2, 1, 0, 0), 'trusted', { maxNodes: 200_000 });
  expect(result.status).toBe('solved');
  if (result.status === 'solved') expect(result.proposal.safe).toEqual([0, 1]);
});
```

- [ ] 成分ごとに0/1を列挙し、各制約で割当済み地雷数が超過、または未割当を全地雷にしても不足なら枝刈り。budgetは全成分で共有し、各探索ノードで増加させる。
- [ ] 成分のwaysを地雷数別に畳み込み、制約なしUセルには`choose(U, remaining)`を掛ける。特定の制約なしセルの地雷配置数は`choose(U - 1, remaining - 1)`。chooseはk<0またはk>nで0n。簡約確定地雷とtrusted旗を総数から引く。
- [ ] 成立配置総数0nはinconsistent。各候補の地雷配置数0nはsafe、総数と同じならmines。確定手がなければBigInt交差積で最小地雷率を比較し同率を全て返す。上限に達したら全ての部分結果を捨てる。
- [ ] oracle.tsではsolverの制約・簡約・組合せ関数を使わず、最大3×3の全ビット配置から数字・policy・総数を直接判定する。全2×2観測パターンと固定seedの3×3ケースで成立有無、全候補の確定性と同率候補を比較する。数値確率をUIへ出さない。
- [ ] テストに独立成分+制約なし領域、局所validな全体矛盾、trusted/reconsidered、全セル開示、全地雷、maxNodes=0、巨大BigIntのchooseを含める。全体矛盾の具体例は3×1・中央1・両端closed・総地雷2（局所valid、全体配置なし）。
- [ ] `npm test -- test/solver`と型検査がGREEN。レビューは総配置の重み付け、探索打切りと矛盾の分離、oracleの独立性。
- [ ] `git commit -m "feat: solve boards with exact global model counts"`。

### 単位6 / #11: Workerと旗の再検討

**Files:** 単位6と`test/app/solver-client.test.ts`。**Consumes:** solve、protocol、AppState。**Produces:** UIから利用できる実solver経路。

- [ ] 実Workerへの2×1・1地雷requestがguess-requiredを返すテストを追加。`npm test -- test/browser/solver-worker.test.ts`でRED。
- [ ] solver.worker.tsはrequestを検査し、validateBoardがvalidの場合だけsolveを呼ぶ。例外はkind:errorへ変換し、requestIdとrevisionを保持。invalidな外部メッセージは実行しない。
- [ ] 実Workerとtransitionの統合テストを追加し、遷移表の再検討経路を検証する。画面への接続は単位8で行う。3×1・左0・中央flag・総数1ではtrustedの局所矛盾からreconsideredで中央safe/右minesに到達。autoReconsider=falseなら矛盾のまま。全体矛盾、needs-review、limit-reached、errorについても再試行の有無を検証する。
- [ ] trustedで成立する誤旗は検出できない旨を状態説明に残す。自動再検討で入力旗を消さずeffectivePolicyだけを変える。
- [ ] `npm test -- test/app test/solver test/browser/solver-worker.test.ts`、型検査、build。レビューは再試行が一度で止まること、古いrequestによる再試行が起きないこと。
- [ ] `git commit -m "feat: run solver in worker with flag reconsideration"`。

### 単位7 / #14: 設定・描画・手動編集

**Files:** 単位7。**Consumes:** BoardSnapshot、SolverProposal、ValidationResult。**Produces:** `renderBoard(ctx: CanvasRenderingContext2D, board: BoardSnapshot, proposal: SolverProposal | null, validation: ValidationResult, selected: number, cellSize: number): void`、`hitTest(x: number, y: number, cellSize: number, width: number, height: number): number | null`、`mountBoardEditor(root: HTMLElement, onEdit: (index: number, value: CellValue) => void, onReset: () => void): { update(board: BoardSnapshot, proposal: SolverProposal | null, validation: ValidationResult): void; dispose(): void }`、`mountBoardSettings(root: HTMLElement, onCreate: (width: number, height: number, totalMines: number) => void): { dispose(): void }`。

- [ ] `expect(hitTest(24, 0, 24, 2, 1)).toBe(1)`と右端48pxでnullのテストを追加し`npm test -- test/ui/geometry.test.ts`でRED。
- [ ] 設定フォームは「幅」「高さ」「総地雷数」「盤面を作成」。無効設定は現在盤面を保持してフィールドエラー。編集パレットは「閉じる」「空き」「旗」「1」〜「8」。クリックで選択、矢印で移動、0/Spaceは空き、Fは旗、Deleteは閉じる、1〜8は数字。入力フォーム内では盤面ショートカットを発火しない。
- [ ] CanvasをDPRで拡大しCSS座標でhitTest。観測は基底レイヤー、入力旗は旗形、提案地雷は菱形M、安全は丸S、推測は枠付き?、不確実は破線枠、矛盾は×を重ねる。選択は二重枠。提案で基底を変更しない。
- [ ] セルのDOM表現にrole=grid/gridcell、行列数と「行1 列2 閉じたセル」等の名前、roving tabindexを付ける。Canvasはaria-hidden。DOMセルをCanvas位置に重ね、フォーカスはCanvasとCSSの両方で可視化。パレットとリセットはbuttonで操作する。リセットのクリックまたはキーボードでのボタン起動は`onReset()`を一度だけ通知し、セルごとの`onEdit`は発行しない。受け手は現在のAppStateの盤面から`createBoard(board.width, board.height, board.totalMines, board.revision + 1)`を作り、`transition(state, { type: 'board-changed', board: resetBoard })`を一度だけ実行する。これにより幅・高さ・総地雷数と旗policyを保ち、全セルをmanual/closed/uncertain=falseへ戻し、revisionを一度だけ更新して古い提案・実行を無効化する。
- [ ] ブラウザテストで設定→クリック編集→矢印/全入力値を行い、onEditの観測値とrevisionを確認。リセットはマウスとキーボードの両経路で、onResetが一度だけ呼ばれonEditが発行されないこと、受け手で設定と旗policyを保持した全閉じ盤面になること、revisionが1だけ増えて旧提案が消えることを確認。future recognition由来セルを手動編集したらmanual/uncertain=falseになることをモデルテストで確認する（uncertain自体を入力パレットに追加しない）。
- [ ] `npm test -- test/ui test/browser/board-editor.test.ts`、型検査、build。レビューはCanvasとDOMの座標一致、フォーカス維持、記号の判読性。
- [ ] `git commit -m "feat: render and edit boards with mouse and keyboard"`。

### 単位8 / #15: 日本語MVP統合

**Files:** 単位8。**Consumes:** 単位6・7。**Produces:** 完全なMVP操作フロー。layout.tsは`computeLayout(availableWidth: number, columns: number): { placement: 'right' | 'below'; cellSize: number }`を公開する。

- [ ] `test/browser/mvp.test.ts`でフォームに幅3・高さ1・総数1を設定し、盤面セル1を0に編集。「確定した手があります」とセル2の安全、セル3の地雷表示を期待するテストを追加。`npm test -- test/browser/mvp.test.ts`でRED。
- [ ] app.tsで編集→transition(board-changed)→effects実行→client応答→transition(response)→描画を接続。onResetの受け手も単位7の契約どおりに同じboard-changed経路へ接続する。再実行ボタンはsolve actionで同revision・新requestIdを使う。二重実行をcancelで防ぐ。status.tsはaria-live=politeで「入力を確認してください」「盤面に矛盾があります」「解析中」「確定した手があります」「推測が必要です」「探索上限に達しました」「解析に失敗しました」を状態に対応させる。未確定セルがないsolvedは「盤面の確認が完了しました」。
- [ ] 「入力旗を地雷として扱う」「入力旗を再検討する」のラジオ、自動再検討checkbox、既定trusted/自動offを追加。trustedの制限と再検討使用中を明記。入力旗と提案地雷の凡例を常時表示。
- [ ] 右情報欄288px、間隔24px、盤面セル最大40pxを仮定。`floor((availableWidth - 288 - 24) / columns) >= 24`ならright、その他below。belowでは`floor(availableWidth / columns)`を最大40で制限する。Canvasと親にoverflow scrollを付けず、縦スクロールはbodyだけにする。
- [ ] 全体矛盾（3×1・中央1・総数2）、guess-required（2×1・1地雷）、再入力による矛盾解消、旗policy変更、編集中の遅い結果破棄をE2E化。上限とWorkerエラーはテスト専用Worker factoryを注入して再現し、production UIに試験専用設定を追加しない。
- [ ] `npm test -- test/app test/ui test/browser/mvp.test.ts`、型検査、build。レビューは数値確率の不表示、観測の不変性、各状態の文言、キーボード経路。
- [ ] `git commit -m "feat: integrate Japanese manual solver workflow"`。

### 単位9 / #16: 出荷前品質と公開手順

**Files:** 単位9。**Consumes:** production build。**Produces:** 再現可能な品質証跡とリリース文書。公開先への実際の配信はこの計画作成Issueの範囲外。

- [ ] previewを使うrelease.test.tsに単位8の正常・矛盾・再入力フローを追加。`npm run build`後、`npm test -- test/browser/release.test.ts`でproductionの不足を確認する。
- [ ] 1920×1080、1280×800、960×1080で9列と30列を確認。セル幅=高さ、対象範囲で24px以上、right/below切替、Canvas親のscrollWidth=clientWidth、ページ横スクロールなしをassert。スクリーンショットで色以外の記号と可視フォーカスもレビューする。
- [ ] request監視でorigin外の通信、WebSocket、beaconを禁止してフローを実行。入力前後のlocalStorage/sessionStorageが空、IndexedDB作成なし、リロードで盤面が初期化されることを確認。HTTPによる静的JS/CSS/Worker取得は許可する。Service Workerを登録しない。
- [ ] ChromiumでTabのみの設定・編集・policy・再実行・リセットを検証。最新Windows Chromeで同じ主要フローを手動確認し、OS/browser versionと結果をrelease文書へ記録。利用できない環境は「未実施」と記し出荷確認を完了扱いにしない。
- [ ] CI実ファイルを確認してqualityの順序をtypecheck→build→testに統一し、production smokeを通常テストに含める。npm scriptsに`test:browser: vitest run test/browser`を追加。通常テストとbrowserテストをCIで重複実行しない構成にする。既存spike evidenceは通常CIに追加しない。
- [ ] release文書に`npm ci`→`npx --no-install playwright install chromium`→`npm run typecheck`→`npm run build`→`npm test`→`npm run preview`を記載。成果物はdist、静的配信、Worker module MIME、HTTPS、サブパス配置時のVite base設定、配置後smoke、直前artifactへのロールバックを明記する。公開先選定と配信は#16で具体化する。
- [ ] 対応範囲・入力上限・探索上限・旗の限界・画像非対応・自動保存なし・Windows確認結果・変更に対応するversionを記録。実装済み範囲に合わせREADMEを更新。
- [ ] `npm run typecheck`→`npm run build`→`npm test`の順に実行する。CI・ローカル公開手順の両方でproductionテストより先にbuildを必須とし、harnessは生成済みdistをpreviewする。distが存在しないクリーンcheckoutから上記公開手順を順番に実行して成功することを確認する。READMEの検証手順と`test:browser`の実行説明にもbuildが前提であることを記載する。
- [ ] `git commit -m "test: verify manual MVP release readiness"`。署名失敗は調査へ切り替え、署名なしで再実行しない。

## レビュー・Issueの完了境界

| Issue | 成果物とレビューの観点 | 解除できる依存 |
| --- | --- | --- |
| #9 | 本計画の型、状態遷移、テスト、ファイル責務、単位1〜9をレビューしmainへ反映 | #10 |
| #10 | 単位1〜3、純粋モデル、事前検証、古い応答破棄、Chromium起動 | #11、#14、後続画像支援#12 |
| #11 | 単位4〜6、oracle、総数統合、上限、旗、Worker | #14も完了したら#15 |
| #14 | 単位7、全手動入力経路、描画、可視フォーカス | #11も完了したら#15 |
| #15 | 単位8、日本語で設定から提案まで完結 | #16 |
| #16 | 単位9、production・privacy・対象環境確認、公開手順 | MVPの品質確認完了 |

#9の計画レビューとmain反映前に#10のblockedを外さない。Issueへのコメント投稿・closeは別途ユーザーが指示した場合に行う。本計画は#5〜#8の認識採否を変更せず、#13のゲートも解除しない。

## #9の受け入れ条件との対応

- 盤面モデル、validation、local solver、手動入力、描画、統合UI: 単位1〜8。
- 独立したテスト・レビュー単位: 各単位にRED/GREEN、検証コマンド、レビュー観点、コミット境界を定義。
- ファイル責務・公開interface・Workerメッセージ・状態遷移: ファイル表、型契約、遷移表。
- unit、browser、手動作成→solverのE2E: 単位1〜7、単位8、productionは単位9。
- TDD、コマンド、コミット境界: 各単位のチェックリスト。
- 画像入力・認識をMVPの前提にしない: Global Constraintsと認識予約型の非実行契約。
