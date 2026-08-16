# Image Recognition Feasibility Spike Report

## Decision

`canvas-adopted-with-limits`

4枚の元fixtureは格子4/4、セル1920/1920、high-confidence error 0、uncertain 0で合格した一方、派生画像は格子12/12を維持してもセル5728/5760、high-confidence error 32となり、全fixture variantで必須条件を満たす共有信頼度閾値を選べなかった。失敗は正しく切り出されたセルの派生変換後の分類に限定されるため、判断表に従ってCanvasから取得したRGBAを処理する認識コアを、収録元画像のnative scale/original encodingに限り採用する。0.75倍と1.25倍の数値はSharp 0.35.3の`lanczos3` kernelを明示した耐性stress結果であって、ブラウザCanvasの補間結果ではない。Lanczos3でリサイズされた入力とJPEG quality 75で再圧縮された入力は非対応であり、Canvasの既定補間は未評価なので、この結果は実際のcapture入力一般への適合を示さない。

## Environment

- OS: macOS 26.5.2 (build 25F84)
- Architecture: arm64
- Node.js: v24.18.0
- `package-lock.json` SHA-256: `7b0b70b39e219ed28f9affad88ef552f40da2ffb545899217fe94907de7bf7e3`

## Mandatory Results

| Input class | Cases | Grid successes | Correct cells | High-confidence errors | Maximum uncertain cells/image | Elapsed ms min/median/max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Source | 4 | 4/4 | 1920/1920 | 0 | 0 | 165.140 / 317.371 / 380.329 |
| Derivative stress (Lanczos3 scale / JPEG-Q75) | 12 | 12/12 | 5728/5760 | 32 | 3 | 80.533 / 255.051 / 613.833 |

Fresh summary totals were grid 16/16, correct cells 7648/7680, high-confidence errors 32, uncertain cells 7, and total recognition time 4566.858 ms. At the configured threshold 0.25, the Sharp Lanczos3 0.75x and 1.25x stress groups contributed 15 and 4 high-confidence errors, while JPEG-Q75 contributed 13. Every candidate threshold from 0.25 through 0.50 retained 32 derivative high-confidence errors, so `selectedThreshold` was `null` and the mandatory gate failed. All grid requirements, all source-classification requirements, and the derivative maximum-four-uncertain-cells requirement passed; only zero high-confidence errors failed.

Fresh command results:

- `npm test`: exit 1; 8 test files, 7 passed and 1 failed; 49 tests, 47 passed and 2 failed. The failures were `never accepts a wrong derivative cell with high confidence` and `uses the lowest shared threshold calibrated across all fixture variants`.
- `npm run typecheck`: exit 0.
- `npm run spike:recognition`: exit 1 because `mandatory.passed` was `false`.
- `git status --short --ignored test/artifacts/recognition/` immediately after the fresh run: exit 0 with only `!! test/artifacts/`; no generated artifact was staged.

The two red acceptance tests deliberately preserve the failed spike gate and are not an acceptable ordinary-CI green baseline. They should be run as a separately identified spike-evidence job whose failed mandatory status is reported explicitly; ordinary CI must not represent this suite as passing. This documentation task does not change test or package configuration.

## Optional Input Hints

- Dimensions: `not-adopted`; 0/16 correct in the runner's `all-derived-images` evaluation scope. Width and height remain required manual inputs.
- Remaining mines: `not-adopted`; 3/4 correct on source images. `099`, `080`, and `002` were read exactly; `072` returned `null`. Total mines remain a required manual input.

## Visual Inspection

Indices and row/column coordinates below are zero-based. In all ten inspected overlays, the magenta board rectangle and cyan 30×16 cell boundaries aligned with the visible grid.

- `test/artifacts/recognition/0-source.png`: no displayed classification mismatch; all 480 cells were correct and certain.
- `test/artifacts/recognition/1-source.png`: no displayed classification mismatch; all 480 cells were correct and certain.
- `test/artifacts/recognition/2-source.png`: no displayed classification mismatch; all 480 cells were correct and certain.
- `test/artifacts/recognition/3-source.png`: no displayed classification mismatch; all 480 cells were correct and certain.
- `test/artifacts/recognition/1-scale-075.png`: index 34 (row 1, column 4) displayed `flag` for expected digit 5. Correctly classified indices 230 and 239 were uncertain.
- `test/artifacts/recognition/1-scale-125.png`: index 34 (row 1, column 4) displayed `flag` for expected digit 5; no uncertain cells.
- `test/artifacts/recognition/1-jpeg-q75.png`: index 34 (row 1, column 4) displayed `flag` for expected digit 5; no uncertain cells.
- `test/artifacts/recognition/3-scale-075.png`: indices 5, 15, 19, 79, 145, 147, 205, 259, 363, 365, 385, 423, and 429 displayed `flag` for expected digit 3; index 425 displayed `flag` for expected digit 5. Correctly classified indices 434 and 464 were uncertain.
- `test/artifacts/recognition/3-scale-125.png`: indices 250 and 376 displayed `flag` for expected digit 3; index 425 displayed `flag` for expected digit 5; no uncertain cells.
- `test/artifacts/recognition/3-jpeg-q75.png`: indices 5, 15, 31, 37, 145, 259, 260, 279, 365, 429, and 440 displayed `flag` for expected digit 3; index 425 displayed `flag` for expected digit 5. Correctly classified indices 22, 185, and 264 were uncertain.

The inspected mismatches account for all 32 high-confidence errors. Their repeated digit-to-flag pattern across both Sharp Lanczos3 scale stress transforms and JPEG-Q75 is a classification limitation, not evidence for a different grid detector. The scale overlays do not establish browser Canvas interpolation behavior.

## Coverage Limits

- Cell digit 7 is absent from the fixtures and unevaluated.
- Cell digit 8 is absent from the fixtures and unevaluated.
- Cell digit 6 exists only without scanlines; digit 6 with scanlines is unevaluated.
- Seven-segment counter digits 1, 3, 4, 5, and 6 are absent from the fixtures and unevaluated.
- The supported recognition envelope is limited to the four recorded fixture sources at native scale and original encoding. The 0.75x and 1.25x measurements cover only explicit Sharp Lanczos3 stress transforms; browser Canvas interpolation is unevaluated. Lanczos3-resized inputs and JPEG-Q75 recompression are explicitly unsupported; other scales, encodings, themes, rotations, perspective changes, and cropped boards were not established by this spike.

## Follow-up

Revise the product implementation plan to gate all planned capture and import paths on an explicit review of whether the native-source-only scale and encoding envelope is sufficient, including evaluation of the still-unevaluated browser Canvas interpolation behavior required by those paths.
