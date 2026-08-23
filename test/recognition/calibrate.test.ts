import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_DISTANCE_CANDIDATES,
  evaluateThresholdPairs,
  RELATIVE_MARGIN_CANDIDATES,
  selectThresholdPair,
  type CalibrationCase,
  type ThresholdPair,
} from "../../scripts/recognition/calibrate.js";

const casesWithError: readonly CalibrationCase[] = [{
  id: "source-a",
  kind: "source",
  cells: [
    { correct: true, relativeMargin: 0.8, bestDistance: 0.5 },
    { correct: false, relativeMargin: 0.2, bestDistance: 8 },
  ],
}];

const tieCases: readonly CalibrationCase[] = [{
  id: "transformed-a",
  kind: "transformed",
  cells: [{ correct: true, relativeMargin: 0.8, bestDistance: 0.5 }],
}];

describe("threshold calibration", () => {
  it("selects only pairs with zero wrong certain cells", () => {
    const pairs = [
      { relativeMargin: 0.1, absoluteDistance: 16 },
      { relativeMargin: 0.5, absoluteDistance: 2 },
    ] as const;
    const evaluations = evaluateThresholdPairs(casesWithError, pairs);
    expect(evaluations[0]?.wrongCertainCells).toBe(1);
    expect(evaluations[1]?.wrongCertainCells).toBe(0);
  });

  it("uses inclusive relative-margin and absolute-distance certainty boundaries", () => {
    const cases: readonly CalibrationCase[] = [{
      id: "boundaries",
      kind: "source",
      cells: [
        { correct: false, relativeMargin: 0.5, bestDistance: 2 },
        { correct: true, relativeMargin: 0.5, bestDistance: 2 },
        { correct: true, relativeMargin: 0.49, bestDistance: 2 },
        { correct: true, relativeMargin: 0.5, bestDistance: 2.01 },
      ],
    }];
    const evaluation = evaluateThresholdPairs(cases, [{ relativeMargin: 0.5, absoluteDistance: 2 }])[0]!;
    expect(evaluation).toMatchObject({
      wrongCertainCells: 1,
      uncertainSourceCells: 2,
      totalUncertainCells: 2,
      maximumUncertainCells: 0,
      passes: false,
    });
  });

  it("uses deterministic uncertainty and threshold tie breaking", () => {
    const selected = selectThresholdPair(tieCases, [
      { relativeMargin: 0.5, absoluteDistance: 4 },
      { relativeMargin: 0.5, absoluteDistance: 2 },
    ]);
    expect(selected).toEqual({ relativeMargin: 0.5, absoluteDistance: 4 });
  });

  it("sorts by maximum uncertainty, then total uncertainty, then lower margin, then higher distance", () => {
    const cases: readonly CalibrationCase[] = [
      {
        id: "source",
        kind: "source",
        cells: [{ correct: true, relativeMargin: 0.6, bestDistance: 6 }],
      },
      {
        id: "transformed-a",
        kind: "transformed",
        cells: [
          { correct: true, relativeMargin: 0.6, bestDistance: 6 },
          { correct: true, relativeMargin: 0.6, bestDistance: 6 },
        ],
      },
      {
        id: "transformed-b",
        kind: "transformed",
        cells: [{ correct: true, relativeMargin: 0.6, bestDistance: 6 }],
      },
    ];
    const pairs: readonly ThresholdPair[] = [
      { relativeMargin: 0.5, absoluteDistance: 5 },
      { relativeMargin: 0.4, absoluteDistance: 5 },
      { relativeMargin: 0.6, absoluteDistance: 7 },
      { relativeMargin: 0.6, absoluteDistance: 6 },
    ];
    expect(selectThresholdPair(cases, pairs)).toEqual({ relativeMargin: 0.6, absoluteDistance: 7 });
  });

  it("prefers lower total uncertainty when maximum uncertainty ties", () => {
    const cases: readonly CalibrationCase[] = [{
      id: "transformed-a",
      kind: "transformed",
      cells: [
        { correct: true, relativeMargin: 0.3, bestDistance: 2 },
        { correct: true, relativeMargin: 0.3, bestDistance: 2 },
      ],
    }, {
      id: "transformed-b",
      kind: "transformed",
      cells: [
        { correct: true, relativeMargin: 0.3, bestDistance: 2 },
        { correct: true, relativeMargin: 0.5, bestDistance: 0.75 },
      ],
    }];
    expect(selectThresholdPair(cases, [
      { relativeMargin: 0.5, absoluteDistance: 1 },
      { relativeMargin: 0.4, absoluteDistance: 0.5 },
    ])).toEqual({ relativeMargin: 0.5, absoluteDistance: 1 });
  });

  it("prefers lower maximum transformed uncertainty first", () => {
    const cases: readonly CalibrationCase[] = [{
      id: "transformed",
      kind: "transformed",
      cells: [
        { correct: true, relativeMargin: 0.5, bestDistance: 1 },
        { correct: true, relativeMargin: 0.6, bestDistance: 1 },
      ],
    }];
    expect(selectThresholdPair(cases, [
      { relativeMargin: 0.7, absoluteDistance: 1 },
      { relativeMargin: 0.6, absoluteDistance: 1 },
    ])).toEqual({ relativeMargin: 0.6, absoluteDistance: 1 });
  });

  it("prefers lower relative margin and then higher distance after uncertainty ties", () => {
    const cases: readonly CalibrationCase[] = [{
      id: "transformed",
      kind: "transformed",
      cells: [{ correct: true, relativeMargin: 0.8, bestDistance: 0.5 }],
    }];
    expect(selectThresholdPair(cases, [
      { relativeMargin: 0.6, absoluteDistance: 1 },
      { relativeMargin: 0.5, absoluteDistance: 0.5 },
      { relativeMargin: 0.5, absoluteDistance: 1 },
    ])).toEqual({ relativeMargin: 0.5, absoluteDistance: 1 });
  });

  it("applies source and transformed uncertainty budgets separately", () => {
    const cases: readonly CalibrationCase[] = [{
      id: "source",
      kind: "source",
      cells: [{ correct: true, relativeMargin: 0, bestDistance: 1 }],
    }, {
      id: "transformed",
      kind: "transformed",
      cells: [
        { correct: true, relativeMargin: 0, bestDistance: 1 },
        { correct: true, relativeMargin: 0, bestDistance: 1 },
        { correct: true, relativeMargin: 0, bestDistance: 1 },
        { correct: true, relativeMargin: 0, bestDistance: 1 },
        { correct: true, relativeMargin: 0, bestDistance: 1 },
      ],
    }];
    const evaluation = evaluateThresholdPairs(cases, [{ relativeMargin: 1, absoluteDistance: 0 }])[0]!;
    expect(evaluation).toMatchObject({
      wrongCertainCells: 0,
      uncertainSourceCells: 1,
      totalUncertainCells: 6,
      maximumUncertainCells: 5,
      passes: false,
    });

    const transformedWithinBudget = evaluateThresholdPairs([{
      ...cases[1]!,
      cells: cases[1]!.cells.slice(0, 4),
    }], [{ relativeMargin: 1, absoluteDistance: 0 }])[0]!;
    expect(transformedWithinBudget.passes).toBe(true);
  });

  it("returns null when no pair passes", () => {
    expect(selectThresholdPair(casesWithError, [{ relativeMargin: 0, absoluteDistance: 16 }])).toBeNull();
  });

  it("rejects malformed and non-finite cases and pairs", () => {
    const validPair = { relativeMargin: 0.5, absoluteDistance: 1 };
    const validCase: CalibrationCase = {
      id: "valid",
      kind: "source",
      cells: [{ correct: true, relativeMargin: 0.5, bestDistance: 1 }],
    };
    const invalidCases: readonly unknown[] = [
      null,
      [{ id: "", kind: "source", cells: [] }],
      [{ id: "case", kind: "derivative", cells: [] }],
      [{ id: "case", kind: "source", cells: [{ correct: 1, relativeMargin: 0.5, bestDistance: 1 }] }],
      [{ id: "case", kind: "source", cells: [{ correct: true, relativeMargin: Number.NaN, bestDistance: 1 }] }],
      [{ id: "case", kind: "source", cells: [{ correct: true, relativeMargin: 0.5, bestDistance: Number.POSITIVE_INFINITY }] }],
    ];
    for (const cases of invalidCases) {
      expect(() => evaluateThresholdPairs(cases as never, [validPair])).toThrow(RangeError);
    }

    const invalidPairs: readonly unknown[] = [
      null,
      [{ relativeMargin: -Number.EPSILON, absoluteDistance: 1 }],
      [{ relativeMargin: 1 + Number.EPSILON, absoluteDistance: 1 }],
      [{ relativeMargin: Number.NaN, absoluteDistance: 1 }],
      [{ relativeMargin: 0.5, absoluteDistance: -Number.EPSILON }],
      [{ relativeMargin: 0.5, absoluteDistance: Number.POSITIVE_INFINITY }],
      [{ relativeMargin: 0.5 }],
    ];
    for (const pairs of invalidPairs) {
      expect(() => evaluateThresholdPairs([validCase], pairs as never)).toThrow(RangeError);
    }
  });

  it("exposes the exact fixed candidate arrays and stable Cartesian order", () => {
    expect(RELATIVE_MARGIN_CANDIDATES).toEqual([
      0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95,
    ]);
    expect(ABSOLUTE_DISTANCE_CANDIDATES).toEqual([
      0.015625, 0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024,
    ]);

    const evaluations = evaluateThresholdPairs([], undefined);
    expect(evaluations).toHaveLength(14 * 17);
    expect(evaluations.slice(0, 3)).toEqual([
      { relativeMargin: 0, absoluteDistance: 0.015625, wrongCertainCells: 0, uncertainSourceCells: 0,
        totalUncertainCells: 0, maximumUncertainCells: 0, passes: true },
      { relativeMargin: 0, absoluteDistance: 0.03125, wrongCertainCells: 0, uncertainSourceCells: 0,
        totalUncertainCells: 0, maximumUncertainCells: 0, passes: true },
      { relativeMargin: 0, absoluteDistance: 0.0625, wrongCertainCells: 0, uncertainSourceCells: 0,
        totalUncertainCells: 0, maximumUncertainCells: 0, passes: true },
    ]);
    expect(evaluations.at(-1)).toMatchObject({ relativeMargin: 0.95, absoluteDistance: 1024 });
  });
});
