import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  NoPassingThresholdError,
  generatePrototypeBank,
} from "../../scripts/recognition/generate-prototype-bank.js";
import { encodePrototypeBank } from "../../scripts/recognition/encode-prototype-bank.js";
import { decodePrototypeBank } from "../../src/recognition/prototype-bank-codec.js";

const temporaryDirectories: string[] = [];

async function temporaryOutputPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "prototype-bank-"));
  temporaryDirectories.push(directory);
  return join(directory, "prototype-bank.ts");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("final prototype bank generation", () => {
  it("reproduces a passing candidate or records deterministic rejection without output", async () => {
    const firstOutputPath = await temporaryOutputPath();
    const secondOutputPath = await temporaryOutputPath();
    let firstSerialized;
    try {
      firstSerialized = await generatePrototypeBank({ outputPath: firstOutputPath });
    } catch (error) {
      expect(error).toBeInstanceOf(NoPassingThresholdError);
      if (!(error instanceof NoPassingThresholdError)) throw error;

      expect(error.candidate.thresholds).toBeNull();
      expect(error.candidate.bank).toBeNull();
      expect(error.candidate.calibration).toHaveLength(238);
      expect(error.candidate.evaluationCases.map((evaluationCase) => evaluationCase.id)).toEqual([
        "0:source", "0:canvas-scale-075", "0:canvas-scale-125", "0:canvas-jpeg-q75",
        "1:source", "1:canvas-scale-075", "1:canvas-scale-125", "1:canvas-jpeg-q75",
        "2:source", "2:canvas-scale-075", "2:canvas-scale-125", "2:canvas-jpeg-q75",
        "3:source", "3:canvas-scale-075", "3:canvas-scale-125", "3:canvas-jpeg-q75",
      ]);
      expect(error.candidate.evaluationCases
        .filter((evaluationCase) => !evaluationCase.gridFound)
        .map((evaluationCase) => evaluationCase.id)).toEqual([
        "1:canvas-scale-075", "1:canvas-scale-125",
        "2:canvas-scale-075", "2:canvas-scale-125",
        "3:canvas-scale-075",
      ]);
      expect(error.candidate.evaluationCases.every((evaluationCase) => evaluationCase.correctCells === 0
        && evaluationCase.wrongCertainCells === 0
        && evaluationCase.uncertainCells === 480)).toBe(true);
      await expect(access(firstOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(secondOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
      return;
    }

    {
      const secondSerialized = await generatePrototypeBank({ outputPath: secondOutputPath });
      const firstModule = await readFile(firstOutputPath, "utf8");
      const secondModule = await readFile(secondOutputPath, "utf8");

      expect(secondSerialized).toEqual(firstSerialized);
      expect(secondModule).toBe(firstModule);
      expect(Math.max(...firstSerialized.prototypeCounts)).toBeLessThanOrEqual(12);
      expect(firstSerialized.labels).not.toContain(7);
      expect(firstSerialized.labels).not.toContain(8);
      expect(encodePrototypeBank(decodePrototypeBank(firstSerialized))).toEqual(firstSerialized);
    }
  }, 180_000);
});
