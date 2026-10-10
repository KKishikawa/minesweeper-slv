export const TEST_GROUPS = ["product", "formal", "holdout", "grid-compatibility", "recognition"] as const;

export type TestGroup = (typeof TEST_GROUPS)[number];

const explicitGroups: Readonly<Record<string, TestGroup>> = {
  "test/recognition/formal-runner.test.ts": "formal",
  "test/recognition/folds.test.ts": "holdout",
  "test/recognition/generated-bank.test.ts": "holdout",
  "test/recognition/browser-grid-resample.test.ts": "grid-compatibility",
  "test/recognition/browser-grid-fallback.test.ts": "grid-compatibility",
};

export function classifyTest(path: string): TestGroup | null {
  if (path.endsWith(".spike.test.ts")) return null;
  return explicitGroups[path] ?? (path.startsWith("test/recognition/") ? "recognition" : "product");
}

export function validatePartition(paths: readonly string[]): void {
  const unique = new Set(paths);
  if (unique.size !== paths.length) throw new Error("Duplicate test paths in CI partition");

  for (const path of Object.keys(explicitGroups)) {
    if (!unique.has(path)) throw new Error(`Missing explicit CI test: ${path}`);
  }

  const populated = new Set(paths.map(classifyTest));
  for (const group of TEST_GROUPS) {
    if (!populated.has(group)) throw new Error(`Empty CI test group: ${group}`);
  }
}
