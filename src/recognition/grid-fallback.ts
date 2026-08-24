import { GridRefinementBudget } from "./grid-budget.js";
import { estimateCanonicalPitch, type CoarsePitchEvidence } from "./grid-evidence.js";
import {
  canonicalScale,
  resampleCanonicalGridImage,
} from "./grid-resample.js";
import {
  detectStrictGridAttempt,
  revalidateMappedCandidate,
  type GridBoundaryCandidate,
  type GridDimensions,
  type SourceGridValidationContext,
  type StrictGridAttempt,
} from "./grid-strict.js";
import type { GridGeometry, PixelImage } from "./types.js";

export interface CanonicalFallbackOperations {
  readonly strictAttempt: (
    image: PixelImage,
    dimensions: GridDimensions,
    budget: GridRefinementBudget,
  ) => StrictGridAttempt;
  readonly estimatePitch: (evidence: CoarsePitchEvidence) => number | null;
  readonly resample: (image: PixelImage, scale: number) => PixelImage;
  readonly revalidate: (
    source: PixelImage,
    dimensions: GridDimensions,
    sourceContext: SourceGridValidationContext,
    candidate: GridBoundaryCandidate,
    scale: number,
    observedPitch: number,
  ) => GridGeometry | null;
}

export interface GridDetectionDiagnosticResult {
  readonly geometry: GridGeometry | null;
  readonly stage:
    | "direct"
    | "hint-rejected"
    | "normalization-rejected"
    | "canonical-rejected"
    | "source-revalidation-rejected"
    | "budget-exhausted"
    | "fallback";
  readonly directRefinedPairCount: number;
  readonly canonicalRefinedPairCount: number;
  readonly canonicalCandidateCount: number;
  readonly sourceSurvivorCount: number;
  readonly normalizedImage: PixelImage | null;
}

function diagnostic(
  geometry: GridGeometry | null,
  stage: GridDetectionDiagnosticResult["stage"],
  directRefinedPairCount: number,
  canonicalRefinedPairCount: number,
  canonicalCandidateCount: number,
  sourceSurvivorCount: number,
  normalizedImage: PixelImage | null,
): GridDetectionDiagnosticResult {
  return {
    geometry,
    stage,
    directRefinedPairCount,
    canonicalRefinedPairCount,
    canonicalCandidateCount,
    sourceSurvivorCount,
    normalizedImage,
  };
}

function revalidateCandidates(
  image: PixelImage,
  dimensions: GridDimensions,
  sourceContext: SourceGridValidationContext,
  candidates: readonly GridBoundaryCandidate[],
  scale: number,
  observedPitch: number,
  revalidate: CanonicalFallbackOperations["revalidate"],
): { readonly geometry: GridGeometry | null; readonly survivorCount: number } {
  const survivors = candidates
    .map((candidate) => revalidate(
      image,
      dimensions,
      sourceContext,
      candidate,
      scale,
      observedPitch,
    ))
    .filter((geometry): geometry is GridGeometry => geometry !== null);
  return {
    geometry: survivors.length === 1 ? survivors[0]! : null,
    survivorCount: survivors.length,
  };
}

export function detectGridDirectFirst(
  image: PixelImage,
  dimensions: GridDimensions,
  operations: CanonicalFallbackOperations,
  budget: GridRefinementBudget = new GridRefinementBudget(),
): GridDetectionDiagnosticResult {
  const direct = operations.strictAttempt(image, dimensions, budget);
  if (direct.status === "found") {
    return diagnostic(direct.geometry, "direct", direct.refinedPairCount, 0, 0, 0, null);
  }
  if (direct.status === "budget-exhausted") {
    return diagnostic(null, "budget-exhausted", direct.refinedPairCount, 0, 0, 0, null);
  }
  if (direct.coarseEvidence === null) {
    return diagnostic(null, "hint-rejected", direct.refinedPairCount, 0, 0, 0, null);
  }

  const observedPitch = operations.estimatePitch(direct.coarseEvidence);
  if (observedPitch === null) {
    return diagnostic(null, "hint-rejected", direct.refinedPairCount, 0, 0, 0, null);
  }
  if (direct.sourceContext === null) {
    return diagnostic(null, "source-revalidation-rejected", direct.refinedPairCount, 0, 0, 0, null);
  }

  let scale: number;
  let normalizedImage: PixelImage;
  try {
    scale = canonicalScale(observedPitch);
    normalizedImage = operations.resample(image, scale);
  } catch {
    return diagnostic(null, "normalization-rejected", direct.refinedPairCount, 0, 0, 0, null);
  }

  const canonical = operations.strictAttempt(normalizedImage, dimensions, budget);
  if (canonical.status === "budget-exhausted") {
    return diagnostic(null, "budget-exhausted", direct.refinedPairCount, canonical.refinedPairCount, 0, 0, normalizedImage);
  }
  const canonicalCandidateCount = canonical.candidates.length;
  if (
    (canonical.status !== "found" && canonical.status !== "ambiguous")
    || canonicalCandidateCount < 1
    || canonicalCandidateCount > 8
  ) {
    return diagnostic(
      null,
      "canonical-rejected",
      direct.refinedPairCount,
      canonical.refinedPairCount,
      canonicalCandidateCount,
      0,
      normalizedImage,
    );
  }

  const revalidation = revalidateCandidates(
    image,
    dimensions,
    direct.sourceContext,
    canonical.candidates,
    scale,
    observedPitch,
    operations.revalidate,
  );
  if (revalidation.geometry === null) {
    return diagnostic(
      null,
      "source-revalidation-rejected",
      direct.refinedPairCount,
      canonical.refinedPairCount,
      canonicalCandidateCount,
      revalidation.survivorCount,
      normalizedImage,
    );
  }
  return diagnostic(
    revalidation.geometry,
    "fallback",
    direct.refinedPairCount,
    canonical.refinedPairCount,
    canonicalCandidateCount,
    revalidation.survivorCount,
    normalizedImage,
  );
}

const productionOperations: CanonicalFallbackOperations = {
  strictAttempt: detectStrictGridAttempt,
  estimatePitch: estimateCanonicalPitch,
  resample: resampleCanonicalGridImage,
  revalidate: revalidateMappedCandidate,
};

export function detectGridWithDiagnostics(
  image: PixelImage,
  dimensions: GridDimensions,
): GridDetectionDiagnosticResult {
  return detectGridDirectFirst(
    image,
    dimensions,
    productionOperations,
    new GridRefinementBudget(20_000),
  );
}
