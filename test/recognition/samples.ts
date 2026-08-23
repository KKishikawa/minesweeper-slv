import { extractFeatures } from "../../src/recognition/features.js";
import { cellRect, detectGrid } from "../../src/recognition/grid.js";
import { normalizeCell } from "../../src/recognition/normalize.js";
import { cropImage } from "../../src/recognition/pixels.js";
import type { LabeledFeatureSample } from "../../src/recognition/prototypes.js";
import type { FixtureCase } from "./fixture-manifest.js";
import { decodeImage } from "./image-io.js";

export interface FixtureFeatureSample extends LabeledFeatureSample {
  readonly fixtureId: FixtureCase["id"];
  readonly cellIndex: number;
}

export async function buildFixtureSamples(
  fixtures: readonly FixtureCase[],
): Promise<readonly FixtureFeatureSample[]> {
  const samples: FixtureFeatureSample[] = [];
  for (const fixture of fixtures) {
    if (fixture.expectedCells.length !== fixture.columns * fixture.rows) {
      throw new Error(`Fixture ${fixture.id} has an unexpected cell count.`);
    }
    const image = await decodeImage(fixture.imagePath);
    const grid = detectGrid(image, fixture);
    if (!grid) throw new Error(`grid missing for ${fixture.id}`);
    for (let index = 0; index < fixture.expectedCells.length; index += 1) {
      const column = index % fixture.columns;
      const row = Math.floor(index / fixture.columns);
      const normalized = normalizeCell(cropImage(image, cellRect(grid, column, row)));
      samples.push({
        label: fixture.expectedCells[index]!,
        features: extractFeatures(normalized),
        fixtureId: fixture.id,
        cellIndex: index,
      });
    }
  }
  return samples;
}
