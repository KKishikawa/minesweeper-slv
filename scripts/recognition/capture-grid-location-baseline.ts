import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { arch, platform, release } from "node:os";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { detectGridWithDiagnostics, type GridDetectionDiagnosticResult } from "../../src/recognition/grid-fallback.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { decodeImage } from "../../test/recognition/image-io.js";
interface Paths { root?: string; index: string; inventory: string; investigation: string; output: string }
interface IndexRecord { id: string; sourceImage: string; sourceImageSha256: string; scope: string }
interface InventoryRecord { id: string; imageSha256: string; columns: number; rows: number; width: number; height: number; stage: string; geometry: unknown }
const hash = (data: Uint8Array | Uint8ClampedArray | string) => createHash("sha256").update(typeof data === "string" ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function ids(records: { id: string }[]): Map<string, typeof records[number]> {
  const map = new Map(records.map(record => [record.id, record]));
  if (records.length !== 25 || map.size !== 25) throw new Error("Expected 25 unique IDs (count/duplicate mismatch)");
  return map;
}
export async function captureBaseline(paths: Paths, measure: (image: PixelImage, dimensions: { columns: number; rows: number }) => GridDetectionDiagnosticResult | Promise<GridDetectionDiagnosticResult> = detectGridWithDiagnostics) {
  const root = resolve(paths.root ?? "."); const at = (path: string) => resolve(root, path);
  const inputHashes: Record<string, string> = {};
  async function input<T>(key: string, path: string): Promise<T> { const bytes = await readFile(at(path)); inputHashes[key] = hash(bytes); return JSON.parse(bytes.toString()) as T; }
  const index = await input<{ records: IndexRecord[] }>("index", paths.index);
  const inventory = await input<{ records: InventoryRecord[] }>("inventory", paths.inventory);
  const investigation = await input<{ productionSourceSha256: Record<string, string>; cases: { id: string; sourceImageSha256: string; rgbaSha256: string; stage: string; geometry: unknown }[] }>("investigation", paths.investigation);
  inputHashes.lockfile = hash(await readFile(at("package-lock.json")));
  ids(index.records); const inventoryIds = ids(inventory.records);
  if (index.records.some(record => !inventoryIds.has(record.id))) throw new Error("ID set mismatch");
  const referenceCodeHashes = investigation.productionSourceSha256;
  const required = ["grid-strict", "grid-fallback", "grid-evidence", "grid-resample"].map(name => `src/recognition/${name}.ts`);
  if (!same(Object.keys(referenceCodeHashes).sort(), required.sort())) throw new Error("Invalid reference code hash set");
  const codeFiles = (await readdir(at("src/recognition"))).filter(name => /^grid.*\.ts$/.test(name)).map(name => `src/recognition/${name}`);
  codeFiles.push("src/recognition/pixels.ts", "src/recognition/types.ts", "test/recognition/image-io.ts", "scripts/recognition/capture-grid-location-baseline.ts"); codeFiles.sort();
  async function codeSnapshot() { const result: Record<string, string> = {}; for (const path of codeFiles) result[path] = hash(await readFile(at(path))); return result; }
  const codeHashes = await codeSnapshot();
  for (const path of required) if (codeHashes[path] !== referenceCodeHashes[path]) throw new Error(`reference code hash mismatch: ${path}`);
  const cases = [];
  for (const record of index.records) {
    const original = inventory.records.find(item => item.id === record.id)!;
    const sourceImageSha256 = hash(await readFile(at(record.sourceImage)));
    if (sourceImageSha256 !== record.sourceImageSha256 || sourceImageSha256 !== original.imageSha256) throw new Error(`source image hash mismatch: ${record.id}`);
    const image = await decodeImage(at(record.sourceImage)); const rgbaSha256 = hash(image.data);
    if (image.width !== original.width || image.height !== original.height) throw new Error(`resolution mismatch: ${record.id}`);
    const diagnostic = await measure(image, { columns: original.columns, rows: original.rows });
    if (hash(image.data) !== rgbaSha256) throw new Error(`RGBA changed during measurement: ${record.id}`);
    const decodedAgain = await decodeImage(at(record.sourceImage));
    if (hash(decodedAgain.data) !== rgbaSha256 || decodedAgain.width !== image.width || decodedAgain.height !== image.height || hash(await readFile(at(record.sourceImage))) !== sourceImageSha256) throw new Error(`source/RGBA changed: ${record.id}`);
    if (diagnostic.stage !== original.stage || !same(diagnostic.geometry, original.geometry)) throw new Error(`inventory result mismatch: ${record.id}`);
    const reference = investigation.cases.find(item => item.id === record.id);
    if (reference && (reference.sourceImageSha256 !== sourceImageSha256 || reference.rgbaSha256 !== rgbaSha256 || reference.stage !== diagnostic.stage || !same(reference.geometry, diagnostic.geometry))) throw new Error(`investigation result mismatch: ${record.id}`);
    cases.push({ id: record.id, columns: original.columns, rows: original.rows, scope: record.scope, sourceImageSha256, rgbaSha256, width: image.width, height: image.height, stage: diagnostic.stage, geometry: diagnostic.geometry, directRefinedPairCount: diagnostic.directRefinedPairCount, canonicalRefinedPairCount: diagnostic.canonicalRefinedPairCount, canonicalCandidateCount: diagnostic.canonicalCandidateCount, sourceSurvivorCount: diagnostic.sourceSurvivorCount, normalizedRgbaSha256: diagnostic.normalizedImage === null ? null : hash(diagnostic.normalizedImage.data) });
  }
  if (!same(codeHashes, await codeSnapshot())) throw new Error("code changed during measurement");
  for (const [key, path] of Object.entries({ index: paths.index, inventory: paths.inventory, investigation: paths.investigation, lockfile: "package-lock.json" })) if (hash(await readFile(at(path))) !== inputHashes[key]) throw new Error(`input changed: ${key}`);
  const git = (args: string[]) => { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
  const result = { schemaVersion: 1, status: "baseline-complete", capturedAt: new Date().toISOString(), environment: { node: process.version, os: `${platform()}-${release()}`, architecture: arch(), sharp: sharp.versions.sharp, libraries: sharp.versions }, git: { commit: git(["rev-parse", "HEAD"]), dirty: (git(["status", "--porcelain", "--untracked-files=all"]) ?? "unavailable") !== "" }, codeHashes, referenceCodeHashes, inputHashes, cases };
  await mkdir(dirname(at(paths.output)), { recursive: true });
  await writeFile(at(paths.output), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2); const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) { const key = args[i]; const value = args[i + 1]; if (!key || !["--index", "--inventory", "--investigation", "--output"].includes(key) || !value || values[key]) throw new Error("Invalid CLI arguments"); values[key] = value; }
  const index = values["--index"], inventory = values["--inventory"], investigation = values["--investigation"], output = values["--output"];
  if (!index || !inventory || !investigation || !output) throw new Error("Required: --index --inventory --investigation --output");
  captureBaseline({ index, inventory, investigation, output }).then(result => console.log(JSON.stringify({ status: result.status, cases: result.cases.length, output }))).catch(error => { console.error(error); process.exitCode = 1; });
}
