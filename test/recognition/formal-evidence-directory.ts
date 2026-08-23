import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createFormalEvidenceDirectory(
  requestedDirectory: string | undefined,
): Promise<{ readonly directory: string; readonly cleanup: boolean }> {
  if (requestedDirectory !== undefined) {
    await mkdir(requestedDirectory);
    return { directory: requestedDirectory, cleanup: false };
  }
  return {
    directory: await mkdtemp(path.join(tmpdir(), "formal-recognition-runner-")),
    cleanup: true,
  };
}
