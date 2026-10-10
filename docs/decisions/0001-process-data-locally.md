# ADR 0001: 画像と盤面をローカルで処理する

Status: accepted

Decision date: 2026-08-16
Recorded: 2026-09-11（歴史資料から遡及記録）

## Context

製品は画像から得た盤面と利用者が入力した盤面を解析します。入力にはゲーム画面や盤面情報が含まれるため、処理場所と外部送信の有無を製品全体の制約として固定する必要があります。

## Considered Options

- 画像処理とsolverをデスクトップブラウザ内で実行する。
- バックエンドまたは外部解析APIへ画像や盤面情報を送る。

## Decision

画像処理、盤面処理、solverはブラウザ内で実行します。画像や盤面情報をサーバーへ送信せず、本番版にバックエンドや外部解析APIを設けません。

## Consequences

- アプリは利用者の画像・盤面・診断データを端末外へ送信しません。利用者自身によるファイルのダウンロードやGitHub Issueへの投稿は別の操作です。公開Issueへの投稿内容は公開されます。
- 認識とsolverはブラウザで実行可能な技術と計算量に収める必要があります。
- 画面共有は利用者が停止でき、ページ終了時にも共有トラックを停止する必要があります。

## 説明の明確化（Issue #33）

ローカル処理の判断は、すべての通信や端末内の保持を禁止するものではありません。静的ファイル（HTML・CSS・JavaScript・Worker）の取得には通信が発生し、GitHub PagesではGitHubがアクセス時のIPアドレスをセキュリティ目的で記録します（[GitHub公式説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)）。

現在の手動MVPでは盤面をページ内メモリに保持し、ブラウザの保存領域への自動保存は行いません。診断履歴・JSON出力は未実装で、#25の実装に合わせて保持と明示操作の説明を更新します。現在の説明は[通信・保存・診断報告](../project/privacy.md)を参照してください。

## Evidence

- [2026-08-16 Minesweeper Solver 全体設計 — 目的、対象範囲、プライバシー](../superpowers/specs/2026-08-16-minesweeper-solver-design.md)
