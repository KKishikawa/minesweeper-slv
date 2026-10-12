import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, expect, test } from "vitest";
import { captureBaseline } from "../../scripts/recognition/capture-grid-location-baseline.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "grid-baseline-")); roots.push(root);
  await mkdir(join(root, "src/recognition"), { recursive: true });
  await mkdir(join(root, "test/recognition"), { recursive: true });
  await mkdir(join(root, "scripts/recognition"), { recursive: true });
  const names = ["grid-strict", "grid-fallback", "grid-evidence", "grid-resample"];
  const reference: Record<string, string> = {};
  for (const name of [...names, "pixels", "types"]) {
    const path = `src/recognition/${name}.ts`; await writeFile(join(root, path), name);
    if (names.includes(name)) reference[path] = sha(name);
  }
  await writeFile(join(root, "test/recognition/image-io.ts"), "decoder");
  await writeFile(join(root, "scripts/recognition/capture-grid-location-baseline.ts"), "runner");
  await writeFile(join(root, "package-lock.json"), "{}");
  const image = await sharp({ create: { width: 2, height: 2, channels: 4, background: "black" } }).png().toBuffer();
  await writeFile(join(root, "image.png"), image);
  const records = Array.from({ length: 25 }, (_, i) => ({ id: String(i), sourceImage: "image.png", sourceImageSha256: sha(image), scope: "positive-candidates" }));
  const inventory = records.map(r => ({ id: r.id, imageSha256: r.sourceImageSha256, columns: 30, rows: 16, width: 2, height: 2, geometry: null, stage: "hint-rejected" }));
  const paths = { root, index: "index.json", inventory: "inventory.json", investigation: "investigation.json", output: "before.json" };
  await writeFile(join(root, paths.index), JSON.stringify({ records }));
  await writeFile(join(root, paths.inventory), JSON.stringify({ records: inventory }));
  await writeFile(join(root, paths.investigation), JSON.stringify({ productionSourceSha256: reference, cases: [] }));
  return { paths, records, inventory };
}
test("retains every null result and binds code and input hashes; refuses overwrite", async () => {
  const { paths } = await fixture();
  const result = await captureBaseline(paths);
  expect(result.status).toBe("baseline-complete"); expect(result.cases).toHaveLength(25);
  expect(result.cases.every(c => c.geometry === null && c.rgbaSha256.length === 64)).toBe(true);
  expect(Object.keys(result.codeHashes)).toHaveLength(8); expect(Object.keys(result.inputHashes)).toHaveLength(4);
  expect(result.codeHashes["src/recognition/grid-strict.ts"]).toBe(sha("grid-strict"));
  expect(result.inputHashes.index).toBe(sha(await readFile(join(paths.root, paths.index))));
  await expect(captureBaseline(paths)).rejects.toThrow();
});
test("rejects image provenance mismatch without writing a completed baseline", async () => {
  const { paths, records } = await fixture(); records[0]!.sourceImageSha256 = "0".repeat(64);
  await writeFile(join(paths.root, paths.index), JSON.stringify({ records }));
  await expect(captureBaseline(paths)).rejects.toThrow(/hash/);
  await expect(readFile(join(paths.root, paths.output))).rejects.toThrow();
});
for (const mode of ["duplicate", "missing"] as const) test(`rejects ${mode} IDs`, async () => {
  const { paths, records } = await fixture();
  if (mode === "duplicate") records[1]!.id = records[0]!.id; else records.pop();
  await writeFile(join(paths.root, paths.index), JSON.stringify({ records }));
  await expect(captureBaseline(paths)).rejects.toThrow(/ID|count/);
});
test("rejects changed reference code before measurement", async () => {
  const { paths } = await fixture(); await writeFile(join(paths.root, "src/recognition/grid-strict.ts"), "changed");
  await expect(captureBaseline(paths)).rejects.toThrow(/reference/);
});
for (const target of ["code", "rgba"] as const) test(`rejects ${target} changes during measurement`, async () => {
  const { paths } = await fixture();
  await expect(captureBaseline(paths, async image => {
    if (target === "code") await writeFile(join(paths.root, "src/recognition/grid-strict.ts"), "changed");
    else image.data[0] = 255;
    return { geometry: null, stage: "hint-rejected", directRefinedPairCount: 0, canonicalRefinedPairCount: 0, canonicalCandidateCount: 0, sourceSurvivorCount: 0, normalizedImage: null };
  })).rejects.toThrow(/changed/);
  await expect(readFile(join(paths.root, paths.output))).rejects.toThrow();
});
