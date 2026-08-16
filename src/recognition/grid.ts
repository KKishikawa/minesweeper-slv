import { luminance } from "./pixels.js";
import type { GridGeometry, PixelImage, Rect } from "./types.js";

const MIN_CELL_PITCH = 8;
const ROW_SMOOTHING_SPAN = 2;
const BOUNDARY_REFINEMENT_RADIUS = 2;
const EDGE_PHASE_COMPATIBILITY_RADIUS = 1;
const LOCAL_ENERGY_RADIUS = 1;
const MAX_PITCH_DIFFERENCE_RATIO = 0.05;
const MIN_INTERSECTION_SUPPORT_RATIO = 0.9;
const FULL_INTERSECTION_SUPPORT_RATIO = 1;
const MIN_FLAT_GRID_INTERSECTION_SUPPORT_RATIO = 0.98;
const MIN_LEADING_INTERSECTION_SUPPORT_RATIO = 0.75;
const MIN_SCORE_SEPARATION_RATIO = 0.05;
const MIN_ABOVE_MEDIAN_LOCAL_ENERGY = 1.3;
const GRADIENT_HISTOGRAM_SCALE = 4;
const GRADIENT_HISTOGRAM_SIZE = 256 * GRADIENT_HISTOGRAM_SCALE;
const CANDIDATE_ORIGIN_EQUIVALENCE_DISTANCE = BOUNDARY_REFINEMENT_RADIUS;
const EQUIVALENT_EDGE_PHASE_DISTANCE = BOUNDARY_REFINEMENT_RADIUS * 2;
const MAX_EQUIVALENT_EDGE_PHASE_RATIO = 0.15;
const EQUIVALENT_EDGE_SCORE_RATIO = 1 - MIN_SCORE_SEPARATION_RATIO;
const MIN_OUTER_BOUNDARY_DISTINCTIVENESS_RATIO = 1.1;
const MIN_OUTER_BOUNDARY_BALANCE_RATIO = 0.45;
const MIN_OUTER_BOUNDARY_ENERGY_RATIO = 1.3;
const MIN_RELATIVE_OUTER_BOUNDARY_ENERGY_RATIO = 0.97;
const MIN_RELATIVE_OUTER_BOUNDARY_BALANCE_RATIO = 0.92;
const MIN_RELATIVE_INTERSECTION_SUPPORT_RATIO = 0.97;
const MIN_COMPETING_EXTENT_OVERLAP_RATIO = 0.9;
const OUTER_EDGE_X_START_OFFSET_RATIO = 0.05;
const OUTER_EDGE_Y_START_OFFSET_RATIO = 0.1;
const OUTER_BOUNDARY_WEIGHT = 3;
const AXIS_CANDIDATE_LIMIT = 64;

interface GridDimensions {
  readonly columns: number;
  readonly rows: number;
}

interface EdgeProfiles {
  readonly smoothed: Float64Array;
  readonly vertical: Float64Array;
  readonly horizontal: Float64Array;
  readonly verticalLinePrefix: Float64Array;
  readonly horizontalLinePrefix: Float64Array;
  readonly verticalGradientMedian: number;
  readonly horizontalGradientMedian: number;
}

interface AxisCandidate {
  readonly origin: number;
  readonly pitch: number;
  readonly score: number;
}

interface GridCandidate {
  readonly vertical: AxisCandidate;
  readonly horizontal: AxisCandidate;
  readonly score: number;
}

interface RefinedGridCandidate {
  readonly candidate: GridCandidate;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly intersectionSupportRatio: number;
  readonly leadingIntersectionSupportRatio: number;
  readonly outerBoundaryDistinctiveness: number;
  readonly outerBoundaryBalance: number;
  readonly minimumOuterBoundaryEnergyRatio: number;
  readonly rangeScore: number;
  readonly score: number;
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

function buildEdgeProfiles(image: PixelImage): EdgeProfiles {
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

function boundaryWeight(index: number, boundaryCount: number): number {
  return index === 0 || index === boundaryCount - 1 ? OUTER_BOUNDARY_WEIGHT : 1;
}

function totalBoundaryWeight(boundaryCount: number): number {
  return boundaryCount + 2 * (OUTER_BOUNDARY_WEIGHT - 1);
}

function scoreBoundarySequence(profile: Float64Array, origin: number, pitch: number, boundaryCount: number, baseline: number): number {
  let energy = 0;
  for (let boundary = 0; boundary < boundaryCount; boundary += 1) {
    energy += profile[origin + boundary * pitch]! * boundaryWeight(boundary, boundaryCount);
  }
  return energy / totalBoundaryWeight(boundaryCount) / baseline;
}

function selectAxisCandidates(profile: Float64Array, boundaryCount: number, maxPitch: number): readonly AxisCandidate[] {
  const baseline = mean(profile);
  if (baseline <= 0) return [];

  const candidates: AxisCandidate[] = [];
  for (let pitch = MIN_CELL_PITCH; pitch <= maxPitch; pitch += 1) {
    const lastOrigin = profile.length - 1 - (boundaryCount - 1) * pitch;
    for (let origin = 0; origin <= lastOrigin; origin += 1) {
      candidates.push({ origin, pitch, score: scoreBoundarySequence(profile, origin, pitch, boundaryCount, baseline) });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const distinct: AxisCandidate[] = [];
  for (const candidate of candidates) {
    const isEquivalent = distinct.some((selected) => (
      selected.pitch === candidate.pitch
      && Math.abs(selected.origin - candidate.origin) <= CANDIDATE_ORIGIN_EQUIVALENCE_DISTANCE
    ));
    if (!isEquivalent) distinct.push(candidate);
    if (distinct.length === AXIS_CANDIDATE_LIMIT) break;
  }
  return distinct;
}

function selectGridCandidates(vertical: readonly AxisCandidate[], horizontal: readonly AxisCandidate[]): readonly GridCandidate[] {
  const candidates: GridCandidate[] = [];
  for (const verticalCandidate of vertical) {
    for (const horizontalCandidate of horizontal) {
      const pitchDifference = Math.abs(verticalCandidate.pitch - horizontalCandidate.pitch);
      const largestPitch = Math.max(verticalCandidate.pitch, horizontalCandidate.pitch);
      if (pitchDifference / largestPitch > MAX_PITCH_DIFFERENCE_RATIO) continue;
      candidates.push({
        vertical: verticalCandidate,
        horizontal: horizontalCandidate,
        score: (verticalCandidate.score + horizontalCandidate.score) / 2,
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function refineBoundaries(profile: Float64Array, origin: number, pitch: number, boundaryCount: number): readonly number[] {
  const boundaries: number[] = [];
  for (let boundary = 0; boundary < boundaryCount; boundary += 1) {
    const estimate = origin + boundary * pitch;
    const start = Math.max(0, estimate - BOUNDARY_REFINEMENT_RADIUS);
    const end = Math.min(profile.length - 1, estimate + BOUNDARY_REFINEMENT_RADIUS);
    let best = estimate;
    for (let position = start; position <= end; position += 1) {
      if (profile[position]! > profile[best]!) best = position;
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

function refinementTrend(boundaries: readonly number[], origin: number, pitch: number): readonly [number, number] {
  const points = boundaries.slice(1, -1).map((boundary, index) => ({
    index: index + 1,
    offset: boundary - (origin + (index + 1) * pitch),
  }));
  if (points.length === 0) return [0, 0];

  const slopes: number[] = [];
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      slopes.push((points[second]!.offset - points[first]!.offset) / (points[second]!.index - points[first]!.index));
    }
  }
  const slope = slopes.length > 0 ? medianNumber(slopes) : 0;
  const intercept = medianNumber(points.map((point) => point.offset - slope * point.index));
  const lastIndex = boundaries.length - 1;
  const clampOffset = (offset: number): number => Math.max(
    -BOUNDARY_REFINEMENT_RADIUS,
    Math.min(BOUNDARY_REFINEMENT_RADIUS, Math.round(offset)),
  );
  return [clampOffset(intercept), clampOffset(intercept + slope * lastIndex)];
}

function hasConsistentInteriorBoundaryPhase(boundaries: readonly number[], origin: number, pitch: number): boolean {
  const offsets = boundaries.slice(1, -1).map((boundary, index) => boundary - origin - (index + 1) * pitch);
  const medianOffset = medianNumber(offsets);
  return offsets.every((offset) => Math.abs(offset - medianOffset) <= EDGE_PHASE_COMPATIBILITY_RADIUS);
}

function phaseCompatiblePositions(profile: Float64Array, estimate: number, predictedOffset: number): readonly number[] {
  const start = Math.max(
    0,
    estimate - BOUNDARY_REFINEMENT_RADIUS,
    estimate + predictedOffset - EDGE_PHASE_COMPATIBILITY_RADIUS,
  );
  const end = Math.min(
    profile.length - 1,
    estimate + BOUNDARY_REFINEMENT_RADIUS,
    estimate + predictedOffset + EDGE_PHASE_COMPATIBILITY_RADIUS,
  );
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function refinePhaseCompatibleOuterBoundaries(
  profile: Float64Array,
  origin: number,
  pitch: number,
  boundaries: readonly number[],
): readonly [number, number] {
  const finalEstimate = origin + pitch * (boundaries.length - 1);
  const [predictedFirstOffset, predictedFinalOffset] = refinementTrend(boundaries, origin, pitch);
  const firstPositions = phaseCompatiblePositions(profile, origin, predictedFirstOffset);
  const finalPositions = phaseCompatiblePositions(profile, finalEstimate, predictedFinalOffset);
  let bestFirst = origin + predictedFirstOffset;
  let bestFinal = finalEstimate + predictedFinalOffset;
  let bestEnergy = Number.NEGATIVE_INFINITY;
  let bestPhaseDistance = Number.POSITIVE_INFINITY;
  for (const first of firstPositions) {
    for (const final of finalPositions) {
      const firstOffset = first - origin;
      const finalOffset = final - finalEstimate;
      const predictedSpanAdjustment = predictedFinalOffset - predictedFirstOffset;
      if (Math.abs(finalOffset - firstOffset - predictedSpanAdjustment) > EDGE_PHASE_COMPATIBILITY_RADIUS) continue;
      const energy = profile[first]! + profile[final]!;
      const phaseDistance = Math.abs(firstOffset - predictedFirstOffset) + Math.abs(finalOffset - predictedFinalOffset);
      if (energy > bestEnergy || (energy === bestEnergy && phaseDistance < bestPhaseDistance)) {
        bestFirst = first;
        bestFinal = final;
        bestEnergy = energy;
        bestPhaseDistance = phaseDistance;
      }
    }
  }
  return [bestFirst, bestFinal];
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
  verticalBoundaries: readonly number[],
  horizontalBoundaries: readonly number[],
): number {
  const left = verticalBoundaries[0]!;
  const right = verticalBoundaries[verticalBoundaries.length - 1]!;
  const top = horizontalBoundaries[0]!;
  const bottom = horizontalBoundaries[horizontalBoundaries.length - 1]!;
  const verticalBaseline = mean(profiles.vertical) / Math.max(1, image.height - 1);
  const horizontalBaseline = mean(profiles.horizontal) / Math.max(1, image.width - 1);
  if (verticalBaseline <= 0 || horizontalBaseline <= 0) return 0;

  let verticalEnergy = 0;
  for (let index = 0; index < verticalBoundaries.length; index += 1) {
    verticalEnergy += verticalLineEnergy(profiles.verticalLinePrefix, image.width, verticalBoundaries[index]!, top, bottom)
      * boundaryWeight(index, verticalBoundaries.length);
  }
  let horizontalEnergy = 0;
  for (let index = 0; index < horizontalBoundaries.length; index += 1) {
    horizontalEnergy += horizontalLineEnergy(profiles.horizontalLinePrefix, image.width, image.height, horizontalBoundaries[index]!, left, right)
      * boundaryWeight(index, horizontalBoundaries.length);
  }
  const normalizedVertical = verticalEnergy / totalBoundaryWeight(verticalBoundaries.length) / verticalBaseline;
  const normalizedHorizontal = horizontalEnergy / totalBoundaryWeight(horizontalBoundaries.length) / horizontalBaseline;
  return Math.sqrt(normalizedVertical * normalizedHorizontal);
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
    const verticalBoundaries = refineBoundaries(profiles.vertical, candidate.vertical.origin, candidate.vertical.pitch, dimensions.columns + 1);
    const horizontalBoundaries = refineBoundaries(profiles.horizontal, candidate.horizontal.origin, candidate.horizontal.pitch, dimensions.rows + 1);
    const leadingSupport = leadingIntersectionSupportRatio(profiles, image, verticalBoundaries, horizontalBoundaries);
    const rangeScore = gridRangeScore(profiles, image, verticalBoundaries, horizontalBoundaries);
    const intersectionSupport = intersectionSupportRatio(profiles, image, verticalBoundaries, horizontalBoundaries);
    const boundaryMetrics = outerBoundaryMetrics(profiles, image, verticalBoundaries, horizontalBoundaries);
    return {
      candidate,
      verticalBoundaries,
      horizontalBoundaries,
      intersectionSupportRatio: intersectionSupport,
      leadingIntersectionSupportRatio: leadingSupport,
      outerBoundaryDistinctiveness: boundaryMetrics.distinctiveness,
      outerBoundaryBalance: boundaryMetrics.balance,
      minimumOuterBoundaryEnergyRatio: boundaryMetrics.minimumEnergyRatio,
      rangeScore,
      score: rangeScore,
    };
  }).sort((a, b) => b.score - a.score);
}

function hasSeparatedScore(candidates: readonly RefinedGridCandidate[]): boolean {
  const [best, runnerUp] = candidates;
  if (!best) return false;
  if (!runnerUp) return true;
  return (best.score - runnerUp.score) / best.score >= MIN_SCORE_SEPARATION_RATIO;
}

function representsSameGridPhase(first: RefinedGridCandidate, second: RefinedGridCandidate): boolean {
  if (first.candidate.vertical.pitch !== second.candidate.vertical.pitch) return false;
  if (first.candidate.horizontal.pitch !== second.candidate.horizontal.pitch) return false;
  const verticalPhaseTolerance = Math.max(EQUIVALENT_EDGE_PHASE_DISTANCE, first.candidate.vertical.pitch * MAX_EQUIVALENT_EDGE_PHASE_RATIO);
  const horizontalPhaseTolerance = Math.max(EQUIVALENT_EDGE_PHASE_DISTANCE, first.candidate.horizontal.pitch * MAX_EQUIVALENT_EDGE_PHASE_RATIO);
  if (Math.abs(first.candidate.vertical.origin - second.candidate.vertical.origin) > verticalPhaseTolerance) return false;
  if (Math.abs(first.candidate.horizontal.origin - second.candidate.horizontal.origin) > horizontalPhaseTolerance) return false;

  const firstRight = first.verticalBoundaries[first.verticalBoundaries.length - 1]!;
  const secondRight = second.verticalBoundaries[second.verticalBoundaries.length - 1]!;
  const firstBottom = first.horizontalBoundaries[first.horizontalBoundaries.length - 1]!;
  const secondBottom = second.horizontalBoundaries[second.horizontalBoundaries.length - 1]!;
  return Math.abs(firstRight - secondRight) <= verticalPhaseTolerance
    && Math.abs(firstBottom - secondBottom) <= horizontalPhaseTolerance;
}

function rangeOverlapRatio(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  const intersection = Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
  return intersection / Math.min(firstEnd - firstStart, secondEnd - secondStart);
}

function overlappingSamePitchExtent(first: RefinedGridCandidate, second: RefinedGridCandidate): boolean {
  if (first.candidate.vertical.pitch !== second.candidate.vertical.pitch) return false;
  if (first.candidate.horizontal.pitch !== second.candidate.horizontal.pitch) return false;
  return rangeOverlapRatio(
    first.verticalBoundaries[0]!,
    first.verticalBoundaries[first.verticalBoundaries.length - 1]!,
    second.verticalBoundaries[0]!,
    second.verticalBoundaries[second.verticalBoundaries.length - 1]!,
  ) >= MIN_COMPETING_EXTENT_OVERLAP_RATIO && rangeOverlapRatio(
    first.horizontalBoundaries[0]!,
    first.horizontalBoundaries[first.horizontalBoundaries.length - 1]!,
    second.horizontalBoundaries[0]!,
    second.horizontalBoundaries[second.horizontalBoundaries.length - 1]!,
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
    const overlapping = candidates.filter((other) => (
      other.rangeScore >= candidate.rangeScore
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
      strong.rangeScore >= candidate.rangeScore && overlappingSamePitchExtent(candidate, strong)
    ));
  });
}

function selectDistinctGridCandidates(candidates: readonly RefinedGridCandidate[]): readonly RefinedGridCandidate[] {
  const clusters: Array<{ best: RefinedGridCandidate; representative: RefinedGridCandidate }> = [];
  for (const candidate of candidates) {
    const cluster = clusters.find(({ best }) => representsSameGridPhase(candidate, best));
    if (!cluster) {
      clusters.push({ best: candidate, representative: candidate });
      continue;
    }
    const sameVerticalEdge = Math.abs(candidate.candidate.vertical.origin - cluster.best.candidate.vertical.origin) <= CANDIDATE_ORIGIN_EQUIVALENCE_DISTANCE;
    const nearbyHorizontalEdge = Math.abs(candidate.candidate.horizontal.origin - cluster.best.candidate.horizontal.origin) <= EQUIVALENT_EDGE_PHASE_DISTANCE;
    const comparableScore = candidate.rangeScore >= cluster.best.rangeScore * EQUIVALENT_EDGE_SCORE_RATIO;
    if (sameVerticalEdge && nearbyHorizontalEdge && comparableScore && candidate.candidate.horizontal.origin > cluster.representative.candidate.horizontal.origin) {
      cluster.representative = candidate;
    }
  }
  return clusters.map(({ best, representative }) => ({ ...representative, score: best.score })).sort((a, b) => b.score - a.score);
}

export function detectGrid(image: PixelImage, dimensions: GridDimensions): GridGeometry | null {
  if (!isPositiveInteger(image.width) || !isPositiveInteger(image.height) || !hasRgbaPixels(image)) return null;
  if (!isPositiveInteger(dimensions.columns) || !isPositiveInteger(dimensions.rows)) return null;

  const maxPitch = Math.floor(Math.min(image.width / dimensions.columns, image.height / dimensions.rows));
  if (maxPitch < MIN_CELL_PITCH) return null;

  const profiles = buildEdgeProfiles(image);
  const verticalCandidates = selectAxisCandidates(profiles.vertical, dimensions.columns + 1, maxPitch);
  const horizontalCandidates = selectAxisCandidates(profiles.horizontal, dimensions.rows + 1, maxPitch);
  const refinedCandidates = refineGridCandidates(selectGridCandidates(verticalCandidates, horizontalCandidates), profiles, image, dimensions)
    .filter((candidate) => hasConsistentInteriorBoundaryPhase(
      candidate.verticalBoundaries,
      candidate.candidate.vertical.origin,
      candidate.candidate.vertical.pitch,
    ))
    .filter((candidate) => hasConsistentInteriorBoundaryPhase(
      candidate.horizontalBoundaries,
      candidate.candidate.horizontal.origin,
      candidate.candidate.horizontal.pitch,
    ))
    .filter((candidate) => candidate.intersectionSupportRatio >= MIN_INTERSECTION_SUPPORT_RATIO)
    .filter((candidate) => candidate.leadingIntersectionSupportRatio >= MIN_LEADING_INTERSECTION_SUPPORT_RATIO);
  const candidates = selectDistinctGridCandidates(filterWeakOverlappingExtents(refinedCandidates));
  if (!hasSeparatedScore(candidates)) return null;

  const best = candidates[0]!;
  const [firstVerticalBoundary, finalVerticalBoundary] = refinePhaseCompatibleOuterBoundaries(
    profiles.vertical,
    best.candidate.vertical.origin,
    best.candidate.vertical.pitch,
    best.verticalBoundaries,
  );
  const [firstHorizontalBoundary, finalHorizontalBoundary] = refinePhaseCompatibleOuterBoundaries(
    profiles.horizontal,
    best.candidate.horizontal.origin,
    best.candidate.horizontal.pitch,
    best.horizontalBoundaries,
  );
  const left = Math.max(0, firstVerticalBoundary - Math.floor(best.candidate.vertical.pitch * OUTER_EDGE_X_START_OFFSET_RATIO));
  const width = finalVerticalBoundary - firstVerticalBoundary;
  const height = finalHorizontalBoundary - firstHorizontalBoundary;
  const hasFlatLeadingEdge = best.intersectionSupportRatio >= MIN_FLAT_GRID_INTERSECTION_SUPPORT_RATIO
    && best.leadingIntersectionSupportRatio === FULL_INTERSECTION_SUPPORT_RATIO
    && firstHorizontalBoundary <= best.candidate.horizontal.origin;
  const refinementPhaseOffset = Math.max(
    -EDGE_PHASE_COMPATIBILITY_RADIUS,
    Math.min(EDGE_PHASE_COMPATIBILITY_RADIUS, firstHorizontalBoundary - best.candidate.horizontal.origin),
  );
  const yOuterOffset = hasFlatLeadingEdge
    ? -(ROW_SMOOTHING_SPAN - 1)
    : Math.max(
      0,
      Math.floor(best.candidate.horizontal.pitch * OUTER_EDGE_Y_START_OFFSET_RATIO)
        - ROW_SMOOTHING_SPAN
        + refinementPhaseOffset,
    );
  const top = Math.max(0, firstHorizontalBoundary - yOuterOffset);
  const pitchX = width / dimensions.columns;
  const pitchY = height / dimensions.rows;
  if (pitchX <= 0 || pitchY <= 0) return null;
  if (Math.abs(pitchX - pitchY) / Math.max(pitchX, pitchY) > MAX_PITCH_DIFFERENCE_RATIO) return null;

  return {
    bounds: { x: left, y: top, width, height },
    columns: dimensions.columns,
    rows: dimensions.rows,
    pitchX,
    pitchY,
    score: best.score,
  };
}

function roundedCellBoundary(origin: number, pitch: number, index: number): number {
  return Math.round(origin + index * pitch);
}

export function cellRect(grid: GridGeometry, column: number, row: number): Rect {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) {
    throw new RangeError("Cell coordinates are outside the grid.");
  }

  const x = roundedCellBoundary(grid.bounds.x, grid.pitchX, column);
  const y = roundedCellBoundary(grid.bounds.y, grid.pitchY, row);
  const right = roundedCellBoundary(grid.bounds.x, grid.pitchX, column + 1);
  const bottom = roundedCellBoundary(grid.bounds.y, grid.pitchY, row + 1);
  return { x, y, width: right - x, height: bottom - y };
}
