import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";

import { chromium, type Browser } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  evaluateGridResampleCompatibility,
  hashBrowserOutputBytes,
  type GridResampleTiming,
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

  it("hashes decoded Base64 chunks including high bytes and a partial final chunk", async () => {
    const bytes = new Uint8ClampedArray([0, 255, 128, 1, 254, 127, 42]);
    const offsets: number[] = [];
    const hash = await hashBrowserOutputBytes(bytes.length, async (offset, length) => {
      offsets.push(offset);
      return Buffer.from(bytes.subarray(offset, offset + length)).toString("base64");
    }, 3);

    expect(offsets).toEqual([0, 3, 6]);
    expect(hash).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("rejects a Base64 chunk with missing bytes after decoding", async () => {
    await expect(hashBrowserOutputBytes(4, async () => "AQID", 4))
      .rejects.toThrowError("Browser output chunk length mismatch at offset 0.");
  });

  it("closes launched browsers when the timing reporter fails", async () => {
    const launched: Browser[] = [];
    const launch = chromium.launch.bind(chromium);
    const spy = vi.spyOn(chromium, "launch").mockImplementation(async (options) => {
      const browser = await launch(options);
      launched.push(browser);
      return browser;
    });
    try {
      const summary = await evaluateGridResampleCompatibility({
        engines: ["chromium"],
        onTiming: (timing) => {
          if (timing.stage === "browser-launch") throw new Error("Timing destination is unavailable");
        },
      });
      expect(summary.rows).toHaveLength(3);
      expect(summary.rows.every((row) => !row.equal && row.error === "Timing destination is unavailable")).toBe(true);
      expect(launched.length).toBeGreaterThan(0);
      expect(launched.every((browser) => !browser.isConnected())).toBe(true);
    } finally {
      spy.mockRestore();
      await Promise.all(launched.map((browser) => browser.close()));
    }
  });

  it("matches Node bytes in formal Chromium for unit, 30-pixel, and 50-pixel inputs", async () => {
    const timings: GridResampleTiming[] = [];
    const summary = await evaluateGridResampleCompatibility({
      engines: ["chromium"],
      onTiming: (timing) => {
        timings.push(timing);
        // Persist each completed stage immediately, including when a later stage times out.
        if (process.env.CI_TEST_GROUP === "grid-compatibility") {
          const directory = new URL("../artifacts/ci/grid-compatibility/", import.meta.url);
          mkdirSync(directory, { recursive: true });
          appendFileSync(new URL("resample-timings.jsonl", directory), `${JSON.stringify(timing)}\n`);
          console.log("grid-resample-timing", JSON.stringify(timing));
        }
      },
    });
    const chromiumRows = summary.rows.filter((row) => row.engine === "chromium");

    expect(chromiumRows.map((row) => row.caseId)).toEqual([
      "unit-2x2-scale-150",
      "formal-30-pixel-pitch",
      "formal-50-pixel-pitch",
    ]);
    expect(chromiumRows.every((row) => row.equal), JSON.stringify(chromiumRows)).toBe(true);
    for (const stage of ["node-resample-hash", "browser-launch", "browser-input-resample", "browser-resample", "browser-output-hash", "browser-close"]) {
      expect(timings.filter((timing) => timing.stage === stage).map((timing) => timing.caseId)).toEqual(chromiumRows.map((row) => row.caseId));
    }
    expect(timings.every((timing) => timing.status === "success" && Number.isFinite(timing.durationMs) && timing.durationMs >= 0)).toBe(true);
  }, 120_000);
});
