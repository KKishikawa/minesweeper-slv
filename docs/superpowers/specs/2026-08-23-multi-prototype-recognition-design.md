# Multi-Prototype Cell Recognition Redesign

## Status and Purpose

The first recognition spike established reliable grid detection and perfect classification for the four native source images, but its single-prototype classifier produced 32 high-confidence errors after resizing or JPEG recompression. This redesign evaluates whether a deterministic multi-prototype classifier can remove those errors without introducing a trained neural model, fixture-specific runtime branches, or relaxed acceptance criteria.

This is a gated recognition subproject. A successful result permits a later product implementation plan to adopt the classifier. It does not authorize work on the product UI, solver integration, screen capture, clipboard handling, or file import.

## Goals

- Classify the currently observed cell labels `closed`, `empty`, `flag`, and digits 1 through 6.
- Preserve the existing RGBA-only recognition core, grid detector, cell geometry, normalization, and feature extraction unless a regression proves a narrowly scoped correction is necessary.
- Replace one prototype per label with a deterministic bank of at most 12 prototypes per label.
- Use one prototype bank and one pair of confidence thresholds for every formally evaluated Chromium case.
- Return no wrong cell as a certain result.
- Limit uncertain cells to at most four per 30 by 16 board.
- Evaluate generalization by holding out complete source screens rather than mixing cells from the same screen between prototype generation and evaluation.
- Measure Firefox, WebKit, and non-browser image-transform compatibility without allowing those results to override the Chromium adoption decision.

## Non-Goals

- A neural network, bundled learned model, remote inference service, OpenCV.js, or OS-specific image API.
- Recognition guarantees for digits 7 and 8, other game themes, rotations, perspective distortion, or arbitrary compression and scaling.
- Automatic board-dimension or remaining-mine inference. User-entered columns, rows, and total mines remain authoritative.
- Product UI, capture, paste, upload, solver, or flag-reconsideration implementation.

## Supported and Evaluated Scope

The formal dataset remains the four independently labeled 30 by 16 source boards. The classifier is evaluated on their observed labels only. Digits 7 and 8 have no verified examples, so they are unsupported and unverified. An absolute-distance rejection rule may mark unfamiliar cells uncertain, but the project must not claim that it can reliably recognize or reject digits 7 and 8 until verified examples exist.

Formal adoption is based on the four source images and twelve derivatives produced through a real Chromium Canvas path:

- source image at native size;
- Canvas resize to 0.75 times the source dimensions;
- Canvas resize to 1.25 times the source dimensions;
- Canvas JPEG encoding at quality 0.75.

Firefox and Playwright WebKit run the same evaluation as a compatibility survey. Playwright WebKit is not described as Safari itself. Existing deterministic Sharp/Lanczos3 derivatives remain a non-browser resilience survey. Failures in these compatibility and resilience surveys restrict the documented guarantee range but do not change a passing or failing Chromium adoption result.

## Recognition Architecture

The data flow is:

```text
RGBA image
  -> grid detection
  -> row-major cell crops
  -> 16 by 16 normalization
  -> feature extraction
  -> global feature scaling
  -> per-label prototype distances
  -> label-level candidate ranking
  -> confidence and absolute-distance gates
  -> recognized / needs-review / grid-not-found
```

Grid detection, cell cropping, normalization, and feature extraction remain independent modules. Product runtime code consumes only an RGBA image, user-entered dimensions, and a generated prototype bank. It never receives fixture identifiers, file paths, expected labels, or browser-engine identifiers.

## Deterministic Prototype Bank

### Input and output

The bank generator consumes verified feature samples from source images only. It emits:

- one global feature center and scale vector;
- zero to twelve prototypes for each observed label;
- stable label and prototype ordering;
- format and feature-version identifiers;
- a deterministic content hash used by drift tests.

The generated bank is committed as a small JSON or TypeScript data artifact suitable for conversion to typed arrays. The browser does not generate or update prototypes at runtime.

### Global feature scaling

Each feature is centered and scaled using statistics calculated across all training samples, regardless of label. Every scale is clamped to a named positive floor. This shared coordinate system replaces label-specific variance weighting, whose incomparable label scales contributed to the previous digit-to-flag errors.

The same fitted center and scale are applied to training samples and runtime cells. Leave-one-screen-out folds fit scaling from the three training screens only.

### Prototype generation

Prototypes are created independently per label in globally scaled feature space:

1. Select the first center using a stable sample ordering.
2. Select subsequent centers by deterministic farthest-point initialization.
3. Run a fixed number of assignment and centroid-update iterations.
4. Stop before twelve centers when no distinct center remains.
5. Sort final centers deterministically and serialize finite values only.

No random seed, filename rule, fixture exception, label-specific threshold, or progress-state branch is permitted. A label with no training examples produces no prototype.

## Runtime Classification and Confidence

For each cell, runtime classification computes the normalized squared distance to every prototype. Prototypes with the same label are reduced to that label's minimum distance. Candidate labels are then sorted by distance, so two prototypes from the same label cannot occupy both first and second place or inflate confidence.

A cell is certain only when both conditions pass:

- the margin between the best and second-best label distances meets one shared relative-margin threshold;
- the best distance meets one shared absolute-distance threshold.

Both thresholds are calibrated offline and embedded with the bank. They are global: no image-, fixture-, browser-, cell-position-, or label-specific thresholds are allowed. Missing prototypes, non-finite features, fewer than two candidate labels, or a failed threshold produce an uncertain cell rather than a forced label.

The public board result retains three states:

- `recognized`: the grid exists and no cell is uncertain;
- `needs-review`: the grid exists and at least one cell is uncertain;
- `grid-not-found`: no acceptable grid exists and no cells are returned.

## Evaluation Design

### Final-bank evaluation

Build the candidate product bank from all four source screens, then evaluate all sixteen formal Chromium cases. Every case uses the same serialized bank and thresholds.

### Leave-one-screen-out evaluation

Run four folds. In each fold:

1. Exclude one complete source screen.
2. Fit global scaling and prototypes using the other three source screens only.
3. Calibrate thresholds with those training screens and their Chromium derivatives only.
4. Evaluate the held-out source and its Chromium derivatives.
5. Record labels absent from that fold's training set rather than silently importing their samples.

This split prevents cells from one screen from appearing on both sides of a fold. With only four screens it does not establish broad generalization; it is a stronger internal overfitting check within the available data.

### Threshold selection

Evaluate a fixed, documented grid of relative-margin and absolute-distance threshold pairs. Among passing pairs, select deterministically by lowest maximum uncertainty per image, then lowest total uncertainty, then a documented threshold tie-break order. If no pair passes, record a mandatory failure. Do not change labels, truth data, prototype limits, candidate order, or acceptance counts after observing individual fixture failures.

## Browser and Transform Matrix

Chromium is the formal decision engine. Browser derivatives must be generated by browser APIs in the evaluated engine, using decoded source pixels, Canvas `drawImage`, and Canvas JPEG encoding. Generated dimensions, browser versions, encoding parameters, and pixel hashes are recorded with the artifacts.

Firefox and Playwright WebKit use equivalent browser scripts and produce an informational compatibility matrix:

- `guaranteed`: all engine cases meet the formal cell conditions;
- `limited`: the engine has no wrong certain cells but exceeds the uncertainty limit or has unevaluated paths;
- `not-guaranteed`: at least one wrong certain cell or required grid failure occurs.

Sharp/Lanczos3 cases are reported separately as non-browser resilience results and never labeled as browser Canvas output.

## Acceptance and Decision Rules

The multi-prototype design is adopted only when both the final-bank Chromium evaluation and all leave-one-screen-out folds satisfy:

- every expected grid is detected;
- zero wrong certain cells;
- no uncertain source cells in the final-bank evaluation;
- at most four uncertain cells in each transformed final-bank image;
- at most four uncertain cells in every held-out fold image, including a held-out source whose label is absent from that fold's training set;
- one shared prototype bank and threshold pair within each evaluation;
- no fixture-specific runtime branch;
- no prototype count above twelve for any label;
- deterministic bank regeneration with no byte-level drift.

The runner records recognition time for every 30 by 16 board. Timing does not change classification results. The report must flag performance concerns before product planning, particularly if prototype comparisons make interactive desktop use impractical.

Decision identifiers are:

- `multi-prototype-adopted`: every formal acceptance condition passes;
- `multi-prototype-rejected`: at least one formal condition fails;

Compatibility survey failures do not convert a Chromium pass into rejection. They only narrow the documented browser guarantee range.

## Artifacts and Diagnostics

The evaluator writes ignored artifacts under the recognition artifact directory only:

- serialized generated banks and hashes;
- per-case JSON with geometry, candidates, certainty, correctness, and elapsed time;
- overlays for every formal and compatibility case;
- fold summaries;
- Chromium adoption summary;
- Firefox, WebKit, and Sharp compatibility summaries.

Cleanup must continue to reject unsafe paths and symbolic-link ancestors. Artifact generation must not mutate committed fixtures or truth data.

## Error Handling and Safety

- Invalid image shapes, invalid dimensions, incompatible bank versions, non-finite bank values, and malformed feature lengths fail explicitly.
- Candidate ambiguity produces `needs-review`, not a guessed certain result.
- A work-budget overflow in grid detection remains a safe `grid-not-found` result.
- Runtime classification does not branch on elapsed time.
- All recognition and prototype generation are local. No image, feature vector, or fixture content leaves the browser or test process.

## Coverage Limits

Even a passing spike supports only the recorded visual theme and evaluated transforms. It does not prove recognition of digits 7 and 8, digit 6 under additional unseen scanline patterns, other board sizes, other themes, rotations, perspective changes, or arbitrary resampling and compression. Other board sizes may be structurally supported by the grid API but remain unverified.

## Follow-up Gate

After the spike report is reviewed, update the product implementation plan only if the decision is `multi-prototype-adopted`. A rejection returns to recognition design. Neither result starts product UI, solver, or capture integration automatically.
