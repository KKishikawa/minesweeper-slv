import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  evaluateGridResampleCompatibility,
  hashBrowserOutputBytes,
} from "../../scripts/recognition/evaluate-grid-resample-compatibility.js";

describe("browser canonical grid resampling", () => {
  it("hashes every browser output chunk in fixed offset order", async () => {
    const bytes = new Uint8ClampedArray([5, 8, 13, 21, 34, 55, 89]);
    const offsets: number[] = [];
    const hash = await hashBrowserOutputBytes(bytes.length, async (offset, length) => {
      offsets.push(offset);
      return [...bytes.subarray(offset, offset + length)];
    }, 3);

    expect(offsets).toEqual([0, 3, 6]);
    expect(hash).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("rejects a browser chunk that omits trailing bytes", async () => {
    await expect(hashBrowserOutputBytes(4, async (offset, length) => {
      const bytes = new Uint8ClampedArray([1, 2, 3, 4]);
      return offset === 0 ? [...bytes.subarray(offset, offset + length - 1)] : [];
    }, 4)).rejects.toThrowError("Browser output chunk length mismatch at offset 0.");
  });

  it("matches Node bytes in formal Chromium for unit, 30-pixel, and 50-pixel inputs", async () => {
    const summary = await evaluateGridResampleCompatibility({ engines: ["chromium"] });
    const chromiumRows = summary.rows.filter((row) => row.engine === "chromium");

    expect(chromiumRows.map((row) => row.caseId)).toEqual([
      "unit-2x2-scale-150",
      "formal-30-pixel-pitch",
      "formal-50-pixel-pitch",
    ]);
    expect(chromiumRows.every((row) => row.equal), JSON.stringify(chromiumRows)).toBe(true);
  }, 120_000);
});
