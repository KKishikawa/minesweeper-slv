import { buildEdgeProfiles } from "./grid.js";
import type { GridGeometry, PixelImage } from "./types.js";

const MIN_PITCH = 8;
const MAX_PITCH = 96;
const MIN_COLUMNS = 8;
const MAX_COLUMNS = 60;
const MIN_ROWS = 8;
const MAX_ROWS = 40;
const MAX_PITCH_MISMATCH_RATIO = 0.05;
const MIN_SCORE_SEPARATION_RATIO = 0.05;
const OUTER_BOUNDARY_WEIGHT = 3;
const RED_MINIMUM = 150;
const GREEN_BLUE_MAXIMUM = 100;
const RED_CHANNEL_SEPARATION = 80;
const SEGMENT_PRESENT_RATIO = 0.2;
const MIN_DIGIT_CONFIDENCE = 0.15;

interface AxisCandidate {
  readonly count: number;
  readonly pitch: number;
  readonly score: number;
}

interface DimensionCandidate {
  readonly columns: number;
  readonly rows: number;
  readonly score: number;
}

interface DigitGroup {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
}

interface RecognizedDigit {
  readonly digit: number;
  readonly confidence: number;
}

export interface CounterRecognition {
  readonly value: number;
  readonly digits: readonly [number, number, number];
  readonly confidence: number;
}

function hasRgbaPixels(image: PixelImage): boolean {
  return Number.isInteger(image.width)
    && Number.isInteger(image.height)
    && image.width > 0
    && image.height > 0
    && image.data.length === image.width * image.height * 4;
}

function mean(profile: Float64Array): number {
  let total = 0;
  for (const value of profile) total += value;
  return total / profile.length;
}

function localEnergy(profile: Float64Array, position: number): number {
  const start = Math.max(0, position - 1);
  const end = Math.min(profile.length - 1, position + 1);
  let maximum = 0;
  for (let index = start; index <= end; index += 1) maximum = Math.max(maximum, profile[index]!);
  return maximum;
}

function findAxisCandidates(
  profile: Float64Array,
  minimumCount: number,
  maximumCount: number,
): readonly AxisCandidate[] {
  const baseline = mean(profile);
  if (baseline <= 0) return [];

  const candidates = new Map<string, AxisCandidate>();
  const profilePrefix = [0];
  for (const energy of profile) profilePrefix.push(profilePrefix[profilePrefix.length - 1]! + energy);
  const maximumPitch = Math.min(MAX_PITCH, profile.length - 1);
  for (let pitch = MIN_PITCH; pitch <= maximumPitch; pitch += 1) {
    for (let phase = 0; phase < pitch; phase += 1) {
      const energies: number[] = [];
      const energyPrefix = [0];
      for (let position = phase; position < profile.length; position += pitch) {
        const energy = localEnergy(profile, position);
        energies.push(energy);
        energyPrefix.push(energyPrefix[energyPrefix.length - 1]! + energy);
      }

      for (let count = minimumCount; count <= maximumCount && count <= energies.length; count += 1) {
        for (let start = 0; start + count <= energies.length; start += 1) {
          const end = start + count;
          const selectedEnergy = energyPrefix[end]! - energyPrefix[start]!
            + (OUTER_BOUNDARY_WEIGHT - 1) * (energies[start]! + energies[end - 1]!);
          const rangeStart = phase + start * pitch;
          const rangeEnd = phase + (end - 1) * pitch;
          const rangeEnergy = profilePrefix[rangeEnd + 1]! - profilePrefix[rangeStart]!;
          if (rangeEnergy <= 0) continue;

          const normalizedStrength = selectedEnergy / (count + 2 * (OUTER_BOUNDARY_WEIGHT - 1)) / baseline;
          const unweightedSelectedEnergy = energyPrefix[end]! - energyPrefix[start]!;
          const coverage = unweightedSelectedEnergy / rangeEnergy;
          const score = normalizedStrength * coverage;
          const key = `${count}|${pitch}`;
          const existing = candidates.get(key);
          if (!existing || score > existing.score) {
            candidates.set(key, {
              count,
              pitch,
              score,
            });
          }
        }
      }
    }
  }

  return [...candidates.values()];
}

function selectDimensionCandidates(
  vertical: readonly AxisCandidate[],
  horizontal: readonly AxisCandidate[],
): readonly DimensionCandidate[] {
  const dimensions = new Map<string, DimensionCandidate>();
  for (const verticalCandidate of vertical) {
    for (const horizontalCandidate of horizontal) {
      const pitchDifference = Math.abs(verticalCandidate.pitch - horizontalCandidate.pitch);
      const largestPitch = Math.max(verticalCandidate.pitch, horizontalCandidate.pitch);
      if (pitchDifference / largestPitch > MAX_PITCH_MISMATCH_RATIO) continue;

      const columns = verticalCandidate.count - 1;
      const rows = horizontalCandidate.count - 1;
      const score = (verticalCandidate.score + horizontalCandidate.score) / 2;
      const key = `${columns}|${rows}`;
      const existing = dimensions.get(key);
      if (!existing || score > existing.score) dimensions.set(key, { columns, rows, score });
    }
  }
  return [...dimensions.values()].sort((first, second) => second.score - first.score);
}

export function inferDimensions(image: PixelImage): { readonly columns: number; readonly rows: number } | null {
  if (!hasRgbaPixels(image)) return null;

  const profiles = buildEdgeProfiles(image);
  const vertical = findAxisCandidates(profiles.vertical, MIN_COLUMNS + 1, MAX_COLUMNS + 1);
  const horizontal = findAxisCandidates(profiles.horizontal, MIN_ROWS + 1, MAX_ROWS + 1);
  const candidates = selectDimensionCandidates(vertical, horizontal);
  const [best, runnerUp] = candidates;
  if (!best) return null;
  if (runnerUp && (best.score - runnerUp.score) / best.score < MIN_SCORE_SEPARATION_RATIO) return null;
  return { columns: best.columns, rows: best.rows };
}

function isCounterRed(image: PixelImage, x: number, y: number): boolean {
  const offset = (y * image.width + x) * 4;
  const red = image.data[offset]!;
  const green = image.data[offset + 1]!;
  const blue = image.data[offset + 2]!;
  return red >= RED_MINIMUM
    && green <= GREEN_BLUE_MAXIMUM
    && blue <= GREEN_BLUE_MAXIMUM
    && red - green >= RED_CHANNEL_SEPARATION
    && red - blue >= RED_CHANNEL_SEPARATION;
}

function collectDigitGroups(image: PixelImage, grid: GridGeometry): readonly DigitGroup[] {
  const left = Math.max(0, Math.ceil(grid.bounds.x));
  const right = Math.min(image.width, Math.floor(grid.bounds.x + grid.bounds.width / 2));
  const bottom = Math.min(image.height, Math.floor(grid.bounds.y));
  const groups: DigitGroup[] = [];
  let active: { x: number; y: number; width: number; height: number; pixels: number } | null = null;

  for (let x = left; x < right; x += 1) {
    let pixels = 0;
    let top = bottom;
    let last = -1;
    for (let y = 0; y < bottom; y += 1) {
      if (!isCounterRed(image, x, y)) continue;
      pixels += 1;
      top = Math.min(top, y);
      last = Math.max(last, y);
    }

    if (pixels === 0) {
      if (active) {
        groups.push(active);
        active = null;
      }
      continue;
    }

    if (!active) {
      active = { x, y: top, width: 1, height: last - top + 1, pixels };
      continue;
    }

    active.width += 1;
    active.y = Math.min(active.y, top);
    active.height = Math.max(active.y + active.height - 1, last) - active.y + 1;
    active.pixels += pixels;
  }
  if (active) groups.push(active);

  return groups.filter((group) => group.width >= 4 && group.height >= 8 && group.pixels >= 12);
}

function hasConsistentBoxes(groups: readonly DigitGroup[]): groups is readonly [DigitGroup, DigitGroup, DigitGroup] {
  if (groups.length !== 3) return false;
  const widths = groups.map((group) => group.width);
  const heights = groups.map((group) => group.height);
  const smallestWidth = Math.min(...widths);
  const largestWidth = Math.max(...widths);
  const smallestHeight = Math.min(...heights);
  const largestHeight = Math.max(...heights);
  if (smallestWidth / largestWidth < 0.5 || smallestHeight / largestHeight < 0.7) return false;

  return groups.every((group, index) => {
    if (index === 0) return true;
    const previous = groups[index - 1]!;
    const gap = group.x - (previous.x + previous.width);
    return gap >= 0 && gap <= largestWidth;
  });
}

function segmentRatio(
  image: PixelImage,
  group: DigitGroup,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
): number {
  const left = Math.floor(group.x + group.width * xStart);
  const right = Math.ceil(group.x + group.width * xEnd);
  const top = Math.floor(group.y + group.height * yStart);
  const bottom = Math.ceil(group.y + group.height * yEnd);
  let red = 0;
  let total = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      total += 1;
      if (isCounterRed(image, x, y)) red += 1;
    }
  }
  return total === 0 ? 0 : red / total;
}

const segmentRegions = [
  [0.2, 0.8, 0, 0.22],
  [0.8, 1, 0.1, 0.48],
  [0.8, 1, 0.52, 0.9],
  [0.2, 0.8, 0.78, 1],
  [0, 0.2, 0.52, 0.9],
  [0, 0.2, 0.1, 0.48],
  [0.25, 0.75, 0.4, 0.6],
] as const;

const digitMasks = new Map<number, number>([
  [0b0111111, 0],
  [0b0000110, 1],
  [0b1011011, 2],
  [0b1001111, 3],
  [0b1100110, 4],
  [0b1101101, 5],
  [0b1111101, 6],
  [0b0000111, 7],
  [0b1111111, 8],
  [0b1101111, 9],
]);

function recognizeDigit(image: PixelImage, group: DigitGroup): RecognizedDigit | null {
  const ratios = segmentRegions.map(([xStart, xEnd, yStart, yEnd]) => (
    segmentRatio(image, group, xStart, xEnd, yStart, yEnd)
  ));
  let mask = 0;
  for (let segment = 0; segment < ratios.length; segment += 1) {
    if (ratios[segment]! >= SEGMENT_PRESENT_RATIO) mask |= 1 << segment;
  }

  const digit = digitMasks.get(mask);
  if (digit === undefined) return null;
  const expectedPresent = ratios.filter((_, segment) => (mask & (1 << segment)) !== 0);
  const expectedAbsent = ratios.filter((_, segment) => (mask & (1 << segment)) === 0);
  const confidence = Math.min(
    ...expectedPresent,
    ...expectedAbsent.map((ratio) => 1 - ratio),
  );
  return confidence >= MIN_DIGIT_CONFIDENCE ? { digit, confidence } : null;
}

export function readRemainingMineCounter(image: PixelImage, grid: GridGeometry): CounterRecognition | null {
  if (!hasRgbaPixels(image)) return null;
  const groups = collectDigitGroups(image, grid);
  if (!hasConsistentBoxes(groups)) return null;

  const recognized = groups.map((group) => recognizeDigit(image, group));
  const [first, second, third] = recognized;
  if (!first || !second || !third) return null;
  return {
    value: first.digit * 100 + second.digit * 10 + third.digit,
    digits: [first.digit, second.digit, third.digit],
    confidence: Math.min(first.confidence, second.confidence, third.confidence),
  };
}
