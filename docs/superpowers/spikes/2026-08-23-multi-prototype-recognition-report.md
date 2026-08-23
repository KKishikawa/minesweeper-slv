# Multi-Prototype Recognition Spike Report

## Decision

multi-prototype-rejected

## Environment

- Platform: darwin arm64
- Node.js: v24.18.0
- Playwright: 1.62.1
- Sharp: 0.35.3
- Chromium: 151.0.7922.34

## Prototype Bank

Prototype counts by label: `closed:12, empty:12, flag:12, 1:12, 2:12, 3:12, 4:12, 5:2, 6:2`. Thresholds: `null`. Bank SHA-256: `null`. Calibration evaluated 238 threshold pairs; 144 passed the available complete cases. The full matrix remained incomplete because 5 required cases had no grid.

## Chromium Formal Results

`formalPassed: false`. Candidate grid failures:

- `1:canvas-scale-075`
- `1:canvas-scale-125`
- `2:canvas-scale-075`
- `2:canvas-scale-125`
- `3:canvas-scale-075`

All 16 final-candidate cases include measured `elapsedMs` values in the generated summary.

## Whole-Screen Holdout Results

| Held out | Prototype counts | Absent labels | Threshold | Pass |
| --- | --- | --- | --- | --- |
| `0` | `[12,12,12,12,12,12,12,2,2]` | `7,8` | `null` | false |
| `1` | `[12,12,12,12,12,12,7,1,2]` | `7,8` | `null` | false |
| `2` | `[12,12,12,12,12,12,12,2,2]` | `7,8` | `null` | false |
| `3` | `[12,12,12,12,12,11,5,1]` | `6,7,8` | `null` | false |

## Compatibility Matrix

| Engine | Role | Result |
| --- | --- | --- |
| chromium | formal | `not-run` |
| firefox | informational | `not-run` |
| webkit | informational | `not-run` |
| sharp | informational | `not-run` |

Playwright WebKit is not Safari and does not provide a Safari compatibility guarantee.

## Visual Inspection

Engine overlays were not generated because no thresholded bank existed. Passing-bank overlay inspection is deferred.

## Performance

Candidate build elapsed: 12726.000 ms. Fold evaluation elapsed: not measured. Total runner elapsed: 48889.000 ms.

Recorded case min/median/max: 60.532 ms / 462.845 ms / 696.938 ms. Candidate-case min/median/max: not measured / not measured / not measured. Fold-case min/median/max: not measured / not measured / not measured. Evaluated-engine min/median/max: not measured / not measured / not measured.

## Coverage Limits

- Digits 7 and 8 remain unsupported and unverified.
- Firefox, Playwright WebKit, and Sharp compatibility never override Chromium adoption.
- User-entered columns, rows, and total mines remain authoritative.
- Passing-bank overlays were unavailable, so their required visual inspection is deferred.

## Follow-up

Improve grid detection for the 5 rejected Chromium derivatives.
