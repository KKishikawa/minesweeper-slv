import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resizeLanczos3Image } from "./derive.js";
import { loadFixtureCases } from "./fixture-manifest.js";

describe("recognition derivatives", () => {
  it("keeps the 0.75 scale derivative on the explicit Lanczos3 pixel contract", async () => {
    const [fixture] = await loadFixtureCases();
    if (!fixture) throw new Error("fixture manifest is empty");

    const resized = await resizeLanczos3Image(fixture.imagePath, 0.75);

    expect({ width: resized.width, height: resized.height }).toEqual({ width: 1_920, height: 1_080 });
    expect(createHash("sha256").update(resized.data).digest("hex"))
      .toBe("e963df2136e796cf00b1ebed523febb73da0802248895489f464e39877b979b2");
  });
});
