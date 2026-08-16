# Image Recognition Feasibility Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 95風マインスイーパ画像について、Canvas互換の画素処理だけで盤面検出とセル分類が成立するかを、再現可能なfixture・派生画像・検証成果物で判定する。

**Architecture:** 製品ランタイムへ持ち込める純粋TypeScriptの認識コアを、テスト専用の画像デコード層から分離する。格子検出、セル正規化、特徴抽出、分類、信頼度評価を小さなモジュールに分け、最後に`recognizeBoard()`で統合する。`sharp`はNode上でfixtureをRGBAへ変換し派生画像を作るテスト専用依存とし、認識コアからは参照しない。

**Tech Stack:** Node.js 22.12以上、npm、TypeScript 7.0.2、Vite 8.2.1、Vitest 4.1.10、sharp 0.35.3、tsx 4.23.12

## Global Constraints

- 対象はデスクトップWindows上の最新Chromeを主とするが、認識コアはMac/Linux CIで同じ結果を返すこと。
- OS固有API、OpenCV.js、外部解析API、バックエンドを使用しないこと。
- 製品ランタイムの認識処理はCanvasから得たRGBA画素だけに依存できること。
- ユーザー入力の`columns`、`rows`、`totalMines`を正式値とし、画像からの推定は任意の入力補助として隔離すること。
- 回転、遠近変形、盤面の欠け、別ゲーム、別テーマは対象外とすること。
- 元fixtureでは全セルを正しく高信頼度で分類すること。
- 派生画像では高信頼度の誤分類を0件とし、低信頼度セルを全セルの1%以下にすること。
- 0.75倍、1.25倍、JPEG品質75の決定論的な派生画像を評価すること。
- 数字7、数字8、走査線ありの数字6、未収録の7セグ数字は保証対象に含めないこと。
- 画像固有の固定座標、ファイル名分岐、進行状態分岐を認識コアへ入れないこと。
- 一時生成物は`test/artifacts/recognition/`へ出力し、Gitへ追加しないこと。
- コミット署名設定を変更しないこと。

---

## File Structure

### Project configuration

- Create: `package.json` — npm scripts、Node要件、開発依存
- Create: `package-lock.json` — npmの再現可能な依存解決
- Create: `tsconfig.json` — strictなES Modules設定
- Create: `vitest.config.ts` — Node環境のテスト設定
- Create: `.gitignore` — `node_modules`、build、coverage、spike一時成果物の除外

### Recognition core

- Create: `src/recognition/types.ts` — 画素、矩形、格子、分類、診断の公開型
- Create: `src/recognition/pixels.ts` — 色、輝度、勾配、矩形切り出し、面積平均リサイズ
- Create: `src/recognition/grid.ts` — 周期的エッジからの盤面格子検出
- Create: `src/recognition/normalize.ts` — セル枠除去、走査線低減、基準サイズ化
- Create: `src/recognition/features.ts` — セル特徴ベクトル生成
- Create: `src/recognition/prototypes.ts` — ラベル別プロトタイプ生成と距離計算
- Create: `src/recognition/classify.ts` — 最上位候補、次点候補、信頼度の決定
- Create: `src/recognition/recognize.ts` — 盤面認識パイプラインの統合
- Create: `src/recognition/infer.ts` — 任意の行列数・残地雷数推定

### Test and spike tooling

- Create: `test/recognition/fixture-manifest.ts` — fixtureメタデータと正解盤面の読込
- Create: `test/recognition/ground-truth/0.json` — `0.png`の30×16正解盤面
- Create: `test/recognition/ground-truth/1.json` — `1.png`の30×16正解盤面
- Create: `test/recognition/ground-truth/2.json` — `2.png`の30×16正解盤面
- Create: `test/recognition/ground-truth/3.json` — `3.jpg`の30×16正解盤面
- Create: `test/recognition/image-io.ts` — `sharp`によるRGBAデコードとPNG/JPEG出力
- Create: `test/recognition/derive.ts` — 0.75倍、1.25倍、JPEG品質75の派生画像生成
- Create: `test/recognition/overlay.ts` — 境界、ラベル、信頼度を重ねる検証画像生成
- Create: `test/recognition/samples.ts` — fixtureからラベル付き特徴サンプルを構築
- Create: `test/recognition/pixels.test.ts` — 画素ユーティリティの単体テスト
- Create: `test/recognition/fixture-manifest.test.ts` — 正解盤面の形状と記号検証
- Create: `test/recognition/grid.test.ts` — 元fixtureと派生画像の格子検出テスト
- Create: `test/recognition/classify.test.ts` — セル正規化と分類テスト
- Create: `test/recognition/recognize.test.ts` — 必須合格条件の受け入れテスト
- Create: `test/recognition/infer.test.ts` — 任意入力補助の評価テスト
- Create: `scripts/run-recognition-spike.ts` — JSON、overlay、計測結果、判定材料の生成
- Create: `docs/superpowers/spikes/2026-08-16-image-recognition-report.md` — 最終結果と採否

---

### Task 1: Bootstrap the TypeScript Spike and Pixel Contracts

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/recognition/types.ts`
- Create: `src/recognition/pixels.ts`
- Test: `test/recognition/pixels.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `PixelImage`、`Rect`、`GridGeometry`、`CellLabel`、`cropImage()`、`resizeArea()`、`luminance()`、`rgbDistanceSquared()`

- [ ] **Step 1: Create the package and compiler configuration**

Create `package.json` with this exact structure:

```json
{
  "name": "minesweeper-slv",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "spike:recognition": "tsx scripts/run-recognition-spike.ts"
  },
  "devDependencies": {
    "@types/node": "^26.2.0",
    "sharp": "^0.35.3",
    "tsx": "^4.23.12",
    "typescript": "^7.0.2",
    "vite": "^8.2.1",
    "vitest": "^4.1.10"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
test/artifacts/
*.log
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "types": ["node", "vitest/globals"],
    "lib": ["ES2023", "DOM", "WebWorker"],
    "skipLibCheck": true
  },
  "include": ["src", "test", "scripts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

Run: `npm install`

Expected: `package-lock.json` is created and install exits with code 0.

- [ ] **Step 2: Write the failing pixel utility test**

Create `test/recognition/pixels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cropImage, luminance, resizeArea, rgbDistanceSquared } from "../../src/recognition/pixels.js";
import type { PixelImage } from "../../src/recognition/types.js";

const image: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 0, 0, 255,       255, 0, 0, 255,
    0, 255, 0, 255,     0, 0, 255, 255,
  ]),
};

describe("pixel utilities", () => {
  it("crops without sharing the source buffer", () => {
    const cropped = cropImage(image, { x: 1, y: 0, width: 1, height: 2 });
    expect([...cropped.data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    cropped.data[0] = 12;
    expect(image.data[4]).toBe(255);
  });

  it("area-averages a 2 by 2 image", () => {
    const resized = resizeArea(image, 1, 1);
    expect([...resized.data]).toEqual([64, 64, 64, 255]);
  });

  it("provides deterministic color metrics", () => {
    expect(luminance(255, 255, 255)).toBeGreaterThan(luminance(0, 0, 0));
    expect(rgbDistanceSquared([1, 2, 3], [4, 6, 3])).toBe(25);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/recognition/pixels.test.ts`

Expected: FAIL because `src/recognition/pixels.ts` does not exist.

- [ ] **Step 4: Define the core types and implement the minimal pixel utilities**

Create `src/recognition/types.ts` with these public contracts:

```ts
export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GridGeometry {
  readonly bounds: Rect;
  readonly columns: number;
  readonly rows: number;
  readonly pitchX: number;
  readonly pitchY: number;
  readonly score: number;
}

export type CellLabel = "closed" | "empty" | "flag" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface CellCandidate {
  readonly label: CellLabel;
  readonly distance: number;
}

export interface RecognizedCell {
  readonly index: number;
  readonly label: CellLabel;
  readonly confidence: number;
  readonly candidates: readonly CellCandidate[];
}
```

Implement `src/recognition/pixels.ts`. Validate every rectangle against image bounds, compute RGBA offsets as `(y * width + x) * 4`, use a new `Uint8ClampedArray` for crops, and compute each destination pixel in `resizeArea()` from the covered source-pixel area. Round averaged channels to the nearest integer.

- [ ] **Step 5: Run focused and static verification**

Run: `npm test -- test/recognition/pixels.test.ts && npm run typecheck`

Expected: 3 tests PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit the bootstrap**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/recognition/types.ts src/recognition/pixels.ts test/recognition/pixels.test.ts
git commit -m "build: bootstrap recognition spike"
```

---

### Task 2: Create Independently Verified Ground Truth and Fixture Tooling

**Files:**
- Add: `test/resources/0.png`
- Add: `test/resources/1.png`
- Add: `test/resources/2.png`
- Add: `test/resources/3.jpg`
- Create: `test/recognition/fixture-manifest.ts`
- Create: `test/recognition/ground-truth/0.json`
- Create: `test/recognition/ground-truth/1.json`
- Create: `test/recognition/ground-truth/2.json`
- Create: `test/recognition/ground-truth/3.json`
- Create: `test/recognition/image-io.ts`
- Create: `test/recognition/derive.ts`
- Create: `test/recognition/overlay.ts`
- Test: `test/recognition/fixture-manifest.test.ts`

**Interfaces:**
- Consumes: `PixelImage`, `Rect`, `CellLabel`
- Produces: `FixtureCase`、`loadFixtureCases()`、`decodeImage()`、`deriveImages()`、`renderOverlay()`

- [ ] **Step 1: Write the failing manifest validation test**

Create `test/recognition/fixture-manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("recognition fixture manifest", () => {
  it("contains four independently labeled 30 by 16 boards", async () => {
    const fixtures = await loadFixtureCases();
    expect(fixtures).toHaveLength(4);

    for (const fixture of fixtures) {
      expect(fixture.columns).toBe(30);
      expect(fixture.rows).toBe(16);
      expect(fixture.totalMines).toBe(99);
      expect(fixture.expectedCells).toHaveLength(480);
      expect(fixture.expectedBoardBounds.width).toBeGreaterThan(0);
      expect(fixture.expectedBoardBounds.height).toBeGreaterThan(0);
    }
  });

  it("covers every currently observed label", async () => {
    const fixtures = await loadFixtureCases();
    const labels = new Set(fixtures.flatMap((fixture) => fixture.expectedCells));
    expect(labels).toEqual(new Set(["closed", "empty", "flag", 1, 2, 3, 4, 5, 6]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/recognition/fixture-manifest.test.ts`

Expected: FAIL because `fixture-manifest.ts` and ground-truth JSON files do not exist.

- [ ] **Step 3: Define the ground-truth format and label every fixture independently**

Each ground-truth file must satisfy this schema:

```ts
interface GroundTruthFile {
  readonly image: `test/resources/${"0.png" | "1.png" | "2.png" | "3.jpg"}`;
  readonly columns: 30;
  readonly rows: 16;
  readonly totalMines: 99;
  readonly expectedRemainingMines: number;
  readonly expectedBoardBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly board: readonly string[];
}
```

For each file, perform these concrete annotation actions before any recognizer exists:

1. Open the source image at native resolution.
2. Record the outer rectangle of the 30×16 cell grid as integer `x`, `y`, `width`, and `height`.
3. Transcribe exactly 16 strings of exactly 30 symbols in row-major order.
4. Use `#` for closed, `.` for open empty, `F` for flag, and `1` through `8` for numbers.
5. Have a second pass compare every row against the source image without consulting recognizer output.
6. Record the visually verified remaining-mine values as `99`, `72`, `80`, and `2` for fixture IDs `0`, `1`, `2`, and `3`, respectively.
7. Store the verified values in `0.json` through `3.json`.

Implement `fixture-manifest.ts` to parse the symbols to `CellLabel`, reject unknown symbols, reject a row count other than 16, reject a row width other than 30, and resolve paths from the repository root.

Export these exact contracts:

```ts
export interface FixtureCase {
  readonly id: "0" | "1" | "2" | "3";
  readonly imagePath: string;
  readonly columns: 30;
  readonly rows: 16;
  readonly totalMines: 99;
  readonly expectedRemainingMines: number;
  readonly expectedBoardBounds: Rect;
  readonly expectedCells: readonly CellLabel[];
}

export async function loadFixtureCases(): Promise<readonly FixtureCase[]>;
```

- [ ] **Step 4: Implement deterministic image I/O and derivatives**

Implement `decodeImage(path): Promise<PixelImage>` with `sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })` and copy the returned bytes into `Uint8ClampedArray`.

Implement `deriveImages(sourcePath)` to return these named cases:

```ts
type DerivativeName = "source" | "scale-075" | "scale-125" | "jpeg-q75";

interface DerivedImage {
  readonly name: DerivativeName;
  readonly image: PixelImage;
  readonly scale: number;
}
```

- `source`: decoded without transformation, `scale = 1`
- `scale-075`: full image resized to rounded 75% dimensions, `scale = 0.75`
- `scale-125`: full image resized to rounded 125% dimensions, `scale = 1.25`
- `jpeg-q75`: source encoded with `jpeg({ quality: 75, chromaSubsampling: "4:2:0" })`, then decoded, `scale = 1`

Implement `renderOverlay(image, geometry, cells, outputPath)` with `sharp` SVG compositing. Draw the board bounds, all cell rectangles, the selected label, and confidence below 0.999. This helper is diagnostic only and must not be imported by `src/`.

- [ ] **Step 5: Run manifest and type verification**

Run: `npm test -- test/recognition/fixture-manifest.test.ts && npm run typecheck`

Expected: 2 tests PASS, all four 480-cell boards validate, and TypeScript exits with code 0.

- [ ] **Step 6: Commit fixture truth and tooling**

```bash
git add test/resources test/recognition/fixture-manifest.ts test/recognition/ground-truth test/recognition/image-io.ts test/recognition/derive.ts test/recognition/overlay.ts test/recognition/fixture-manifest.test.ts
git commit -m "test: add recognition ground truth"
```

---

### Task 3: Detect the Periodic Board Grid

**Files:**
- Create: `src/recognition/grid.ts`
- Test: `test/recognition/grid.test.ts`

**Interfaces:**
- Consumes: `PixelImage`, `GridGeometry`, fixture `columns` and `rows`
- Produces: `detectGrid(image, dimensions): GridGeometry | null`、`cellRect(geometry, column, row): Rect`

- [ ] **Step 1: Write failing source-fixture grid tests**

Create `test/recognition/grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellRect, detectGrid } from "../../src/recognition/grid.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { decodeImage } from "./image-io.js";

describe("detectGrid", () => {
  it("finds every source board without file-specific coordinates", async () => {
    for (const fixture of await loadFixtureCases()) {
      const image = await decodeImage(fixture.imagePath);
      const result = detectGrid(image, { columns: fixture.columns, rows: fixture.rows });
      expect(result).not.toBeNull();
      expect(result?.bounds.x).toBeCloseTo(fixture.expectedBoardBounds.x, -1);
      expect(result?.bounds.y).toBeCloseTo(fixture.expectedBoardBounds.y, -1);
      expect(result?.bounds.width).toBeCloseTo(fixture.expectedBoardBounds.width, -1);
      expect(result?.bounds.height).toBeCloseTo(fixture.expectedBoardBounds.height, -1);
      expect(result?.pitchX).toBeCloseTo(result?.pitchY ?? 0, 1);
    }
  });

  it("tiles exactly 480 non-overlapping cells", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");
    const image = await decodeImage(fixture.imagePath);
    const grid = detectGrid(image, fixture);
    if (!grid) throw new Error("grid was not detected");
    const first = cellRect(grid, 0, 0);
    const last = cellRect(grid, 29, 15);
    expect(first.x).toBeGreaterThanOrEqual(grid.bounds.x);
    expect(last.x + last.width).toBeLessThanOrEqual(grid.bounds.x + grid.bounds.width + 1);
    expect(last.y + last.height).toBeLessThanOrEqual(grid.bounds.y + grid.bounds.height + 1);
  });
});
```

The `-1` precision intentionally allows an absolute error below 10 pixels while the detector is first established. Tighten the assertions to an absolute error of at most 2% of one detected cell pitch before Step 5.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/recognition/grid.test.ts`

Expected: FAIL because `src/recognition/grid.ts` does not exist.

- [ ] **Step 3: Implement edge profiles and periodic candidate scoring**

Implement these internal pure functions in `grid.ts`:

```ts
interface GridDimensions { readonly columns: number; readonly rows: number }
interface EdgeProfiles { readonly vertical: Float64Array; readonly horizontal: Float64Array }

export function detectGrid(image: PixelImage, dimensions: GridDimensions): GridGeometry | null;
export function cellRect(grid: GridGeometry, column: number, row: number): Rect;
```

Implementation rules:

1. Convert pixels to luminance while averaging adjacent source rows in pairs so alternating scanlines do not dominate.
2. Build vertical and horizontal absolute-gradient projections.
3. Search integer pitch candidates from 8 pixels through `floor(min(width / columns, height / rows))`.
4. Score sequences of `columns + 1` vertical boundaries and `rows + 1` horizontal boundaries using normalized edge energy.
5. Require `abs(pitchX - pitchY) / max(pitchX, pitchY) <= 0.05`.
6. Refine the best origin and final boundary positions within ±2 pixels using local edge maxima.
7. Validate that at least 90% of expected boundary intersections have above-median local gradient energy.
8. Return `null` if the best normalized score is not separated from the runner-up by at least 5%.

Keep all thresholds as named constants in this file. Do not branch on image path or source dimensions.

- [ ] **Step 4: Run source tests and inspect one overlay**

Run: `npm test -- test/recognition/grid.test.ts`

Expected: both tests PASS.

Generate one overlay through a temporary call from the test helper and inspect that the first and last cell borders align with the visible grid. Remove the temporary call after inspection.

- [ ] **Step 5: Add derived-image grid coverage and tighten geometry assertions**

Extend `grid.test.ts`:

```ts
it("detects every deterministic derivative", async () => {
  for (const fixture of await loadFixtureCases()) {
    for (const derived of await deriveImages(fixture.imagePath)) {
      const result = detectGrid(derived.image, fixture);
      expect(result, `${fixture.id}/${derived.name}`).not.toBeNull();
      const expected = fixture.expectedBoardBounds;
      const tolerance = ((expected.width / fixture.columns) * derived.scale) * 0.02;
      expect(Math.abs((result?.bounds.x ?? 0) - expected.x * derived.scale)).toBeLessThanOrEqual(Math.max(1, tolerance));
      expect(Math.abs((result?.bounds.y ?? 0) - expected.y * derived.scale)).toBeLessThanOrEqual(Math.max(1, tolerance));
    }
  }
});
```

Run: `npm test -- test/recognition/grid.test.ts && npm run typecheck`

Expected: source and all 12 derived cases PASS with the same detector constants.

- [ ] **Step 6: Commit the grid detector**

```bash
git add src/recognition/grid.ts test/recognition/grid.test.ts
git commit -m "feat: detect minesweeper board grid"
```

---

### Task 4: Normalize and Classify Cell Images

**Files:**
- Create: `src/recognition/normalize.ts`
- Create: `src/recognition/features.ts`
- Create: `src/recognition/prototypes.ts`
- Create: `src/recognition/classify.ts`
- Create: `test/recognition/samples.ts`
- Test: `test/recognition/classify.test.ts`

**Interfaces:**
- Consumes: `PixelImage`, `GridGeometry`, `CellLabel`, verified fixture labels
- Produces: `normalizeCell()`、`extractFeatures()`、`buildPrototypeSet()`、`classifyCell()`、`buildFixtureSamples()`

- [ ] **Step 1: Write failing normalization and classification tests**

Create `test/recognition/classify.test.ts` with two groups:

```ts
import { describe, expect, it } from "vitest";
import { classifyCell } from "../../src/recognition/classify.js";
import { extractFeatures } from "../../src/recognition/features.js";
import { detectGrid, cellRect } from "../../src/recognition/grid.js";
import { normalizeCell } from "../../src/recognition/normalize.js";
import { buildPrototypeSet } from "../../src/recognition/prototypes.js";
import { cropImage } from "../../src/recognition/pixels.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { decodeImage } from "./image-io.js";
import { buildFixtureSamples } from "./samples.js";

describe("cell normalization", () => {
  it("produces a stable 16 by 16 RGBA image", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");
    const image = await decodeImage(fixture.imagePath);
    const grid = detectGrid(image, fixture);
    if (!grid) throw new Error("grid was not detected");
    const normalized = normalizeCell(cropImage(image, cellRect(grid, 0, 0)));
    expect(normalized.width).toBe(16);
    expect(normalized.height).toBe(16);
    expect(normalized.data).toHaveLength(16 * 16 * 4);
  });
});

describe("cell classification", () => {
  it("classifies every source cell with the correct top candidate", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    for (const fixture of fixtures) {
      const image = await decodeImage(fixture.imagePath);
      const grid = detectGrid(image, fixture);
      if (!grid) throw new Error(`grid missing for ${fixture.id}`);
      for (let index = 0; index < fixture.expectedCells.length; index += 1) {
        const column = index % fixture.columns;
        const row = Math.floor(index / fixture.columns);
        const normalized = normalizeCell(cropImage(image, cellRect(grid, column, row)));
        const result = classifyCell(extractFeatures(normalized), prototypes);
        expect(result.label, `${fixture.id} cell ${index}`).toBe(fixture.expectedCells[index]);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/recognition/classify.test.ts`

Expected: FAIL because normalization and classification modules do not exist.

- [ ] **Step 3: Implement normalization and feature extraction**

Implement `normalizeCell(cell)` with these fixed operations:

1. Remove 12.5% from each edge to exclude the bevel and grid line.
2. Apply a vertical three-row median independently to RGB channels.
3. Area-resize the interior to 16×16.
4. Preserve alpha as 255.

Implement `extractFeatures(normalized)` returning a `Float64Array` composed of:

- 16×16 normalized RGB values scaled to `[0, 1]`
- 8×8 luminance block means
- 8×8 chroma magnitudes `max(R,G,B) - min(R,G,B)`
- 8-bin hue histogram for pixels whose chroma is at least `0.15`
- 16-bin luminance histogram
- horizontal and vertical gradient-energy totals

Export one named `FEATURE_LENGTH` and assert the returned vector always has that length.

- [ ] **Step 4: Implement deterministic prototypes and classification**

Define:

```ts
export interface CellPrototype {
  readonly label: CellLabel;
  readonly mean: Float64Array;
  readonly variance: Float64Array;
}

export interface PrototypeSet {
  readonly prototypes: readonly CellPrototype[];
}

export interface LabeledFeatureSample {
  readonly label: CellLabel;
  readonly features: Float64Array;
}
```

`buildFixtureSamples(fixtures)` belongs to `test/recognition/samples.ts`. It loads source images, detects their grids, extracts verified cells, normalizes them, and returns `LabeledFeatureSample[]`.

`buildPrototypeSet(samples)` belongs to `src/recognition/prototypes.ts` and must:

1. Extract all verified cells by label.
2. Compute per-feature means and variances.
3. Clamp each variance to at least `1e-6`.
4. Return labels in this stable order: `closed`, `empty`, `flag`, `1` through `8`, omitting labels absent from the supplied fixture set.

`classifyCell(features, prototypes)` must compute mean normalized squared distance using each prototype variance, sort ascending, and return at least the top two candidates. Define confidence as:

```ts
const confidence = second.distance === 0
  ? 1
  : Math.max(0, Math.min(1, 1 - best.distance / second.distance));
```

Do not special-case fixture identifiers. If a label occurs in only one source image, record that limitation in the final report rather than weakening the test.

- [ ] **Step 5: Run source classification and type verification**

Run: `npm test -- test/recognition/classify.test.ts && npm run typecheck`

Expected: normalization test PASS, every source cell top candidate matches ground truth, and TypeScript exits with code 0.

- [ ] **Step 6: Commit normalization and classification**

```bash
git add src/recognition/normalize.ts src/recognition/features.ts src/recognition/prototypes.ts src/recognition/classify.ts test/recognition/samples.ts test/recognition/classify.test.ts
git commit -m "feat: classify normalized board cells"
```

---

### Task 5: Integrate Recognition, Confidence Gates, and Mandatory Acceptance Tests

**Files:**
- Create: `src/recognition/recognize.ts`
- Test: `test/recognition/recognize.test.ts`
- Create: `scripts/run-recognition-spike.ts`

**Interfaces:**
- Consumes: `detectGrid()`、`normalizeCell()`、`extractFeatures()`、`classifyCell()`、`PrototypeSet`
- Produces: `RecognitionRequest`、`RecognitionResult`、`recognizeBoard()`、spike artifact JSON and overlays

- [ ] **Step 1: Write the failing recognition acceptance test**

Create `test/recognition/recognize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPrototypeSet } from "../../src/recognition/prototypes.js";
import { recognizeBoard } from "../../src/recognition/recognize.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { buildFixtureSamples } from "./samples.js";

describe("recognizeBoard acceptance", () => {
  it("accepts every source fixture without uncertain cells", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    for (const fixture of fixtures) {
      const [source] = await deriveImages(fixture.imagePath);
      if (!source) throw new Error(`source derivative missing for ${fixture.id}`);
      const result = recognizeBoard({ image: source.image, columns: 30, rows: 16 }, prototypes);
      expect(result.status, fixture.id).toBe("recognized");
      expect(result.cells.map((cell) => cell.label)).toEqual(fixture.expectedCells);
      expect(result.uncertainCellIndices).toEqual([]);
    }
  });

  it("never accepts a wrong derivative cell with high confidence", async () => {
    const fixtures = await loadFixtureCases();
    const prototypes = buildPrototypeSet(await buildFixtureSamples(fixtures));
    for (const fixture of fixtures) {
      for (const derived of (await deriveImages(fixture.imagePath)).slice(1)) {
        const result = recognizeBoard({ image: derived.image, columns: 30, rows: 16 }, prototypes);
        expect(result.status, `${fixture.id}/${derived.name}`).not.toBe("grid-not-found");
        const wrongCertain = result.cells.filter((cell, index) =>
          cell.label !== fixture.expectedCells[index] && !result.uncertainCellIndices.includes(index),
        );
        expect(wrongCertain, `${fixture.id}/${derived.name}`).toEqual([]);
        expect(result.uncertainCellIndices.length).toBeLessThanOrEqual(4);
      }
    }
  });
});
```

Four uncertain cells is the integer ceiling below 1% of a 480-cell board.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/recognition/recognize.test.ts`

Expected: FAIL because `recognizeBoard()` does not exist.

- [ ] **Step 3: Implement the public recognition pipeline**

Add these exact contracts to `recognize.ts`:

```ts
export interface RecognitionRequest {
  readonly image: PixelImage;
  readonly columns: number;
  readonly rows: number;
}

export interface RecognitionResult {
  readonly status: "recognized" | "needs-review" | "grid-not-found";
  readonly geometry: GridGeometry | null;
  readonly cells: readonly RecognizedCell[];
  readonly uncertainCellIndices: readonly number[];
  readonly elapsedMs: number;
}

export function recognizeBoard(
  request: RecognitionRequest,
  prototypes: PrototypeSet,
): RecognitionResult;
```

Pipeline rules:

1. Reject non-positive or non-integer dimensions with `RangeError`.
2. Call `detectGrid()` and return `grid-not-found` with no cells when it returns `null`.
3. Process cells in row-major order.
4. Store candidates sorted by distance.
5. Evaluate the shared confidence thresholds `0.25`, `0.30`, `0.35`, `0.40`, `0.45`, and `0.50` in that order.
6. Select the lowest threshold that produces zero high-confidence errors, zero uncertain source cells, and at most four uncertain cells per derivative. If no candidate satisfies all three conditions, record mandatory failure in Task 7.
7. Return `needs-review` when at least one cell is uncertain; otherwise return `recognized`.
8. Measure elapsed time with `performance.now()` only for reporting; do not branch on wall-clock time.

- [ ] **Step 4: Implement the spike artifact runner**

`scripts/run-recognition-spike.ts` must:

1. Remove and recreate `test/artifacts/recognition/` using explicit resolved paths under that directory only.
2. Load fixture truth and build one shared prototype set.
3. Run every source and derivative case.
4. Write `<fixture>-<derivative>.json` with geometry, labels, confidence, uncertainty, correctness, and elapsed time.
5. Write `<fixture>-<derivative>.png` through `renderOverlay()`.
6. Write `summary.json` with totals for detected grids, correct cells, high-confidence errors, uncertain cells, and elapsed time.
7. Exit with status 1 when any mandatory acceptance condition fails.

- [ ] **Step 5: Run the mandatory spike suite and inspect overlays**

Run: `npm test -- test/recognition/recognize.test.ts && npm run spike:recognition && npm run typecheck`

Expected when the Canvas hypothesis passes: tests PASS, the script exits 0, JSON and PNG artifacts exist for all 16 cases, no high-confidence error exists, each derivative has at most 4 uncertain cells, and TypeScript exits 0.

Inspect all four source overlays and at least one of each derivative type. Confirm grid borders and displayed labels align with the visible cells. Record any discrepancy even when automated assertions pass.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: all pixel, manifest, grid, classification, and recognition tests PASS.

- [ ] **Step 7: Commit the integrated mandatory spike**

```bash
git add src/recognition/recognize.ts test/recognition/recognize.test.ts scripts/run-recognition-spike.ts
git commit -m "feat: integrate board recognition spike"
```

Do not stage `test/artifacts/recognition/`.

---

### Task 6: Evaluate Optional Board-Dimension and Mine-Counter Assistance

**Files:**
- Create: `src/recognition/infer.ts`
- Test: `test/recognition/infer.test.ts`
- Modify: `scripts/run-recognition-spike.ts`

**Interfaces:**
- Consumes: `PixelImage`, detected `GridGeometry`, fixture truth
- Produces: `inferDimensions()`、`readRemainingMineCounter()`、optional evaluation fields in `summary.json`

- [ ] **Step 1: Write separate failing tests for the two optional helpers**

Create `test/recognition/infer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectGrid } from "../../src/recognition/grid.js";
import { inferDimensions, readRemainingMineCounter } from "../../src/recognition/infer.js";
import { deriveImages } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("optional image hints", () => {
  it("infers 30 by 16 for every evaluated case", async () => {
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveImages(fixture.imagePath)) {
        expect(inferDimensions(derived.image), `${fixture.id}/${derived.name}`).toEqual({ columns: 30, rows: 16 });
      }
    }
  });

  it("reads the left mine counter only when all three digits are confident", async () => {
    for (const fixture of await loadFixtureCases()) {
      const [source] = await deriveImages(fixture.imagePath);
      if (!source) throw new Error(`source derivative missing for ${fixture.id}`);
      const grid = detectGrid(source.image, fixture);
      if (!grid) throw new Error(`grid missing for ${fixture.id}`);
      const result = readRemainingMineCounter(source.image, grid);
      expect(result?.value, fixture.id).toBe(fixture.expectedRemainingMines);
      expect(result?.digits).toHaveLength(3);
    }
  });
});
```

Expose the `expectedRemainingMines` values already stored in each ground-truth JSON from `FixtureCase`.

- [ ] **Step 2: Run the optional tests to establish the baseline**

Run: `npm test -- test/recognition/infer.test.ts`

Expected: FAIL because `infer.ts` does not exist.

- [ ] **Step 3: Implement bounded dimension inference**

Implement `inferDimensions(image): { columns: number; rows: number } | null` by reusing edge profiles from `grid.ts` without importing fixture metadata. Search square pitches from 8 through 96 pixels and rectangular boundary sequences containing 8 through 60 columns and 8 through 40 rows. Accept only a candidate whose normalized score exceeds the runner-up by at least 5% and whose pitch mismatch is at most 5%. Return `null` instead of a guess when those conditions fail.

- [ ] **Step 4: Implement bounded seven-segment recognition**

Implement:

```ts
export interface CounterRecognition {
  readonly value: number;
  readonly digits: readonly [number, number, number];
  readonly confidence: number;
}

export function readRemainingMineCounter(
  image: PixelImage,
  grid: GridGeometry,
): CounterRecognition | null;
```

Use only the region above the left half of the detected grid. Collect high-red/low-green/low-blue pixels, cluster their x coordinates into the leftmost three digit groups while allowing gaps between disconnected segments, normalize each digit, and evaluate the seven standard segment regions. Return `null` if three consistent digit boxes or a known segment mask cannot be found. Do not inspect the right-side timer region.

- [ ] **Step 5: Evaluate rather than force optional adoption**

Run: `npm test -- test/recognition/infer.test.ts`

If both tests pass for all asserted cases, keep them as required tests and mark both helpers as adoption candidates.

If either helper fails after the bounded algorithms in Steps 3 and 4 are implemented, split the test so observed successes remain assertions, move the full-matrix adoption expectation into the spike report, and mark that helper as not adopted. Do not add fixture-specific coordinates, loosen the wrong-value check, or extend the spike into another recognition strategy.

Extend `summary.json` with:

```ts
interface OptionalHintSummary {
  readonly dimensions: "candidate" | "not-adopted";
  readonly remainingMines: "candidate" | "not-adopted";
  readonly correctCases: number;
  readonly evaluatedCases: number;
}
```

- [ ] **Step 6: Run regression verification**

Run: `npm test && npm run spike:recognition && npm run typecheck`

Expected: mandatory recognition tests remain PASS regardless of optional-helper adoption. The summary records an explicit candidate or not-adopted outcome for both helpers.

- [ ] **Step 7: Commit the optional evaluation**

```bash
git add src/recognition/infer.ts test/recognition/infer.test.ts test/recognition/fixture-manifest.ts test/recognition/ground-truth scripts/run-recognition-spike.ts
git commit -m "test: evaluate recognition input hints"
```

---

### Task 7: Produce the Spike Report and Decision

**Files:**
- Create: `docs/superpowers/spikes/2026-08-16-image-recognition-report.md`
- Modify only if evidence requires correction: `docs/superpowers/specs/2026-08-16-image-recognition-spike-design.md`
- Modify only if the architecture decision changes: `docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md`

**Interfaces:**
- Consumes: `test/artifacts/recognition/summary.json`、all automated test output、overlay inspection notes
- Produces: one explicit decision: `canvas-adopted`、`grid-comparison-required`、`recognition-redesign-required`、or `canvas-adopted-with-limits`

- [ ] **Step 1: Run fresh verification and capture evidence**

Run:

```bash
npm test
npm run typecheck
npm run spike:recognition
git status --short
```

Expected: test and typecheck outcomes are recorded exactly. `test/artifacts/recognition/` remains ignored. No conclusion is written from an earlier run.

- [ ] **Step 2: Write the report with measured values**

Create `docs/superpowers/spikes/2026-08-16-image-recognition-report.md` with these exact headings:

- `# Image Recognition Feasibility Spike Report`
- `## Decision`
- `## Environment`
- `## Mandatory Results`
- `## Optional Input Hints`
- `## Visual Inspection`
- `## Coverage Limits`
- `## Follow-up`

Under `Decision`, write exactly one decision identifier from the Task 7 interface followed by one paragraph tied to evidence. Under `Environment`, record OS, architecture, Node version, and the SHA-256 of `package-lock.json`. Under `Mandatory Results`, use a table with source and derivative case counts, grid successes, correct cells, high-confidence errors, maximum uncertain cells per image, and min/median/max elapsed milliseconds. Under `Optional Input Hints`, record `candidate` or `not-adopted` separately for dimensions and remaining mines. Under `Visual Inspection`, list every inspected overlay and mismatch. Under `Coverage Limits`, record the unevaluated states: digit 7, digit 8, digit 6 with scanlines, and seven-segment digits absent from the fixtures. Under `Follow-up`, state the single next project action from the decision table.

- [ ] **Step 3: Apply the decision table**

- `canvas-adopted`: all mandatory conditions pass; update the full design only to record Canvas as selected.
- `grid-comparison-required`: classification passes but common grid detection fails; create a separate OpenCV.js grid-comparison design before implementation.
- `recognition-redesign-required`: correctly cropped cells cannot meet classification conditions; return to recognition design before product implementation.
- `canvas-adopted-with-limits`: source fixtures pass and only derivative limits fail; state exact supported scale and compression limits in both report and full design.

Do not begin product UI, solver, screen capture, or OpenCV.js work in this task.

- [ ] **Step 4: Scan the report and any spec updates**

Run:

```bash
rg -n -i 'TBD|TODO|FIXME|REPLACE_ME|WRITE_HERE' docs/superpowers/spikes/2026-08-16-image-recognition-report.md
git diff --check
```

Expected: the first command returns no authoring placeholders and `git diff --check` returns no errors.

- [ ] **Step 5: Commit the evidence and decision**

```bash
git add docs/superpowers/spikes/2026-08-16-image-recognition-report.md docs/superpowers/specs/2026-08-16-image-recognition-spike-design.md docs/superpowers/specs/2026-08-16-minesweeper-solver-design.md
git commit -m "docs: record image recognition spike result"
```

Only stage specification files when the evidence required an actual update.

- [ ] **Step 6: Verify the final spike branch**

Run:

```bash
npm test
npm run typecheck
git status --short
git log --oneline -7
```

Expected: tests and typecheck PASS, tracked files are clean, only intentionally untracked user files remain, and the task commits appear in order.

---

## Execution Stop

Stop after Task 7. The spike decision is a gate for the product implementation plan. Do not continue directly into the solver, production UI, or capture integration without reviewing the report and updating the project plan for the selected recognition path.
