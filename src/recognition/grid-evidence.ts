export interface AxisPitchBucket {
  readonly pitch: number;
  readonly normalizedScore: number;
  readonly candidateCount: number;
}

export interface CoarsePitchEvidence {
  readonly vertical: readonly AxisPitchBucket[];
  readonly horizontal: readonly AxisPitchBucket[];
}

const MAX_PITCH_DIFFERENCE_RATIO = 0.05;
const MIN_FAMILY_SCORE = 0.65;
const MIN_FAMILY_SCORE_SEPARATION_RATIO = 0.05;
const MIN_CANONICAL_PITCH = 30;
const MAX_CANONICAL_PITCH = 50;

interface PitchFamily {
  readonly pitches: readonly number[];
}

interface FamilyCandidate {
  readonly pitch: number;
  readonly score: number;
}

function pitchesAreCompatible(first: number, second: number): boolean {
  return Math.abs(first - second) / Math.max(first, second) <= MAX_PITCH_DIFFERENCE_RATIO;
}

function isValidBucket(bucket: AxisPitchBucket): boolean {
  return Number.isFinite(bucket.pitch)
    && bucket.pitch > 0
    && Number.isFinite(bucket.normalizedScore)
    && bucket.normalizedScore >= 0
    && bucket.normalizedScore <= 1
    && Number.isInteger(bucket.candidateCount)
    && bucket.candidateCount > 0;
}

function pitchFamilies(evidence: CoarsePitchEvidence): readonly PitchFamily[] {
  const pitches = [...new Set([...evidence.vertical, ...evidence.horizontal].map((bucket) => bucket.pitch))]
    .sort((first, second) => first - second);
  const families: number[][] = [];
  for (const pitch of pitches) {
    const family = families.at(-1);
    if (family !== undefined && pitchesAreCompatible(family[0]!, pitch)) {
      family.push(pitch);
    } else {
      families.push([pitch]);
    }
  }
  return families.map((pitches) => ({ pitches }));
}

function bestCompatiblePair(
  evidence: CoarsePitchEvidence,
  family: PitchFamily,
): { readonly vertical: FamilyCandidate; readonly horizontal: FamilyCandidate } | null {
  const pitches = new Set(family.pitches);
  let best: { readonly vertical: FamilyCandidate; readonly horizontal: FamilyCandidate } | null = null;
  for (const vertical of evidence.vertical) {
    if (!pitches.has(vertical.pitch)) continue;
    for (const horizontal of evidence.horizontal) {
      if (!pitches.has(horizontal.pitch) || !pitchesAreCompatible(vertical.pitch, horizontal.pitch)) continue;
      const candidate = {
        vertical: { pitch: vertical.pitch, score: vertical.normalizedScore },
        horizontal: { pitch: horizontal.pitch, score: horizontal.normalizedScore },
      };
      const candidateScore = Math.min(candidate.vertical.score, candidate.horizontal.score);
      const bestScore = best === null ? Number.NEGATIVE_INFINITY : Math.min(best.vertical.score, best.horizontal.score);
      if (candidateScore > bestScore) best = candidate;
    }
  }
  return best;
}

export function estimateCanonicalPitch(evidence: CoarsePitchEvidence): number | null {
  if (
    evidence.vertical.length === 0
    || evidence.horizontal.length === 0
    || !evidence.vertical.every(isValidBucket)
    || !evidence.horizontal.every(isValidBucket)
  ) return null;

  const families = pitchFamilies(evidence)
    .map((family) => bestCompatiblePair(evidence, family))
    .filter((candidate): candidate is { readonly vertical: FamilyCandidate; readonly horizontal: FamilyCandidate } => candidate !== null)
    .sort((first, second) => (
      Math.min(second.vertical.score, second.horizontal.score) - Math.min(first.vertical.score, first.horizontal.score)
    ));
  const best = families[0];
  if (best === undefined) return null;

  const bestScore = Math.min(best.vertical.score, best.horizontal.score);
  const runnerUp = families[1];
  const runnerUpScore = runnerUp === undefined ? null : Math.min(runnerUp.vertical.score, runnerUp.horizontal.score);
  if (
    bestScore < MIN_FAMILY_SCORE
    || (runnerUpScore !== null && (bestScore - runnerUpScore) / bestScore < MIN_FAMILY_SCORE_SEPARATION_RATIO)
  ) return null;

  const estimate = (best.vertical.pitch * best.vertical.score + best.horizontal.pitch * best.horizontal.score)
    / (best.vertical.score + best.horizontal.score);
  return estimate >= MIN_CANONICAL_PITCH && estimate <= MAX_CANONICAL_PITCH
    && pitchesAreCompatible(best.vertical.pitch, best.horizontal.pitch)
    ? estimate
    : null;
}
