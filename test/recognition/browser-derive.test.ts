import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveBrowserImages } from "./browser-derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";

function rgbaHash(data: Uint8ClampedArray): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("browser Canvas derivatives", () => {
  it("creates the formal Chromium matrix deterministically", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");
    const first = await deriveBrowserImages("chromium", fixture.imagePath);
    const second = await deriveBrowserImages("chromium", fixture.imagePath);

    expect(first.map((item) => item.name)).toEqual([
      "source", "canvas-scale-075", "canvas-scale-125", "canvas-jpeg-q75",
    ]);
    expect(first.map((item) => [item.image.width, item.image.height])).toEqual([
      [2560, 1440], [1920, 1080], [3200, 1800], [2560, 1440],
    ]);
    expect(first.map((item) => rgbaHash(item.image.data)))
      .toEqual(second.map((item) => rgbaHash(item.image.data)));
    expect(first.every((item) => item.engine === "chromium" && item.browserVersion.length > 0)).toBe(true);
  }, 120_000);
});
