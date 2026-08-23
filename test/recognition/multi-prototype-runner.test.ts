import { describe, expect, it } from "vitest";

import {
  reportProgress,
  summarizeAdoption,
  summarizeEngine,
  type EngineCaseMeasurement,
} from "../../scripts/run-multi-prototype-spike.js";

function measurement(overrides: Partial<EngineCaseMeasurement> = {}): EngineCaseMeasurement {
  return {
    id: "fixture/source",
    kind: "source",
    gridFound: true,
    wrongCertainCells: 0,
    uncertainCells: 0,
    elapsedMs: 10,
    ...overrides,
  };
}

describe("multi-prototype spike summary", () => {
  it("writes a stable progress marker to the supplied stderr sink", () => {
    const lines: string[] = [];

    reportProgress("folds:start", (line) => lines.push(line));

    expect(lines).toEqual(["[multi-prototype-spike] folds:start"]);
  });

  it("keeps compatibility failure separate from Chromium adoption", () => {
    const chromium = summarizeEngine("chromium", [measurement()]);
    const firefox = summarizeEngine("firefox", [measurement({ wrongCertainCells: 1 })]);

    expect(chromium.formalPassed).toBe(true);
    expect(firefox.compatibility).toBe("not-guaranteed");
    expect(chromium.formalPassed).toBe(true);
  });

  it("distinguishes unavailable, limited, and guaranteed compatibility", () => {
    expect(summarizeEngine("webkit", [])).toMatchObject({
      formalPassed: false,
      compatibility: "not-run",
    });
    expect(summarizeEngine("firefox", [measurement({
      kind: "transformed",
      uncertainCells: 5,
    })])).toMatchObject({
      formalPassed: false,
      compatibility: "limited",
    });
    expect(summarizeEngine("sharp", [measurement({
      kind: "transformed",
      uncertainCells: 4,
    })])).toMatchObject({
      formalPassed: false,
      compatibility: "guaranteed",
    });
  });

  it("rejects when the candidate bank or any fold is missing", () => {
    const chromiumCases = [measurement()];

    expect(summarizeAdoption(false, chromiumCases, [true, true, true, true])).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
    expect(summarizeAdoption(true, chromiumCases, [true, true, false, true])).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
  });

  it("requires the complete sixteen-case Chromium matrix", () => {
    expect(summarizeAdoption(true, [measurement()], [true, true, true, true])).toEqual({
      decision: "multi-prototype-rejected",
      formalPassed: false,
    });
    expect(summarizeAdoption(
      true,
      Array.from({ length: 16 }, (_, index) => measurement({ id: `case-${index}` })),
      [true, true, true, true],
    )).toEqual({
      decision: "multi-prototype-adopted",
      formalPassed: true,
    });
  });
});
