# 認識評価を維持するCI高速化設計

## 目的と承認範囲

[Issue #32](https://github.com/KKishikawa/minesweeper-slv/issues/32) の目的は、通常CIの必須チェックの待ち時間を、検証対象と失敗検知能力を維持したまま短縮すること。
2026-10-10に、全検証を毎PRで維持するジョブ分割、計測系の隔離、重複計算の削減、変更前後の比較測定という方針が承認された。本書はその実装前レビュー用設計であり、性能改善の実測結果ではない。

既存の成功CI 21件のjob中央値は12分35秒。目標は30%以上の短縮、すなわち8分48秒以下。最新の単発高速runを新しいbaselineにしない。性能結果に加えて総runner分数、メモリ、timeoutとflakyの有無を報告する。

## 現状と制約

基準commitは `1a01eac1`。`vitest.config.ts` は `fileParallelism: false` で、`*.spike.test.ts` 以外の全テストを直列実行する。CIとPagesの双方が `npm test` を実行する。

Issueの既存Actionsログでは、重い6ファイルが最新成功runのテスト時間の約87%を占める。ファイル時間はrunnerによって変動するため、この値だけから短縮率を約束しない。

- `formal-runner.test.ts`: production依存の候補評価、4つのholdout fold、checkpointと証拠・報告書の出力を検証。
- `folds.test.ts`: 独立に4foldを実評価し、学習・calibrationへのholdout漏洩、欠落ラベル、prototype数、正式matrixと判定を検証。
- `generated-bank.test.ts`: 実CLIの棄却・終了コード・出力抑制と、候補生成APIの証拠・条件付き再現性を検証。
- `browser-grid-resample.test.ts`: Nodeと実Chromiumの全出力hash・寸法、unitのbytes一致、chunk欠落検知を検証。
- `browser-grid-fallback.test.ts`: 実Chromium由来16入力を3回処理し、public/diagnostic経路の一致、入力不変性、geometry精度、診断と決定性を検証。
- `evaluate-grid-fallback.test.ts`: 同じ正式16入力にwarmupと3回のstrict/complete交互計測を行い、入力保持、実行順、診断、採用判定計算を検証。

閾値、fixturesの正解、fold数、正式matrix、反復回数、fail-closed条件を高速化のために弱めない。赤い `test:spike-evidence` は通常CIへ混ぜず、green baselineの重い評価をそこへ移さない。

## 比較した方法

1. **別runnerで全検証を分割（採用）**: 各runner内は直列を維持するため計測へのCPU負荷干渉を抑え、必須チェックのcritical pathを短縮できる。セットアップ重複とrunner分数増加は測定する。
2. **同一runnerで全ファイルを並列化**: 構成は小さいが、CPU・メモリ競合と計測への干渉があり、今回の初期実装には採用しない。
3. **正式評価の実行頻度を下げる**: 待ち時間は減るが、変更依存条件と出荷時保証が複雑になる。今回の範囲では毎PR・main pushの全検証を維持する。

## テストの責務と分割

分割の定義は単一の共有manifestに集約する。CIの各分割用コマンドとVitest設定はこの定義を参照し、CI YAMLにファイル一覧を重複記載しない。

初期構成は次の5グループ。全グループ内で `fileParallelism: false` を維持する。グループの最終時間は実測で確認する。

| グループ | 対象 | 責務 |
| --- | --- | --- |
| product | recognition以外の全通常テスト | 製品unit、solver、UI、productionブラウザ、Pages subpath、repository foundation、typecheck、build |
| formal | `formal-runner.test.ts` | production正式runner、候補・foldの実評価、証拠出力 |
| holdout | `folds.test.ts`, `generated-bank.test.ts` | holdout独立回帰、generator API・CLIの実コード経路 |
| grid-compatibility | `browser-grid-resample.test.ts`, `browser-grid-fallback.test.ts` | 実Chromiumの出力互換性、正式matrixのgeometry・決定性 |
| recognition | 上記以外の全通常recognitionテスト | 高速な認識ロジック回帰、正式16入力のUX交互計測と評価器回帰 |

recognitionグループ内ではUX計測中に他のテストを並列実行しない。ブラウザ起動が必要なグループは全てlockfile指定のChromiumを導入する。製品ブラウザが読むroot `dist` はproductジョブ自身で生成する。

将来追加される通常recognitionテストはrecognitionグループへ、それ以外はproductへ自動的に入る。ファイル列挙による検証で、通常テスト集合とグループ和集合の完全一致、重複なし、空グループなし、重い6ファイルの分類を確認する。不存在の明示指定も検知する。spike除外条件は全経路で一致させる。

`npm test` は全通常テストを従来どおり直列実行する完全回帰コマンドとして維持する。開発者はグループ指定コマンドも使えるが、PR前の完全検証を置換しない。watchと既存browser専用コマンドにも全体設定の互換性を保つ。

## CIと必須チェック

`.github/workflows/ci.yml` は同じpush/main・pull_requestイベント、contents read権限、concurrency取消、ubuntu-24.04、`.node-version`とlockfileを維持する。

5グループを独立ジョブ（または同等の固定matrix）で実行する。matrixを使う場合は `fail-fast: false` とし、1グループの失敗によって他の検証と時間記録を省略しない。各ジョブに有限timeoutを設ける。

既存のjob ID `quality` とチェック名 `CI / quality` は集約専用として維持する。全検証ジョブを `needs` で列挙し、`if: always()` で実行し、全依存結果が厳密に `success` の場合のみ成功させる。failure、cancelled、skippedのいずれも成功に変換しない。`continue-on-error` は使わない。テストやセットアップの失敗をartifact保存処理で隠さない。

テスト集合の検証はproductに含め、分割漏れも必須チェック失敗とする。repository-foundationの旧「単一ジョブ・全コマンド順固定」の検証は、必要グループ、集約の依存関係と失敗条件、実行コマンド、runtime整合性の検証へ更新する。

集約判定はsuccess/failure/cancelled/skippedの入力で検証する。実装検証時は、一時的なテスト失敗を含むActions runでも集約が失敗することを確認し、故意の失敗変更は成果物に残さない。

## Pages出荷検証

`.github/workflows/pages.yml` は現行の公開承認とmain限定条件を維持し、typecheck → root build → `npm test` → Pages build → artifact uploadの全検証を維持する。通常CIの分割がPagesで検証を省略する理由にはならない。

Pagesは比較実験のために公開しない。repository-foundationと既存Pages回帰で全検証コマンドと公開条件を確認する。workflowの出荷検証構成を将来分割する場合にも、全検証成功をdeployの前提とする必要がある。

## プロファイルと重複計算削減

まず重い6ファイルについて、候補生成・samples構築・Chromium入力生成・calibration・holdout認識・grid検出・resample処理・browser転送・証拠書込みの内訳を測定する。既存経路の時間値で足りない区間には測定フックを追加するが、通常APIの結果や採用判定を変えない。

初期ジョブ分割では6ファイルの固有assertionと独立した実評価を全て残す。正式runnerの結果を読み込んでfoldsテストを通す方式や、以前のrunの出力・学習結果・認識結果をcacheする方式は採用しない。

再計算削減はプロファイルで費用と意味を確認できた箇所に限定する。1回の評価呼出し内での不変入力生成・読込みの再利用を優先し、fixture ID、画像hash、engine/version、holdoutの学習境界が変わる結果を共有しない。既存の保持入力・入力不変性検証を保つ。独立呼出しによる再現性検証とUXのwarmup/反復は削減対象外。

本番画像アルゴリズムの出力変更、採用判断の変更、テスト統合による独立経路の変更が必要になった場合は、本設計の実装へ紛れ込ませず設計を更新してレビューする。プロファイルで安全な削減対象が見つからない場合は、削減を見送り、ジョブ分割の測定結果と理由を記録する。

## 計測の保存と比較

Vitestのファイル単位時間・テスト数・成否と、利用可能なprocessピークRSSを機械可読artifactとして保存する。成功・失敗時とも保存を試みる。Actions APIからworkflow作成、job開始/終了、step開始/終了、結論を取得する。測定失敗は検証成功を意味しない。

比較は次の3条件で行う。変更前refは本Issueの実装前の `1a01eac18f389e7933be9937ad7fa4aa8be476b7` に固定し、変更後refは測定対象の実装commitの完全SHAに固定する。branch名や変動するHEADを測定対象に使わない。

| 条件 | checkoutするコード | 実行構成 | 測る効果 |
| --- | --- | --- | --- |
| A: 変更前・直列（baseline） | 変更前refの製品・評価実装・テスト | 変更前の単一qualityジョブ、全通常テスト直列 | 変更前の基準 |
| B: 変更後・直列 | 変更後refの製品・評価実装・テスト | Aと同じセットアップ・コマンド順・直列構成 | A→Bで再計算削減等の実装変更の効果 |
| C: 変更後・分割 | Bと同じ変更後ref | 本設計の5グループと集約quality | B→Cでジョブ分割の効果、A→Cで変更全体の効果 |

Aは変更前の `scripts/recognition/`、`test/recognition/`、`src/recognition/` と関連する入力生成・共通コードをそのまま使用する。変更後の評価実装や共有helperをAへ持ち込まない。B/Cは同じコード・assertionを使用し、異なるのはworkflow構成とグループ選択のみ。全条件でNode、lockfile、Chromium、runnerラベル、Actionsの固定revisionを一致させる。

測定専用の手動workflowは、制御用workflowのrefと実際にcheckoutする測定対象refを分けて記録する。A/Bは同じ直列テンプレートを使い、typecheck → root build → 全通常テストの順序を固定する。通常PRの必須チェックやPages公開経路へ比較条件の追加実行を入れない。

ref間で許容する差分は、本IssueのCI設定・グループmanifest・計測/記録処理・ドキュメント・repository-foundation等の構成検証と、レビュー済みの再計算削減実装・その回帰テストだけ。製品機能、認識アルゴリズムの意味、採用閾値、fixtures/正解データ、既存assertion、matrixと反復数、依存関係は固定する。構成検証や追加回帰によるテスト集合の差は一覧と時間を報告し、変更前から存在する同じ検証対象のファイル時間も別に比較する。集合差を隠して同一対象と呼ばない。

計測処理は可能な限りworkflow外側の時間採取と同じVitest reporter設定で行う。変更前コードへの測定フックが不可欠なら、計測だけのpatchを保存し、挙動・再利用・入力・反復を変えないことをレビューする。同じ測定フックを対応する変更後経路にも適用し、各runに対象refとpatchのhashを残す。Aに再計算削減が混入していないことをdiffで確認する。許容範囲外の変更が必要なら測定を進めず、比較設計を更新する。

最低3回ずつ、A→B→Cを1組として可能なら交互に実行し、意図的に並走させない。実行回数を揃え、成功だけを選別して失敗を隠さない。GitHub-hosted runnerの物理性能差は完全には統制できないため、runner metadataと範囲も残す。

各runについて次を記録する。

- workflow/run ID、比較条件A/B/C、制御用workflowと対象コードの完全SHA、計測patchのhash（適用時）、runtime・Chromium・runner情報、テスト数とファイル集合・差分一覧。
- queue時間（workflow作成から最初の検証job開始）と、各jobの待ち時間。
- CI wall time（最初の検証job開始からquality終了）。queue込みの所要時間も別に記録する。
- 各job/step/重い6ファイルの時間、全テスト時間と総runner分数（集約を含むjob実行秒数合計/60）。
- 各グループのピークRSS。OS/process計測の対象を明記し、子Chromium込みの値と誤認させない。
- 失敗・timeout・再実行・flakyとartifact欠落の有無。

比較報告はA→B、B→C、A→Cの中央値と短縮率をそれぞれ示す。変更全体の30%以上短縮はA→Cで判定し、B→Cだけの結果を変更全体の改善率と呼ばない。歴史的中央値12分35秒に対する値も併記する。8分48秒以下であってもA→Cで30%短縮が確認できない場合は目標達成と断定しない。総runner分数増加も明記する。未計測や失敗runは省略せず記録し、測定未完了ならIssueを完了扱いにしない。

## ドキュメントと検証

READMEとCONTRIBUTINGに、全回帰、製品ブラウザ、認識回帰、正式評価の責務とコマンドを記載する。PR/main pushは常に全グループ、Pagesは常に完全回帰、赤いspike evidenceは独立した過去の採用条件という実行条件を明記する。CONTRIBUTINGにはproductionブラウザの前にbuildが必要なことを補う。

実装時の必須検証は、分割集合の完全一致、集約失敗条件、repository-foundation、typecheck、build、完全 `npm test`、全グループ実行、Actionsでの比較と故意の失敗検知。同じチェックの無目的な反復ではなく、機能検証と最低3回の性能比較を区別する。

本書だけの変更ではアプリコード・workflow・テストは変わらない。設計の整合性、リンク、未確定placeholder、差分形式を確認し、既存のGit署名設定を維持してコミットする。

## 完了条件

Issueの全完了条件に対応する分類表、6ファイルの内訳、比較報告、30%以上短縮の測定根拠、必須チェックの失敗検知、Pagesの全検証維持、README/CONTRIBUTING/repository-foundationの整合性を揃える。実装だけで性能目標やIssue完了を主張しない。
