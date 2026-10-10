import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function allJobsSucceeded(
  results: Readonly<Record<string, string>>,
  expectedJobs: readonly string[],
): boolean {
  return expectedJobs.length > 0
    && new Set(expectedJobs).size === expectedJobs.length
    && Object.keys(results).length === expectedJobs.length
    && expectedJobs.every((job) => Object.hasOwn(results, job) && results[job] === "success");
}

function checkNeeds(json: string | undefined): boolean {
  if (json === undefined) return false;
  const needs: unknown = JSON.parse(json);
  if (typeof needs !== "object" || needs === null || Array.isArray(needs)) return false;
  const results: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [job, value] of Object.entries(needs)) {
    if (typeof value !== "object" || value === null || !("result" in value) || typeof value.result !== "string") {
      return false;
    }
    results[job] = value.result;
  }
  return allJobsSucceeded(results, ["regression"]);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  try {
    process.exitCode = checkNeeds(process.env.CI_NEEDS) ? 0 : 1;
  } catch {
    process.exitCode = 1;
  }
  if (process.exitCode !== 0) console.error("Required regression jobs did not all succeed.");
}
