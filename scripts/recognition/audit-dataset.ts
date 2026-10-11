import { auditCoverage, loadDataset } from "./dataset.js";

// Data curator command. This intentionally opens independent evaluation truth.
try {
  const manifestPath = process.argv[2] ?? "test/recognition/dataset/manifest.json";
  if (process.argv.length > 3) throw new Error("Usage: audit-dataset.ts [manifest-path]");
  const dataset = await loadDataset(process.cwd(), manifestPath);
  const report = { manifestSha256: dataset.manifestSha256, ...auditCoverage(dataset.fixtures) };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "ready-for-fixture-review" ? 0 : 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: "next-cell-recognition-blocked", issues: [{ code: "dataset-invalid", detail: error instanceof Error ? error.message : String(error) }] }, null, 2)}\n`);
  process.exitCode = 2;
}
