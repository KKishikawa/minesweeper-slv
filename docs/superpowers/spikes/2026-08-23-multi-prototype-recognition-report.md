# Multi-Prototype Recognition Spike Report

## Decision

multi-prototype-rejected

## Environment

- Platform: macOS arm64
- Node.js: v24.18.0（対応下限は package metadata の Node.js 22.12.0）
- Playwright: 1.62.1
- Sharp: 0.35.3
- 正式判定エンジン: Playwright が起動する Chromium

## Prototype Bank

全4画面から構築した候補のラベル別 prototype 数は
`[12,12,12,12,12,12,12,2,2]` だった。数字 7 と 8 の訓練例はなく、候補にも含まれない。

固定された238組の threshold を評価した。グリッドを検出できた11ケースだけなら144組が条件を満たしたが、正式行列にはグリッド未検出が5ケースあった。そのため共有 threshold は `null`、最終 bank と SHA-256 は `null` であり、製品用 generated module は作成していない。

## Chromium Formal Results

4 source と各3 derivative の合計16ケース中、11ケースでグリッドを検出し、5ケースで検出できなかった。未検出ケースは次のとおり。

- `1:canvas-scale-075`
- `1:canvas-scale-125`
- `2:canvas-scale-075`
- `2:canvas-scale-125`
- `3:canvas-scale-075`

行列が不完全なため threshold は選択されず、全16ケースを `(correct certain: 0, wrong certain: 0, uncertain: 480)` として記録した。これは誤りを確定セルとして隠す代替 threshold を適用しなかった結果である。正式判定は `formalPassed: false` である。

## Whole-Screen Holdout Results

4つの leave-one-screen-out fold はすべて threshold `null`、`passes: false` だった。held-out 画像の全16 derivative ではグリッドを検出したが、訓練側で共有 threshold が成立しないため、各ケースは480セルすべて uncertain として評価した。

| Held out | Prototype counts | Absent labels | Threshold | Pass |
| --- | --- | --- | --- | --- |
| `0` | `[12,12,12,12,12,12,12,2,2]` | `7,8` | `null` | false |
| `1` | `[12,12,12,12,12,12,7,1,2]` | `7,8` | `null` | false |
| `2` | `[12,12,12,12,12,12,12,2,2]` | `7,8` | `null` | false |
| `3` | `[12,12,12,12,12,11,5,1]` | `6,7,8` | `null` | false |

## Compatibility Matrix

最終 bank が存在しないため、engine image evaluation は実行していない。互換性結果は正式判定から独立している。

| Engine | Role | Result |
| --- | --- | --- |
| Chromium | formal | `not-run`（候補 bank なし） |
| Firefox | informational | `not-run`（候補 bank なし） |
| Playwright WebKit | informational | `not-run`（候補 bank なし） |
| Sharp/Lanczos3 | informational | `not-run`（候補 bank なし） |

Playwright WebKit は Safari そのものではなく、Safari 互換性を保証する結果としては扱わない。

## Visual Inspection

threshold を持つ最終 bank がないため、engine overlay の生成と目視確認はスキップした。runner は将来 bank が成立した場合に限り、各 engine の case JSON と PNG overlay を生成する。

## Performance

既存の正式 fold 測定では、16件の held-out case の認識時間は最小 88.83 ms、中央値 710.755 ms、最大 983.81 ms だった。4 fold の独立した完走確認は54.48秒だった。最終候補の focused Chromium 回帰は27.71秒で完走した。

Task 7 の combined runner はこの実行環境で400.4秒以内に完了せず、`summary.json` を生成する前に中断された。そのため combined elapsed time や fresh summary の生成成功は主張しない。上記の正式結果は、独立して完走した candidate と fold の検証結果に基づく。

## Coverage Limits

- 数字 7 と 8 は未サポートかつ未検証であり、認識または棄却の信頼性を主張しない。
- 評価対象は収録された4画面と、Chromium Canvas の 0.75x、1.25x、JPEG quality 0.75 derivative に限られる。
- Firefox、Playwright WebKit、Sharp は候補 bank がないため未評価である。
- ユーザー入力の列数、行数、総地雷数を正とする前提は変更していない。

## Follow-up

5つの Chromium derivative に対するグリッド検出を改善し、同じ正式ゲートを再実行する。
