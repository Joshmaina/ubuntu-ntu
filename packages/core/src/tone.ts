/**
 * Tone and pitch mathematics.
 *
 * Shared verbatim between mobile and web (ADR-0007). FR-208 requires that
 * identical audio produce identical contours on both surfaces — which holds
 * trivially because both call these exact functions.
 */

import {
  TONE_ACCURATE_THRESHOLD,
  TONE_CLOSE_THRESHOLD,
  MIN_STABILITY,
} from './constants.js';
import { ToneVerdict, type PitchPoint, type ToneComparison } from './types.js';

/** Plausible human vocal range, in Hz. Outside this, treat as unvoiced. */
const MIN_VOCAL_HZ = 50;
const MAX_VOCAL_HZ = 500;

/**
 * Convert an absolute frequency to semitones relative to a speaker's baseline.
 *
 *   semitones = 12 * log2(f / baseline)
 *
 * This normalisation is what makes the feedback *fair*. A bass voice and a
 * soprano produce entirely different absolute frequencies for the same tonal
 * pattern; comparing raw Hz would tell a low-voiced learner they are
 * permanently wrong. Comparing shape relative to each speaker's own baseline
 * measures the thing that actually carries meaning.
 *
 * Returns null for unvoiced or implausible input rather than a sentinel
 * number — a zero here would draw a false line to the bottom of the chart.
 */
export function hzToSemitones(hz: number, baselineHz: number): number | null {
  if (hz < MIN_VOCAL_HZ || hz > MAX_VOCAL_HZ) return null;
  if (baselineHz <= 0) return null;
  return 12 * Math.log2(hz / baselineHz);
}

/** Inverse of `hzToSemitones`. */
export function semitonesToHz(semitones: number, baselineHz: number): number {
  return baselineHz * 2 ** (semitones / 12);
}

/**
 * Median of the voiced frames — the speaker's baseline pitch.
 *
 * Median rather than mean because pitch tracking produces occasional octave
 * errors, and a single frame misdetected an octave high would drag a mean
 * noticeably while barely moving a median.
 */
export function estimateBaselineHz(samplesHz: readonly number[]): number | null {
  const voiced = samplesHz
    .filter((hz) => hz >= MIN_VOCAL_HZ && hz <= MAX_VOCAL_HZ)
    .sort((a, b) => a - b);

  if (voiced.length === 0) return null;

  const mid = Math.floor(voiced.length / 2);
  return voiced.length % 2 === 0 ? (voiced[mid - 1]! + voiced[mid]!) / 2 : voiced[mid]!;
}

/**
 * Exponential moving average over a contour, preserving unvoiced breaks.
 *
 * Smoothing must not bridge an unvoiced gap: doing so would draw a line
 * through a silence the speaker never produced, and the averaging is reset
 * on each new voiced run for exactly that reason.
 */
export function smoothContour(
  points: readonly PitchPoint[],
  alpha = 0.3,
): PitchPoint[] {
  let previous: number | null = null;

  return points.map((point) => {
    if (point.semitones === null) {
      previous = null;
      return point;
    }
    const smoothed =
      previous === null ? point.semitones : alpha * point.semitones + (1 - alpha) * previous;
    previous = smoothed;
    return { timeMs: point.timeMs, semitones: smoothed };
  });
}

/**
 * Resample a contour onto a fixed number of evenly spaced points, so contours
 * of different durations can be compared frame-for-frame.
 *
 * Nearest-neighbour rather than interpolation, because interpolating across an
 * unvoiced boundary would invent pitch data that was never uttered.
 */
export function resampleContour(
  points: readonly PitchPoint[],
  targetLength: number,
): PitchPoint[] {
  if (targetLength <= 0) return [];
  if (points.length === 0) {
    return Array.from({ length: targetLength }, (_, i) => ({ timeMs: i, semitones: null }));
  }
  if (points.length === 1) {
    return Array.from({ length: targetLength }, () => points[0]!);
  }

  const lastIndex = points.length - 1;
  return Array.from({ length: targetLength }, (_, i) => {
    const position = targetLength === 1 ? 0 : (i / (targetLength - 1)) * lastIndex;
    return points[Math.round(position)]!;
  });
}

/**
 * Compare a learner's contour against the native reference.
 *
 * Only frames voiced in *both* contours are compared. A learner who paused
 * where the reference speaker did not should not be scored on the silence.
 *
 * Returns `comparedFrames: 0` and an Incorrect verdict when no overlap exists —
 * the caller should prompt a retry rather than display a misleading score.
 */
export function compareContours(
  learner: readonly PitchPoint[],
  reference: readonly PitchPoint[],
): ToneComparison {
  const length = Math.min(learner.length, reference.length);

  let sumSquares = 0;
  let compared = 0;

  for (let i = 0; i < length; i++) {
    const a = learner[i]!.semitones;
    const b = reference[i]!.semitones;
    if (a === null || b === null) continue;
    sumSquares += (a - b) ** 2;
    compared++;
  }

  if (compared === 0) {
    return {
      rmsDeviationSemitones: Infinity,
      comparedFrames: 0,
      verdict: ToneVerdict.Incorrect,
    };
  }

  const rms = Math.sqrt(sumSquares / compared);

  return {
    rmsDeviationSemitones: rms,
    comparedFrames: compared,
    verdict:
      rms <= TONE_ACCURATE_THRESHOLD
        ? ToneVerdict.Accurate
        : rms <= TONE_CLOSE_THRESHOLD
          ? ToneVerdict.Close
          : ToneVerdict.Incorrect,
  };
}

/**
 * Build a normalised contour from raw per-frame frequencies.
 * The full pipeline: gate implausible values, convert to relative semitones,
 * then smooth.
 */
export function buildContour(
  samplesHz: readonly number[],
  frameIntervalMs: number,
  baselineHz: number,
): PitchPoint[] {
  const interval = Math.max(MIN_STABILITY, frameIntervalMs);
  const raw = samplesHz.map((hz, i) => ({
    timeMs: i * interval,
    semitones: hzToSemitones(hz, baselineHz),
  }));
  return smoothContour(raw);
}
