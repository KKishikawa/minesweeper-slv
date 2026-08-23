import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { loadFixtureCases } from "./fixture-manifest.js";
import { buildFixtureSamples } from "./samples.js";

function pngAncillaryChunkTypes(data: Buffer): readonly string[] {
  const ancillary: string[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    if ((type.charCodeAt(0) & 0x20) !== 0) ancillary.push(type);
    offset += length + 12;
    if (type === "IEND") return ancillary;
  }
  throw new Error("Invalid PNG chunk structure.");
}

function jpegMetadataMarkers(data: Buffer): readonly number[] {
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error("Invalid JPEG header.");
  const metadata: number[] = [];
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) throw new Error("Invalid JPEG marker structure.");
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset]!;
    offset += 1;
    if (marker === 0xda || marker === 0xd9) return metadata;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.readUInt16BE(offset);
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) metadata.push(marker);
    offset += length;
  }
  throw new Error("JPEG ended before its scan data.");
}

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

  it("owns exactly 480 uniquely indexed feature samples per fixture", async () => {
    const fixtures = await loadFixtureCases();
    const samples = await buildFixtureSamples(fixtures);

    for (const fixture of fixtures) {
      const fixtureSamples = samples.filter((sample) => sample.fixtureId === fixture.id);
      expect(fixtureSamples, fixture.id).toHaveLength(480);
      expect(new Set(fixtureSamples.map((sample) => sample.cellIndex)).size, fixture.id).toBe(480);
      expect(fixtureSamples.map((sample) => sample.cellIndex), fixture.id)
        .toEqual(Array.from({ length: 480 }, (_value, index) => index));
    }
  });

  it("contains no embedded ancillary metadata", async () => {
    for (const fixture of await loadFixtureCases()) {
      const data = await readFile(fixture.imagePath);
      const metadata = data[0] === 0x89
        ? pngAncillaryChunkTypes(data)
        : jpegMetadataMarkers(data);
      expect(metadata, fixture.id).toEqual([]);
    }
  });
});
