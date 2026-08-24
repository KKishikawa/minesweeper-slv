import { describe, expect, it } from "vitest";

import { estimateCanonicalPitch } from "../../src/recognition/grid-evidence.js";
import { detectStrictGridAttempt } from "../../src/recognition/grid-strict.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { deriveBrowserImages } from "./browser-derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";
import { syntheticDeterministicNoiseImage } from "./grid-fixtures.js";

const expectedFallbackPitch = new Map<string, number>([
  ["1:canvas-scale-075", 30],
  ["1:canvas-scale-125", 50],
  ["2:canvas-scale-075", 30],
  ["2:canvas-scale-125", 50],
  ["3:canvas-scale-075", 30],
]);

function syntheticAmbiguousTwoPitchImage(): PixelImage {
  const width = 420;
  const height = 420;
  const data = new Uint8ClampedArray(width * height * 4);
  const boardValue = (x: number, y: number, origin: number, pitch: number): number => {
    const column = Math.floor((x - origin) / pitch);
    const row = Math.floor((y - origin) / pitch);
    return 30 + ((column + row) % 2) * 180;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x >= 10 && x < 160 && y >= 10 && y < 160
        ? boardValue(x, y, 10, 30)
        : x >= 220 && x < 420 && y >= 220 && y < 420
          ? boardValue(x, y, 220, 40)
          : 30;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function pitchHint(image: PixelImage): number | null {
  const attempt = detectStrictGridAttempt(image, { columns: 4, rows: 4 });
  return attempt.coarseEvidence === null ? null : estimateCanonicalPitch(attempt.coarseEvidence);
}

describe("Chromium coarse pitch evidence gate", () => {
  it("keeps direct successes strict while supplying only the five fixed fallback pitch hints", async () => {
    for (const fixture of await loadFixtureCases()) {
      for (const derived of await deriveBrowserImages("chromium", fixture.imagePath)) {
        const caseId = `${fixture.id}:${derived.name}`;
        const attempt = detectStrictGridAttempt(derived.image, fixture);
        const expectedPitch = expectedFallbackPitch.get(caseId);
        if (expectedPitch === undefined) {
          expect(attempt.status, caseId).toBe("found");
          continue;
        }

        expect(attempt.status, caseId).not.toBe("found");
        const estimate = attempt.coarseEvidence === null ? null : estimateCanonicalPitch(attempt.coarseEvidence);
        expect(estimate, caseId).not.toBeNull();
        expect(Math.abs((estimate ?? 0) - expectedPitch) / expectedPitch, caseId).toBeLessThanOrEqual(0.05);
      }
    }
  }, 120_000);

  it("does not emit a pitch hint for ambiguous or noise evidence", () => {
    expect(pitchHint(syntheticAmbiguousTwoPitchImage())).toBeNull();
    expect(pitchHint(syntheticDeterministicNoiseImage())).toBeNull();
  }, 10_000);
});
