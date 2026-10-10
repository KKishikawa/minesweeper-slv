# 除外した初回A1と全dispatch履歴

最初のA1 [38056774173](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38056774173) は比較に含めない。制御ref `1858c4a3d6fb7ca65a5dc1111e2fad9178d36429` のdirect `node` 起動では `npm_execpath` が欠け、`test/browser/pages.test.ts` の `beforeAll` が失敗した（43 files passed、1 file failed、373 tests passed、1 skipped）。失敗run自体は削除せず、[collector全記録](excluded-run-history.json) に結論、job/step、artifact、失敗したテストを保存した。ローカル再現ではdirect nodeがexit 1、npm経由がexit 0。

修正したbenchmark制御ref `ci-benchmark-npm-context` は `fd2f3878e5f0bbc89589fdad8d8517ac3c11abe1`。比較対象はこの同一制御SHAで実行したA/B/C各3回の成功runだけを、事前に決めた順序で明示指定した。失敗を自動成功フィルターで除去したものではない。旧runと新runの制御SHAが異なるため、旧A1をAの4回目として扱わない。

| 順序 | 条件 | run | 結論 | 制御SHA | 比較 |
| ---: | :---: | --- | --- | --- | :---: |
| 1 | A1 | [38056774173](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38056774173) | failure | `1858c4a` | 除外 |
| 2 | A1 | [38057729631](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38057729631) | success | `fd2f387` | 採用 |
| 3 | B1 | [38058646463](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38058646463) | success | `fd2f387` | 採用 |
| 4 | C1 | [38059568524](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38059568524) | success | `fd2f387` | 採用 |
| 5 | A2 | [38059903713](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38059903713) | success | `fd2f387` | 採用 |
| 6 | B2 | [38060695233](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38060695233) | success | `fd2f387` | 採用 |
| 7 | C2 | [38061573301](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38061573301) | success | `fd2f387` | 採用 |
| 8 | A3 | [38061910284](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38061910284) | success | `fd2f387` | 採用 |
| 9 | B3 | [38062641843](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38062641843) | success | `fd2f387` | 採用 |
| 10 | C3 | [38063595644](https://github.com/KKishikawa/minesweeper-slv/actions/runs/38063595644) | success | `fd2f387` | 採用 |

A/B/C実行順はA1→B1→C1→A2→B2→C2→A3→B3→C3。新9 runは各run完了後に次をdispatchし、並走なし。CLIに渡した9 IDは[比較表](comparison.md)と[JSON](comparison.md.json)に保存している。
