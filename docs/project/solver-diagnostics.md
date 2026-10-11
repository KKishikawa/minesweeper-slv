# Solver診断履歴（Issue #25）

## 目的と範囲

30×16・99地雷の解析限界について、盤面サイズだけから原因を推測せず、停止時の観測と探索統計を取得する。診断整備とsolver改善は分ける。探索予算200,000ノード・Worker待機上限5秒は変更しない。

本機能は作業ブランチ上の実装であり、公開サイトへはまだ反映していない。公開時の通信・保存の説明整理は[Issue #33](https://github.com/KKishikawa/minesweeper-slv/issues/33)で扱う。

## 取得手順

1. ページ末尾の「開発者向け診断」を開く。
2. 「診断履歴を取得する」をONにする。初期状態はOFF。
3. 盤面を入力・更新するか「再解析する」を実行する。
4. 同じメニューの「診断JSONをダウンロード」で取得する。

ONより前に開始した解析は記録しない。ON自体では再解析しない。実際にWorkerへ依頼した解析を直近100件まで、実行中も含めてメモリに保持する。入力検証で解析を開始しなかった盤面は履歴に含まれない。OFFは以後の記録を停止し、実行中の記録を除外する。完了済み履歴はOFF後も取得・削除できる。履歴削除後に古い応答が来ても、消した記録は復活しない。再読み込みで履歴とON設定は消える。localStorage、sessionStorage、IndexedDB等への永続保存は行わない。

JSON取得後の用途は利用者が選ぶ。GitHub Issueへの報告は補助リンクから利用者自身が行い、アプリは自動投稿しない。公開Issueへ共有した内容は公開される。所有者によるローカル調査など、Issue起票を伴わない利用も可能。

## 編集履歴との違い

Undo/Redoの直近100盤面は、診断の直近100実行とは独立です。保存結果を復元するだけなら新しいsolver実行・診断entryは発生しません。実行中のUndo/Redoは通常のcancelledとして記録します。結果のない未完了盤面への復元や「再解析する」で実際にWorkerを起動したときだけ、診断ONなら新entryを記録します。編集snapshotには診断履歴・Worker・timer・実行IDを含めず、診断のOFF・削除で編集履歴を消しません。

## JSONの内容

`schemaVersion: 1`。`entries`は開始順で、各記録に解析開始時の盤面全セル（value/source/uncertain）、寸法・総地雷数・revision、requestId、開始時刻、固定方式のmetadata（policy/effectivePolicyは常にtrusted、autoReconsiderは常にfalse）、探索予算・待機時間上限を含む。ダウンロード時に現在の盤面で置き換えない。これらは利用者向け設定ではありません。常時再検討・矛盾時の自動再検討は削除しました。

`build`は配信JSのbuild時に埋め込んだpackage version・commit SHA・dirtyフラグ。未コミット変更があるbuildは`dirty: true`であり、commitだけで同一ソースを再現できるとは扱わない。Git情報を取得できないソースアーカイブなどではcommit/dirtyは`null`。

停止理由は次のように区別する。

| outcome | 意味 |
| --- | --- |
| solved / guess-required / inconsistent | solverが正常に返した分類 |
| node-budget | solverが共有探索予算を使い切った |
| timeout | client側のWorker待機上限に到達した |
| worker-error | Worker起動・送受信・処理エラー、または不正応答 |
| cancelled | 盤面編集、Undo/Redo、再解析、破棄によって実行を取り消した |
| running | ダウンロード時点でまだ処理中 |
| limit-unknown | 理由のない旧形式／代替Workerのlimit応答。実Workerはnode-budgetを返す |

`elapsedMs`はWorker生成を含むclient側の経過時間。`statistics.elapsedMs`はsolverの処理時間であり、Worker取得・起動時間を含まない。両者の差だけから起動コストを断定しない。実行中のダウンロードでは経過時間・統計は未確定として`null`になる。

`statistics`には処理段階、共有の訪問ノード数、制約削減後の全連結成分についてセル数・制約数・訪問ノード数・状態を含める。削減前に止まった場合は成分一覧は`null`。成分がなければ`[]`。未探索成分はpending・訪問0であり、成分ごとの訪問数の合計が共有訪問数となる。

`statisticsSource`は、solverが返った場合は`final`、タイムアウト・キャンセル・例外で最後の途中統計しかない場合は`checkpoint`、Workerから取得できなかった場合は`unavailable`。checkpointの訪問数は最終値の下限であり、停止時の正確な訪問数とは扱わない。列挙中は4,096訪問ごとに統計を更新し、Workerは段階変更時および約100ms間隔で途中統計を送る。制約削減や全体地雷数の結合中は段階開始時の統計が最後になることもある。

提案そのものはJSONへ含めない。打切り・エラー・キャンセル時に不完全な提案を表示しない契約を維持する。ダウンロードとメモリ内の記録に限定し、診断を送信する受付API・自動送信は追加しない。

## ローカル再実行

```sh
npm run diagnostics:replay -- /path/to/minesweeper-diagnostics.json 0
```

末尾の数値は`entries`の0始まりindex。省略時は0。選択した開始時盤面・trusted固定方式・maxNodesで同期solverを再実行し、JSONを標準出力へ出す。形式不一致・不正な盤面構造・範囲外indexは終了コード1で拒否する。

旧診断の`effectivePolicy: reconsidered`は、再検討方式が削除されたため元のbuild commitの旧版で再実行する必要があると明示し、終了コード1で拒否します。trustedへ読み替えません。旧診断・実機証跡は歴史資料として保持します。

このコマンドはブラウザのWorker起動、待機時間上限、キャンセルを再現しない。`workerTimeoutReproduced: false`を明示する。元のoutcomeと直接solverの再実行結果を区別して読む。timeoutを含むfixtureの再評価は、元のブラウザ環境での追加計測が必要。

## 当該30×16盤面の状態と後続作業

Windows確認者が限界到達を報告した盤面の全セル観測は未提供。今回の29枚にも当該盤面はないため、**当該盤面のfixture・原因分類・改善前baselineは未取得**。合成盤面を当該報告の再現として扱わない。Issue #25はこの項目が済むまで完了扱いにしない。

1. この機能を有効にして当該盤面を再入力・解析し、JSONを取得する。
2. 内容を確認し、再現用fixtureとして保管する。取得version/commit・dirty状態・ブラウザ環境を記録する。
3. 元の停止分類と、同じ盤面・policy・予算による再実行結果／時間／成分規模をbaselineとして保存する。
4. 改善方式を別途比較する。独立oracleとの一致、古い応答の破棄、不完全な提案の非表示を検証する。上限の増加だけを改善完了としない。

今回の自動検証は手計算可能な7×1の独立2成分、独立oracleで検証する小盤面、実Workerでの予算超過、制御したWorkerのtimeout/error/cancel、productionの診断メニュー・JSON出力を対象とする。Windows実機の報告盤面を再現した結果ではない。

### 取得smoke（2026-10-10）

Mac上のChromiumでproduction buildを配信し、診断をONにして30×16・99地雷の全セルが閉じた合成盤面を作成した。JSONには480セル、`outcome: guess-required`、`statisticsSource: final`、訪問0・成分0が記録された。1280pxおよび960px幅で横スクロールなし、960px幅でセル幅28pxを確認した。build情報は`8227ebe4d17e6fca244e609251a25ec4f9a26999`に対する未コミット変更を含むため`dirty: true`。サイズだけでは探索限界にならない確認であり、当該停止盤面のfixtureやbaselineを代替しない。
