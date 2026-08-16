import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { recreateArtifactDirectory } from "../../scripts/artifact-directory.js";

const artifactParts = ["test", "artifacts", "recognition"] as const;

describe("recognition artifact directory", () => {
  it("rejects an ancestor symlink without touching its external target", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "recognition-artifact-symlink-"));
    try {
      const repositoryRoot = path.join(temporaryRoot, "repository");
      const externalDirectory = path.join(temporaryRoot, "external");
      const sentinelPath = path.join(externalDirectory, "sentinel.txt");
      await mkdir(path.join(repositoryRoot, "test"), { recursive: true });
      await mkdir(externalDirectory, { recursive: true });
      await writeFile(sentinelPath, "keep", "utf8");
      await symlink(externalDirectory, path.join(repositoryRoot, "test", "artifacts"), "dir");

      await expect(recreateArtifactDirectory(repositoryRoot, artifactParts)).rejects.toThrow(/symbolic link/i);
      await expect(readFile(sentinelPath, "utf8")).resolves.toBe("keep");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("cleans and recreates a normal explicit artifact directory", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "recognition-artifact-normal-"));
    try {
      const repositoryRoot = path.join(temporaryRoot, "repository");
      const artifactDirectory = path.join(repositoryRoot, ...artifactParts);
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(path.join(artifactDirectory, "old.json"), "stale", "utf8");

      await expect(recreateArtifactDirectory(repositoryRoot, artifactParts)).resolves.toBe(artifactDirectory);
      await expect(readdir(artifactDirectory)).resolves.toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
