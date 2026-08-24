import { luminance } from "./pixels.js";
import type { CoarsePitchEvidence } from "./grid-evidence.js";
import type { GridRefinementBudget } from "./grid-budget.js";
import type { GridGeometry, PixelImage } from "./types.js";

const MIN_CELL_PITCH = 8;
const ROW_SMOOTHING_SPAN = 2;
const BOUNDARY_REFINEMENT_RADIUS = 2;
const EDGE_PHASE_COMPATIBILITY_RADIUS = 1;
const MIN_CANONICAL_LEADING_EDGE_RATIO = 0.3;
const MAX_CANONICAL_EDGE_SHOULDER_RATIO = 0.9;
const MIN_DOMINANT_CANONICAL_EDGE_RATIO = 3;
const VERTICAL_CANONICAL_LEADING_RADIUS = EDGE_PHASE_COMPATIBILITY_RADIUS;
const HORIZONTAL_CANONICAL_LEADING_RADIUS = BOUNDARY_REFINEMENT_RADIUS;
const LOCAL_ENERGY_RADIUS = 1;
const MAX_PITCH_DIFFERENCE_RATIO = 0.05;
const MIN_INTERSECTION_SUPPORT_RATIO = 0.9;
const MIN_SCORE_SEPARATION_RATIO = 0.05;
const MIN_COARSE_CANDIDATE_SCORE_RATIO = 0.65;
const MAX_AXIS_CANDIDATE_SEQUENCE_COUNT = 200_000;
const MAX_RETAINED_AXIS_CANDIDATES = 20_000;
const GRID_CANDIDATE_REFINEMENT_BUDGET = 20_000;
const COARSE_SCORE_BLEND_RATIO = 0.3;
const MIN_ABOVE_MEDIAN_LOCAL_ENERGY = 1.3;
const GRADIENT_HISTOGRAM_SCALE = 4;
const GRADIENT_HISTOGRAM_SIZE = 256 * GRADIENT_HISTOGRAM_SCALE;
const MIN_OUTER_BOUNDARY_DISTINCTIVENESS_RATIO = 1.1;
const MIN_OUTER_BOUNDARY_BALANCE_RATIO = 0.45;
const MIN_OUTER_BOUNDARY_ENERGY_RATIO = 1.3;
const MIN_RELATIVE_OUTER_BOUNDARY_ENERGY_RATIO = 0.97;
const MIN_RELATIVE_OUTER_BOUNDARY_BALANCE_RATIO = 0.92;
const MIN_RELATIVE_INTERSECTION_SUPPORT_RATIO = 0.97;
const MIN_COMPETING_EXTENT_OVERLAP_RATIO = 0.9;
const MIN_RELATIVE_RANGE_SCORE_FOR_LEADING_COMPARISON = 0.95;
const MIN_LEADING_INTERSECTION_SUPPORT_ADVANTAGE = 0.25;
const COARSE_OUTER_BOUNDARY_WEIGHT = 3;
const RANGE_OUTER_BOUNDARY_WEIGHT = 3;

export interface GridDimensions {
  readonly columns: number;
  readonly rows: number;
}
export interface EdgeProfiles {
  readonly smoothed: Float64Array;
  readonly vertical: Float64Array;
  readonly horizontal: Float64Array;
  readonly verticalLinePrefix: Float64Array;
  readonly horizontalLinePrefix: Float64Array;
  readonly verticalGradientMedian: number;
  readonly horizontalGradientMedian: number;
}

export interface ValidatedGridCandidate {
  readonly geometry: GridGeometry;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly rangeScore: number;
}

export interface SourceGridValidationContext {
  readonly profiles: EdgeProfiles;
  readonly refinedCandidates: readonly RefinedGridCandidate[];
}

export type StrictGridAttempt =
  | {
      readonly status: "found";
      readonly candidate: ValidatedGridCandidate;
      readonly geometry: GridGeometry;
      readonly coarseEvidence: CoarsePitchEvidence;
      readonly sourceContext: SourceGridValidationContext;
      readonly refinedPairCount: number;
    }
  | {
      readonly status: "rejected" | "ambiguous" | "budget-exhausted";
      readonly coarseEvidence: CoarsePitchEvidence | null;
      readonly sourceContext: SourceGridValidationContext | null;
      readonly refinedPairCount: number;
    };

interface AxisCandidate {
  readonly origin: number;
  readonly pitch: number;
  readonly score: number;
}

export interface GridCandidatePitchBucket {
  readonly pitch: number;
  readonly candidateCount: number;
}

interface GridCandidate {
  readonly vertical: AxisCandidate;
  readonly horizontal: AxisCandidate;
  readonly score: number;
}

export interface RefinedGridCandidate {
  readonly candidate: GridCandidate;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly duplicateHorizontalBoundaries: readonly number[];
  readonly canonicalVerticalBoundaries: readonly number[];
  readonly canonicalHorizontalBoundaries: readonly number[];
  readonly intersectionSupportRatio: number;
  readonly leadingIntersectionSupportRatio: number;
  readonly outerBoundaryDistinctiveness: number;
  readonly outerBoundaryBalance: number;
  readonly minimumOuterBoundaryEnergyRatio: number;
  readonly localRangeScore: number;
  readonly rangeScore: number;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function hasRgbaPixels(image: PixelImage): boolean {
  return image.data.length === image.width * image.height * 4;
}

function pixelLuminance(image: PixelImage, x: number, y: number): number {
  const offset = (y * image.width + x) * 4;
  return luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
}

function gradientHistogramMedian(histogram: Uint32Array, sampleCount: number): number {
  const middle = Math.floor(sampleCount / 2);
  let cumulative = 0;
  for (let bucket = 0; bucket < histogram.length; bucket += 1) {
    cumulative += histogram[bucket]!;
    if (cumulative > middle) return (bucket + 0.5) / GRADIENT_HISTOGRAM_SCALE;
  }
  return 0.5 / GRADIENT_HISTOGRAM_SCALE;
}

export function buildEdgeProfiles(image: PixelImage): EdgeProfiles {
  const smoothed = new Float64Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    const nextRow = Math.min(y + ROW_SMOOTHING_SPAN - 1, image.height - 1);
    for (let x = 0; x < image.width; x += 1) {
      smoothed[y * image.width + x] = (pixelLuminance(image, x, y) + pixelLuminance(image, x, nextRow)) / ROW_SMOOTHING_SPAN;
    }
  }

  const vertical = new Float64Array(image.width);
  const horizontal = new Float64Array(image.height);
  const verticalLinePrefix = new Float64Array((image.height + 1) * image.width);
  const horizontalLinePrefix = new Float64Array(image.height * (image.width + 1));
  const verticalGradientHistogram = new Uint32Array(GRADIENT_HISTOGRAM_SIZE);
  const horizontalGradientHistogram = new Uint32Array(GRADIENT_HISTOGRAM_SIZE);
  for (let y = 1; y < image.height; y += 1) {
    const verticalPreviousRow = y * image.width;
    const verticalCurrentRow = (y + 1) * image.width;
    const horizontalCurrentRow = y * (image.width + 1);
    verticalLinePrefix[verticalCurrentRow] = verticalLinePrefix[verticalPreviousRow]!;
    for (let x = 1; x < image.width; x += 1) {
      const current = smoothed[y * image.width + x]!;
      const verticalDifference = Math.abs(current - smoothed[y * image.width + x - 1]!);
      const horizontalDifference = Math.abs(current - smoothed[(y - 1) * image.width + x]!);
      const verticalBucket = Math.min(GRADIENT_HISTOGRAM_SIZE - 1, Math.floor(verticalDifference * GRADIENT_HISTOGRAM_SCALE));
      const horizontalBucket = Math.min(GRADIENT_HISTOGRAM_SIZE - 1, Math.floor(horizontalDifference * GRADIENT_HISTOGRAM_SCALE));
      verticalGradientHistogram[verticalBucket] = verticalGradientHistogram[verticalBucket]! + 1;
      horizontalGradientHistogram[horizontalBucket] = horizontalGradientHistogram[horizontalBucket]! + 1;
      vertical[x] = vertical[x]! + verticalDifference;
      horizontal[y] = horizontal[y]! + horizontalDifference;
      verticalLinePrefix[verticalCurrentRow + x] = verticalLinePrefix[verticalPreviousRow + x]! + verticalDifference;
      horizontalLinePrefix[horizontalCurrentRow + x + 1] = horizontalLinePrefix[horizontalCurrentRow + x]! + horizontalDifference;
    }
  }

  const gradientSampleCount = Math.max(1, (image.width - 1) * (image.height - 1));
  return {
    smoothed,
    vertical,
    horizontal,
    verticalLinePrefix,
    horizontalLinePrefix,
    verticalGradientMedian: gradientHistogramMedian(verticalGradientHistogram, gradientSampleCount),
    horizontalGradientMedian: gradientHistogramMedian(horizontalGradientHistogram, gradientSampleCount),
  };
}

function mean(profile: Float64Array): number {
  let total = 0;
  for (const value of profile) total += value;
  return total / profile.length;
}

function boundaryWeight(index: number, boundaryCount: number, outerWeight = COARSE_OUTER_BOUNDARY_WEIGHT): number {
  return index === 0 || index === boundaryCount - 1 ? outerWeight : 1;
}

function totalBoundaryWeight(boundaryCount: number, outerWeight = COARSE_OUTER_BOUNDARY_WEIGHT): number {
  return boundaryCount + 2 * (outerWeight - 1);
}

function scoreBoundarySequence(profile: Float64Array, origin: number, pitch: number, boundaryCount: number, baseline: number): number {
  let energy = 0;
  for (let boundary = 0; boundary < boundaryCount; boundary += 1) {
    energy += profile[origin + boundary * pitch]! * boundaryWeight(boundary, boundaryCount);
  }
  return energy / totalBoundaryWeight(boundaryCount) / baseline;
}

function axisCandidateSequenceCount(profileLength: number, boundaryCount: number, maxPitch: number): number {
  let count = 0;
  for (let pitch = MIN_CELL_PITCH; pitch <= maxPitch; pitch += 1) {
    count += Math.max(0, profileLength - (boundaryCount - 1) * pitch);
    if (count > MAX_AXIS_CANDIDATE_SEQUENCE_COUNT) return count;
  }
  return count;
}

function selectAxisCandidates(profile: Float64Array, boundaryCount: number, maxPitch: number): readonly AxisCandidate[] | null {
  const baseline = mean(profile);
  if (baseline <= 0) return [];
  if (axisCandidateSequenceCount(profile.length, boundaryCount, maxPitch) > MAX_AXIS_CANDIDATE_SEQUENCE_COUNT) {
    return null;
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  for (let pitch = MIN_CELL_PITCH; pitch <= maxPitch; pitch += 1) {
    const lastOrigin = profile.length - 1 - (boundaryCount - 1) * pitch;
    for (let origin = 0; origin <= lastOrigin; origin += 1) {
      bestScore = Math.max(bestScore, scoreBoundarySequence(profile, origin, pitch, boundaryCount, baseline));
    }
  }
  if (!Number.isFinite(bestScore)) return [];

  const candidates: AxisCandidate[] = [];
  const minimumScore = bestScore * MIN_COARSE_CANDIDATE_SCORE_RATIO;
  for (let pitch = MIN_CELL_PITCH; pitch <= maxPitch; pitch += 1) {
    const lastOrigin = profile.length - 1 - (boundaryCount - 1) * pitch;
    for (let origin = 0; origin <= lastOrigin; origin += 1) {
      const score = scoreBoundarySequence(profile, origin, pitch, boundaryCount, baseline);
      if (score < minimumScore) continue;
      if (candidates.length >= MAX_RETAINED_AXIS_CANDIDATES) return null;
      candidates.push({ origin, pitch, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function pitchesAreCompatible(first: number, second: number): boolean {
  return Math.abs(first - second) / Math.max(first, second) <= MAX_PITCH_DIFFERENCE_RATIO;
}

export function countCompatibleGridCandidatePairs(
  vertical: readonly GridCandidatePitchBucket[],
  horizontal: readonly GridCandidatePitchBucket[],
  budget = GRID_CANDIDATE_REFINEMENT_BUDGET,
): number | null {
  let count = 0;
  for (const verticalBucket of vertical) {
    for (const horizontalBucket of horizontal) {
      if (!pitchesAreCompatible(verticalBucket.pitch, horizontalBucket.pitch)) continue;
      count += verticalBucket.candidateCount * horizontalBucket.candidateCount;
      if (count > budget) return null;
    }
  }
  return count;
}

function bucketAxisCandidates(candidates: readonly AxisCandidate[]): readonly GridCandidatePitchBucket[] {
  const byPitch = new Map<number, number>();
  for (const candidate of candidates) {
    byPitch.set(candidate.pitch, (byPitch.get(candidate.pitch) ?? 0) + 1);
  }
  return [...byPitch.entries()].map(([pitch, candidateCount]) => ({
    pitch,
    candidateCount,
  }));
}

function coarsePitchEvidence(
  vertical: readonly AxisCandidate[],
  horizontal: readonly AxisCandidate[],
): CoarsePitchEvidence {
  const axisEvidence = (candidates: readonly AxisCandidate[]) => {
    const bestScore = candidates[0]?.score;
    if (bestScore === undefined || bestScore <= 0) return [];
    const buckets = new Map<number, { score: number; candidateCount: number }>();
    for (const candidate of candidates) {
      const bucket = buckets.get(candidate.pitch);
      if (bucket === undefined) {
        buckets.set(candidate.pitch, { score: candidate.score, candidateCount: 1 });
      } else {
        bucket.score = Math.max(bucket.score, candidate.score);
        bucket.candidateCount += 1;
      }
    }
    return [...buckets.entries()]
      .map(([pitch, bucket]) => ({
        pitch,
        normalizedScore: bucket.score / bestScore,
        candidateCount: bucket.candidateCount,
      }))
      .sort((first, second) => first.pitch - second.pitch);
  };
  return { vertical: axisEvidence(vertical), horizontal: axisEvidence(horizontal) };
}

function selectGridCandidates(vertical: readonly AxisCandidate[], horizontal: readonly AxisCandidate[]): readonly GridCandidate[] | null {
  const verticalBuckets = bucketAxisCandidates(vertical);
  const horizontalBuckets = bucketAxisCandidates(horizontal);

  const compatibleHorizontalByPitch = new Map<number, readonly AxisCandidate[]>();
  for (const verticalBucket of verticalBuckets) {
    compatibleHorizontalByPitch.set(
      verticalBucket.pitch,
      horizontal.filter((candidate) => pitchesAreCompatible(verticalBucket.pitch, candidate.pitch)),
    );
  }
  const candidates: GridCandidate[] = [];
  for (const verticalCandidate of vertical) {
    for (const horizontalCandidate of compatibleHorizontalByPitch.get(verticalCandidate.pitch) ?? []) {
      candidates.push({
        vertical: verticalCandidate,
        horizontal: horizontalCandidate,
        score: (verticalCandidate.score + horizontalCandidate.score) / 2,
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function refineBoundaries(
  profile: Float64Array,
  origin: number,
  pitch: number,
  boundaryCount: number,
  preferTrailingPlateau: boolean,
): readonly number[] {
  const boundaries: number[] = [];
  for (let boundary = 0; boundary < boundaryCount; boundary += 1) {
    const estimate = origin + boundary * pitch;
    const positions = refinementPositions(profile, estimate);
    let best = estimate;
    for (const position of positions) {
      if (profile[position]! > profile[best]! || (preferTrailingPlateau && profile[position] === profile[best]!)) best = position;
    }
    boundaries.push(best);
  }
  return boundaries;
}

function medianNumber(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1]! + values[middle]!) / 2 : values[middle]!;
}

function refinementTrend(
  boundaries: readonly number[],
  origin: number,
  pitch: number,
  preferLeadingPhase: boolean,
): readonly [number, number] {
  const points = boundaries.slice(1, -1).map((boundary, index) => ({
    index: index + 1,
    offset: boundary - origin - (index + 1) * pitch,
  }));
  if (points.length === 0) return [0, 0];

  const clampOffset = (offset: number): number => Math.max(
    -BOUNDARY_REFINEMENT_RADIUS,
    Math.min(BOUNDARY_REFINEMENT_RADIUS, Math.round(offset)),
  );
  if (preferLeadingPhase) {
    const leadingOffset = clampOffset(Math.min(...points.map((point) => point.offset)));
    return [leadingOffset, leadingOffset];
  }

  const slopes: number[] = [];
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      slopes.push((points[second]!.offset - points[first]!.offset) / (points[second]!.index - points[first]!.index));
    }
  }
  const slope = slopes.length > 0 ? medianNumber(slopes) : 0;
  const intercept = medianNumber(points.map((point) => point.offset - slope * point.index));
  const finalIndex = boundaries.length - 1;
  return [clampOffset(intercept), clampOffset(intercept + slope * finalIndex)];
}

function hasConsistentInteriorBoundaryPhase(boundaries: readonly number[], origin: number, pitch: number): boolean {
  const offsets = boundaries.slice(1, -1).map((boundary, index) => boundary - origin - (index + 1) * pitch);
  const medianOffset = medianNumber(offsets);
  return offsets.every((offset) => Math.abs(offset - medianOffset) <= EDGE_PHASE_COMPATIBILITY_RADIUS);
}

function refinementPositions(profile: Float64Array, estimate: number): readonly number[] {
  const start = Math.max(0, estimate - BOUNDARY_REFINEMENT_RADIUS);
  const end = Math.min(profile.length - 1, estimate + BOUNDARY_REFINEMENT_RADIUS);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function selectCanonicalEdgePosition(
  profile: Float64Array,
  positions: readonly number[],
  preferred: number,
  leadingRadius = 0,
  preferTrailingPlateau = false,
): number {
  const selected = positions.includes(preferred)
    ? preferred
    : positions.reduce((closest, position) => (
      Math.abs(position - preferred) < Math.abs(closest - preferred) ? position : closest
    ));
  const selectedEnergy = profile[selected]!;
  if (selectedEnergy <= 0) return selected;

  const maximum = Math.max(...positions.map((position) => profile[position]!));
  const leading = selected - leadingRadius;
  if (leadingRadius > 0 && positions.includes(leading) && profile[leading]! >= maximum * MIN_CANONICAL_LEADING_EDGE_RATIO) {
    return leading;
  }

  const previous = selected - 1;
  const next = selected + 1;
  const previousEnergy = positions.includes(previous) ? profile[previous]! : 0;
  const nextEnergy = positions.includes(next) ? profile[next]! : 0;
  if (nextEnergy > Math.max(selectedEnergy, previousEnergy) * MIN_DOMINANT_CANONICAL_EDGE_RATIO) return next;
  if (previousEnergy > Math.max(selectedEnergy, nextEnergy) * MIN_DOMINANT_CANONICAL_EDGE_RATIO) return previous;
  if (preferTrailingPlateau && nextEnergy >= selectedEnergy * MAX_CANONICAL_EDGE_SHOULDER_RATIO) return next;

  return selected;
}

function refineCanonicalBoundaries(
  profile: Float64Array,
  origin: number,
  pitch: number,
  boundaryCount: number,
  leadingRadius: number,
  preferTrailingPlateau: boolean,
): readonly number[] {
  return Array.from({ length: boundaryCount }, (_, boundary) => {
    const estimate = origin + boundary * pitch;
    return selectCanonicalEdgePosition(
      profile,
      refinementPositions(profile, estimate),
      estimate,
      leadingRadius,
      preferTrailingPlateau,
    );
  });
}

function canonicalEndpointPair(
  profile: Float64Array,
  origin: number,
  pitch: number,
  canonicalBoundaries: readonly number[],
  leadingRadius: number,
  preferLeadingPhase: boolean,
  preferTrailingPlateau: boolean,
): readonly [number, number] {
  const finalEstimate = origin + pitch * (canonicalBoundaries.length - 1);
  const [firstTrendOffset, finalTrendOffset] = refinementTrend(
    canonicalBoundaries,
    origin,
    pitch,
    preferLeadingPhase,
  );
  const predictedFirst = origin + firstTrendOffset;
  const firstPositions = refinementPositions(profile, origin).filter((position) => (
    Math.abs(position - predictedFirst) <= EDGE_PHASE_COMPATIBILITY_RADIUS
  ));
  const first = selectCanonicalEdgePosition(
    profile,
    firstPositions,
    predictedFirst,
    leadingRadius,
    preferTrailingPlateau,
  );
  const predictedFinal = finalEstimate + finalTrendOffset + (first - predictedFirst);
  const finalPositions = refinementPositions(profile, finalEstimate).filter((position) => (
    Math.abs(position - predictedFinal) <= EDGE_PHASE_COMPATIBILITY_RADIUS
  ));
  return [first, selectCanonicalEdgePosition(profile, finalPositions, predictedFinal, 0, preferTrailingPlateau)];
}

function localGradientMaximum(
  smoothed: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  axis: "vertical" | "horizontal",
): number {
  const left = Math.max(axis === "vertical" ? 1 : 0, x - LOCAL_ENERGY_RADIUS);
  const right = Math.min(width - 1, x + LOCAL_ENERGY_RADIUS);
  const top = Math.max(axis === "horizontal" ? 1 : 0, y - LOCAL_ENERGY_RADIUS);
  const bottom = Math.min(height - 1, y + LOCAL_ENERGY_RADIUS);
  let maximum = 0;
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      const current = smoothed[row * width + column]!;
      const neighbor = axis === "vertical"
        ? smoothed[row * width + column - 1]!
        : smoothed[(row - 1) * width + column]!;
      maximum = Math.max(maximum, Math.abs(current - neighbor));
    }
  }
  return maximum;
}

function verticalLineEnergy(prefix: Float64Array, width: number, x: number, top: number, bottom: number): number {
  const start = Math.max(0, x - LOCAL_ENERGY_RADIUS);
  const end = Math.min(width - 1, x + LOCAL_ENERGY_RADIUS);
  let maximum = 0;
  for (let column = start; column <= end; column += 1) {
    const energy = prefix[(bottom + 1) * width + column]! - prefix[top * width + column]!;
    maximum = Math.max(maximum, energy / (bottom - top + 1));
  }
  return maximum;
}

function horizontalLineEnergy(prefix: Float64Array, width: number, height: number, y: number, left: number, right: number): number {
  const start = Math.max(0, y - LOCAL_ENERGY_RADIUS);
  const end = Math.min(height - 1, y + LOCAL_ENERGY_RADIUS);
  let maximum = 0;
  for (let row = start; row <= end; row += 1) {
    const rowOffset = row * (width + 1);
    const energy = prefix[rowOffset + right + 1]! - prefix[rowOffset + left]!;
    maximum = Math.max(maximum, energy / (right - left + 1));
  }
  return maximum;
}

function gridRangeScore(
  profiles: EdgeProfiles,
  image: PixelImage,
  candidate: GridCandidate,
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): { readonly local: number; readonly normalized: number } {
  const left = verticalBoundaries[0]!;
  const right = verticalBoundaries[verticalBoundaries.length - 1]!;
  const top = horizontalBoundaries[0]!;
  const bottom = horizontalBoundaries[horizontalBoundaries.length - 1]!;
  const verticalBaseline = mean(profiles.vertical) / Math.max(1, image.height - 1);
  const horizontalBaseline = mean(profiles.horizontal) / Math.max(1, image.width - 1);
  if (verticalBaseline <= 0 || horizontalBaseline <= 0) return { local: 0, normalized: 0 };

  let verticalEnergy = 0;
  for (let index = 0; index < verticalBoundaries.length; index += 1) {
    const boundaryEnergy = verticalLineEnergy(
      profiles.verticalLinePrefix,
      image.width,
      verticalBoundaries[index]!,
      top,
      bottom,
    );
    verticalEnergy += boundaryEnergy
      * boundaryWeight(index, verticalBoundaries.length, RANGE_OUTER_BOUNDARY_WEIGHT);
  }
  let horizontalEnergy = 0;
  for (let index = 0; index < horizontalBoundaries.length; index += 1) {
    const boundaryEnergy = horizontalLineEnergy(
      profiles.horizontalLinePrefix,
      image.width,
      image.height,
      horizontalBoundaries[index]!,
      left,
      right,
    );
    horizontalEnergy += boundaryEnergy
      * boundaryWeight(index, horizontalBoundaries.length, RANGE_OUTER_BOUNDARY_WEIGHT);
  }
  const normalizedVertical = verticalEnergy
    / totalBoundaryWeight(verticalBoundaries.length, RANGE_OUTER_BOUNDARY_WEIGHT)
    / verticalBaseline;
  const normalizedHorizontal = horizontalEnergy
    / totalBoundaryWeight(horizontalBoundaries.length, RANGE_OUTER_BOUNDARY_WEIGHT)
    / horizontalBaseline;
  const rangeBlendRatio = 1 - COARSE_SCORE_BLEND_RATIO;
  const verticalScore = normalizedVertical ** rangeBlendRatio
    * candidate.vertical.score ** COARSE_SCORE_BLEND_RATIO;
  const horizontalScore = normalizedHorizontal ** rangeBlendRatio
    * candidate.horizontal.score ** COARSE_SCORE_BLEND_RATIO;
  return {
    local: normalizedVertical * normalizedHorizontal,
    normalized: verticalScore * horizontalScore,
  };
}

function outerBoundaryMetrics(
  profiles: EdgeProfiles,
  image: PixelImage,
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): { readonly distinctiveness: number; readonly balance: number; readonly minimumEnergyRatio: number } {
  const left = verticalBoundaries[0]!;
  const right = verticalBoundaries[verticalBoundaries.length - 1]!;
  const top = horizontalBoundaries[0]!;
  const bottom = horizontalBoundaries[horizontalBoundaries.length - 1]!;
  const verticalEnergies = verticalBoundaries.map((x) => verticalLineEnergy(
    profiles.verticalLinePrefix,
    image.width,
    x,
    top,
    bottom,
  ));
  const horizontalEnergies = horizontalBoundaries.map((y) => horizontalLineEnergy(
    profiles.horizontalLinePrefix,
    image.width,
    image.height,
    y,
    left,
    right,
  ));
  const axisDistinctiveness = (energies: readonly number[]): number => {
    const interiorMedian = medianNumber(energies.slice(1, -1));
    const strongestOuter = Math.max(energies[0]!, energies[energies.length - 1]!);
    return interiorMedian / Math.max(strongestOuter, Number.EPSILON);
  };
  const axisBalance = (energies: readonly number[]): number => (
    Math.min(energies[0]!, energies[energies.length - 1]!)
      / Math.max(energies[0]!, energies[energies.length - 1]!, Number.EPSILON)
  );
  const verticalBaseline = mean(profiles.vertical) / Math.max(1, image.height - 1);
  const horizontalBaseline = mean(profiles.horizontal) / Math.max(1, image.width - 1);
  const minimumEnergyRatio = Math.min(
    verticalEnergies[0]! / verticalBaseline,
    verticalEnergies[verticalEnergies.length - 1]! / verticalBaseline,
    horizontalEnergies[0]! / horizontalBaseline,
    horizontalEnergies[horizontalEnergies.length - 1]! / horizontalBaseline,
  );
  return {
    distinctiveness: Math.min(axisDistinctiveness(verticalEnergies), axisDistinctiveness(horizontalEnergies)),
    balance: Math.min(axisBalance(verticalEnergies), axisBalance(horizontalEnergies)),
    minimumEnergyRatio,
  };
}

function hasLocalIntersectionSupport(profiles: EdgeProfiles, image: PixelImage, x: number, y: number): boolean {
  const verticalEnergy = localGradientMaximum(profiles.smoothed, image.width, image.height, x, y, "vertical");
  const horizontalEnergy = localGradientMaximum(profiles.smoothed, image.width, image.height, x, y, "horizontal");
  return verticalEnergy / profiles.verticalGradientMedian > MIN_ABOVE_MEDIAN_LOCAL_ENERGY
    && horizontalEnergy / profiles.horizontalGradientMedian > MIN_ABOVE_MEDIAN_LOCAL_ENERGY;
}

function intersectionSupportRatio(
  profiles: EdgeProfiles,
  image: PixelImage,
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): number {
  let supported = 0;
  const total = verticalBoundaries.length * horizontalBoundaries.length;
  for (const x of verticalBoundaries) {
    for (const y of horizontalBoundaries) {
      if (hasLocalIntersectionSupport(profiles, image, x, y)) supported += 1;
    }
  }
  return supported / total;
}

function leadingIntersectionSupportRatio(
  profiles: EdgeProfiles,
  image: PixelImage,
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): number {
  const firstX = verticalBoundaries[0]!;
  const firstY = horizontalBoundaries[0]!;
  let supported = 0;
  for (const x of verticalBoundaries) {
    if (hasLocalIntersectionSupport(profiles, image, x, firstY)) supported += 1;
  }
  for (const y of horizontalBoundaries.slice(1)) {
    if (hasLocalIntersectionSupport(profiles, image, firstX, y)) supported += 1;
  }
  return supported / (verticalBoundaries.length + horizontalBoundaries.length - 1);
}

function refineGridCandidates(
  candidates: readonly GridCandidate[],
  profiles: EdgeProfiles,
  image: PixelImage,
  dimensions: GridDimensions,
): readonly RefinedGridCandidate[] {
  return candidates.map((candidate) => {
    const verticalBoundaries = refineBoundaries(
      profiles.vertical,
      candidate.vertical.origin,
      candidate.vertical.pitch,
      dimensions.columns + 1,
      false,
    );
    const horizontalBoundaries = refineBoundaries(
      profiles.horizontal,
      candidate.horizontal.origin,
      candidate.horizontal.pitch,
      dimensions.rows + 1,
      false,
    );
    const duplicateHorizontalBoundaries = refineBoundaries(
      profiles.horizontal,
      candidate.horizontal.origin,
      candidate.horizontal.pitch,
      dimensions.rows + 1,
      true,
    );
    const canonicalVerticalBoundaries = refineCanonicalBoundaries(
      profiles.vertical,
      candidate.vertical.origin,
      candidate.vertical.pitch,
      dimensions.columns + 1,
      VERTICAL_CANONICAL_LEADING_RADIUS,
      false,
    );
    const canonicalHorizontalBoundaries = refineCanonicalBoundaries(
      profiles.horizontal,
      candidate.horizontal.origin,
      candidate.horizontal.pitch,
      dimensions.rows + 1,
      HORIZONTAL_CANONICAL_LEADING_RADIUS,
      true,
    );
    const rangeScores = gridRangeScore(profiles, image, candidate, verticalBoundaries, horizontalBoundaries);
    const intersectionSupport = intersectionSupportRatio(profiles, image, verticalBoundaries, horizontalBoundaries);
    const leadingSupport = leadingIntersectionSupportRatio(profiles, image, verticalBoundaries, horizontalBoundaries);
    const boundaryMetrics = outerBoundaryMetrics(profiles, image, verticalBoundaries, horizontalBoundaries);
    return {
      candidate,
      verticalBoundaries,
      horizontalBoundaries,
      duplicateHorizontalBoundaries,
      canonicalVerticalBoundaries,
      canonicalHorizontalBoundaries,
      intersectionSupportRatio: intersectionSupport,
      leadingIntersectionSupportRatio: leadingSupport,
      outerBoundaryDistinctiveness: boundaryMetrics.distinctiveness,
      outerBoundaryBalance: boundaryMetrics.balance,
      minimumOuterBoundaryEnergyRatio: boundaryMetrics.minimumEnergyRatio,
      localRangeScore: rangeScores.local,
      rangeScore: rangeScores.normalized,
    };
  }).sort((a, b) => b.rangeScore - a.rangeScore);
}

function hasSeparatedScore(candidates: readonly RefinedGridCandidate[]): boolean {
  const [best, runnerUp] = candidates;
  if (!best) return false;
  if (!runnerUp) return true;
  return (best.rangeScore - runnerUp.rangeScore) / best.rangeScore >= MIN_SCORE_SEPARATION_RATIO;
}

function rangeOverlapRatio(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  const intersection = Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
  return intersection / Math.min(firstEnd - firstStart, secondEnd - secondStart);
}

function overlappingSamePitchExtent(first: RefinedGridCandidate, second: RefinedGridCandidate): boolean {
  if (first.candidate.vertical.pitch !== second.candidate.vertical.pitch) return false;
  if (first.candidate.horizontal.pitch !== second.candidate.horizontal.pitch) return false;
  return rangeOverlapRatio(
    first.canonicalVerticalBoundaries[0]!,
    first.canonicalVerticalBoundaries[first.canonicalVerticalBoundaries.length - 1]!,
    second.canonicalVerticalBoundaries[0]!,
    second.canonicalVerticalBoundaries[second.canonicalVerticalBoundaries.length - 1]!,
  ) >= MIN_COMPETING_EXTENT_OVERLAP_RATIO && rangeOverlapRatio(
    first.canonicalHorizontalBoundaries[0]!,
    first.canonicalHorizontalBoundaries[first.canonicalHorizontalBoundaries.length - 1]!,
    second.canonicalHorizontalBoundaries[0]!,
    second.canonicalHorizontalBoundaries[second.canonicalHorizontalBoundaries.length - 1]!,
  ) >= MIN_COMPETING_EXTENT_OVERLAP_RATIO;
}

function filterWeakOverlappingExtents(candidates: readonly RefinedGridCandidate[]): readonly RefinedGridCandidate[] {
  const stronglyBounded = candidates.filter((candidate) => (
    candidate.outerBoundaryDistinctiveness >= MIN_OUTER_BOUNDARY_DISTINCTIVENESS_RATIO
    && candidate.outerBoundaryBalance >= MIN_OUTER_BOUNDARY_BALANCE_RATIO
    && candidate.minimumOuterBoundaryEnergyRatio >= MIN_OUTER_BOUNDARY_ENERGY_RATIO
  ));
  return candidates.filter((candidate) => {
    if (candidate.minimumOuterBoundaryEnergyRatio < MIN_OUTER_BOUNDARY_ENERGY_RATIO) return false;
    const hasBetterSupportedLeadingExtent = candidates.some((other) => (
      other !== candidate
      && other.localRangeScore >= candidate.localRangeScore * MIN_RELATIVE_RANGE_SCORE_FOR_LEADING_COMPARISON
      && other.leadingIntersectionSupportRatio
        >= candidate.leadingIntersectionSupportRatio + MIN_LEADING_INTERSECTION_SUPPORT_ADVANTAGE
      && overlappingSamePitchExtent(candidate, other)
    ));
    if (hasBetterSupportedLeadingExtent) return false;
    const overlapping = candidates.filter((other) => (
      other.localRangeScore >= candidate.localRangeScore
      && other.leadingIntersectionSupportRatio + MIN_LEADING_INTERSECTION_SUPPORT_ADVANTAGE
        >= candidate.leadingIntersectionSupportRatio
      && other.minimumOuterBoundaryEnergyRatio >= MIN_OUTER_BOUNDARY_ENERGY_RATIO
      && overlappingSamePitchExtent(candidate, other)
    ));
    if (overlapping.length > 0) {
      const strongestMinimumEnergy = Math.max(...overlapping.map((other) => other.minimumOuterBoundaryEnergyRatio));
      if (candidate.minimumOuterBoundaryEnergyRatio < strongestMinimumEnergy * MIN_RELATIVE_OUTER_BOUNDARY_ENERGY_RATIO) return false;
      const strongestBalance = Math.max(...overlapping.map((other) => other.outerBoundaryBalance));
      if (candidate.outerBoundaryBalance < strongestBalance * MIN_RELATIVE_OUTER_BOUNDARY_BALANCE_RATIO) return false;
      const strongestIntersectionSupport = Math.max(...overlapping.map((other) => other.intersectionSupportRatio));
      if (candidate.intersectionSupportRatio < strongestIntersectionSupport * MIN_RELATIVE_INTERSECTION_SUPPORT_RATIO) return false;
    }
    const hasDistinctOuterBoundaries = candidate.outerBoundaryDistinctiveness >= MIN_OUTER_BOUNDARY_DISTINCTIVENESS_RATIO
      && candidate.outerBoundaryBalance >= MIN_OUTER_BOUNDARY_BALANCE_RATIO;
    return hasDistinctOuterBoundaries || !stronglyBounded.some((strong) => (
      strong.localRangeScore >= candidate.localRangeScore && overlappingSamePitchExtent(candidate, strong)
    ));
  });
}

function selectDistinctGridCandidates(candidates: readonly RefinedGridCandidate[]): readonly RefinedGridCandidate[] {
  const distinct = new Map<string, RefinedGridCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.verticalBoundaries.join(",")}|${candidate.duplicateHorizontalBoundaries.join(",")}`;
    if (!distinct.has(key)) distinct.set(key, candidate);
  }
  return [...distinct.values()].sort((a, b) => b.rangeScore - a.rangeScore);
}

export function detectStrictGridAttempt(
  image: PixelImage,
  dimensions: GridDimensions,
  budget: GridRefinementBudget,
): StrictGridAttempt {
  const rejected = (status: "rejected" | "ambiguous" | "budget-exhausted", coarseEvidence: CoarsePitchEvidence | null, sourceContext: SourceGridValidationContext | null, refinedPairCount: number): StrictGridAttempt => ({
    status,
    coarseEvidence,
    sourceContext,
    refinedPairCount,
  });
  if (!isPositiveInteger(image.width) || !isPositiveInteger(image.height) || !hasRgbaPixels(image)) {
    return rejected("rejected", null, null, 0);
  }
  if (!isPositiveInteger(dimensions.columns) || !isPositiveInteger(dimensions.rows)) {
    return rejected("rejected", null, null, 0);
  }

  const maxPitch = Math.floor(Math.min(image.width / dimensions.columns, image.height / dimensions.rows));
  if (maxPitch < MIN_CELL_PITCH) return rejected("rejected", null, null, 0);

  const profiles = buildEdgeProfiles(image);
  const verticalCandidates = selectAxisCandidates(profiles.vertical, dimensions.columns + 1, maxPitch);
  const horizontalCandidates = selectAxisCandidates(profiles.horizontal, dimensions.rows + 1, maxPitch);
  if (verticalCandidates === null || horizontalCandidates === null) {
    return rejected("budget-exhausted", null, null, 0);
  }
  const coarseEvidence = coarsePitchEvidence(verticalCandidates, horizontalCandidates);
  const verticalBuckets = bucketAxisCandidates(verticalCandidates);
  const horizontalBuckets = bucketAxisCandidates(horizontalCandidates);
  const refinedPairCount = countCompatibleGridCandidatePairs(verticalBuckets, horizontalBuckets, budget.remaining);
  if (refinedPairCount === null) return rejected("budget-exhausted", coarseEvidence, null, 0);
  if (!budget.reserve(refinedPairCount)) return rejected("budget-exhausted", coarseEvidence, null, 0);
  const gridCandidates = selectGridCandidates(verticalCandidates, horizontalCandidates);
  if (gridCandidates === null) return rejected("budget-exhausted", coarseEvidence, null, 0);
  const allRefinedCandidates = refineGridCandidates(gridCandidates, profiles, image, dimensions);
  const sourceContext: SourceGridValidationContext = { profiles, refinedCandidates: allRefinedCandidates };
  const phaseCandidates = allRefinedCandidates
    .filter((candidate) => hasConsistentInteriorBoundaryPhase(
      candidate.verticalBoundaries,
      candidate.candidate.vertical.origin,
      candidate.candidate.vertical.pitch,
    ))
    .filter((candidate) => hasConsistentInteriorBoundaryPhase(
      candidate.horizontalBoundaries,
      candidate.candidate.horizontal.origin,
      candidate.candidate.horizontal.pitch,
    ));
  const supportCandidates = phaseCandidates
    .filter((candidate) => candidate.intersectionSupportRatio >= MIN_INTERSECTION_SUPPORT_RATIO);
  const candidates = selectDistinctGridCandidates(filterWeakOverlappingExtents(supportCandidates));
  if (!hasSeparatedScore(candidates)) return rejected("ambiguous", coarseEvidence, sourceContext, refinedPairCount);

  const best = candidates[0]!;
  const [firstVerticalBoundary, finalVerticalBoundary] = canonicalEndpointPair(
    profiles.vertical,
    best.candidate.vertical.origin,
    best.candidate.vertical.pitch,
    best.canonicalVerticalBoundaries,
    VERTICAL_CANONICAL_LEADING_RADIUS,
    false,
    false,
  );
  const [firstHorizontalBoundary, finalHorizontalBoundary] = canonicalEndpointPair(
    profiles.horizontal,
    best.candidate.horizontal.origin,
    best.candidate.horizontal.pitch,
    best.canonicalHorizontalBoundaries,
    0,
    true,
    true,
  );
  const left = firstVerticalBoundary;
  const right = finalVerticalBoundary;
  const top = firstHorizontalBoundary;
  const bottom = finalHorizontalBoundary;
  const width = right - left;
  const height = bottom - top;
  const pitchX = width / dimensions.columns;
  const pitchY = height / dimensions.rows;
  if (pitchX <= 0 || pitchY <= 0) return rejected("rejected", coarseEvidence, sourceContext, refinedPairCount);
  if (Math.abs(pitchX - pitchY) / Math.max(pitchX, pitchY) > MAX_PITCH_DIFFERENCE_RATIO) {
    return rejected("rejected", coarseEvidence, sourceContext, refinedPairCount);
  }

  const geometry: GridGeometry = {
    bounds: { x: left, y: top, width, height },
    columns: dimensions.columns,
    rows: dimensions.rows,
    pitchX,
    pitchY,
    score: best.rangeScore,
  };
  return {
    status: "found",
    candidate: {
      geometry,
      verticalBoundaries: best.canonicalVerticalBoundaries,
      horizontalBoundaries: best.canonicalHorizontalBoundaries,
      rangeScore: best.rangeScore,
    },
    geometry,
    coarseEvidence,
    sourceContext,
    refinedPairCount,
  };
}
