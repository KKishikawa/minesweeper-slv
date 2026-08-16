import { lstat, mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

function isMissingPath(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing artifact directory outside repository root: ${candidate}`);
  }
}

function assertSimplePathParts(relativeParts: readonly string[]): void {
  if (relativeParts.length === 0) throw new Error("Artifact directory must be below the repository root.");
  for (const part of relativeParts) {
    if (part === "" || part === "." || part === ".." || path.isAbsolute(part) || path.basename(part) !== part) {
      throw new Error(`Artifact directory contains an unsafe path component: ${part}`);
    }
  }
}

export async function recreateArtifactDirectory(
  repositoryRoot: string,
  relativeParts: readonly string[],
): Promise<string> {
  assertSimplePathParts(relativeParts);
  const lexicalRoot = path.resolve(repositoryRoot);
  const lexicalTarget = path.resolve(lexicalRoot, ...relativeParts);
  assertContained(lexicalRoot, lexicalTarget);
  if (lexicalTarget === lexicalRoot) throw new Error("Artifact directory must be below the repository root.");

  const rootStatus = await lstat(lexicalRoot);
  if (rootStatus.isSymbolicLink()) {
    throw new Error(`Refusing artifact directory below symbolic link component: ${lexicalRoot}`);
  }
  const realRoot = await realpath(lexicalRoot);
  let current = lexicalRoot;
  let pathExists = true;
  for (const part of relativeParts) {
    current = path.join(current, part);
    if (!pathExists) continue;
    try {
      const status = await lstat(current);
      if (status.isSymbolicLink()) {
        throw new Error(`Refusing artifact directory below symbolic link component: ${current}`);
      }
      assertContained(realRoot, await realpath(current));
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      pathExists = false;
    }
  }

  await rm(lexicalTarget, { recursive: true, force: true });
  await mkdir(lexicalTarget, { recursive: true });
  assertContained(realRoot, await realpath(lexicalTarget));
  return lexicalTarget;
}
