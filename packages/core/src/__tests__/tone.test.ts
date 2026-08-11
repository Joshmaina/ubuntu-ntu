import { describe, it, expect } from 'vitest';
import {
  hzToSemitones,
  semitonesToHz,
  estimateBaselineHz,
  smoothContour,
  resampleContour,
  compareContours,
  buildContour,
} from '../tone.js';
import { ToneVerdict, type PitchPoint } from '../types.js';

const pt = (timeMs: number, semitones: number | null): PitchPoint => ({ timeMs, semitones });

describe('hzToSemitones', () => {
  it('returns 0 at the baseline', () => {
    expect(hzToSemitones(200, 200)).toBeCloseTo(0, 10);
  });

  it('returns +12 an octave up and -12 an octave down', () => {
    expect(hzToSemitones(400, 200)).toBeCloseTo(12, 10);
    expect(hzToSemitones(100, 200)).toBeCloseTo(-12, 10);
  });

  /**
   * The fairness property. A bass and a soprano producing the same tonal
   * *pattern* must yield the same semitone contour, so neither is penalised
   * for the voice they have.
   */
  it('gives identical semitones for the same relative pattern at different absolute pitches', () => {
    const low = hzToSemitones(120, 100);
    const high = hzToSemitones(360, 300);
    expect(low).toBeCloseTo(high!, 10);
  });

  it('rejects frequencies outside the plausible vocal range', () => {
    expect(hzToSemitones(20, 200)).toBeNull();
    expect(hzToSemitones(900, 200)).toBeNull();
  });

  it('rejects a non-positive baseline', () => {
    expect(hzToSemitones(200, 0)).toBeNull();
    expect(hzToSemitones(200, -100)).toBeNull();
  });
});

describe('semitonesToHz', () => {
  it('round-trips with hzToSemitones', () => {
    const semis = hzToSemitones(275, 200)!;
    expect(semitonesToHz(semis, 200)).toBeCloseTo(275, 8);
  });
});

describe('estimateBaselineHz', () => {
  it('returns the median of voiced samples', () => {
    expect(estimateBaselineHz([100, 200, 300])).toBe(200);
  });

  it('averages the middle pair for an even count', () => {
    expect(estimateBaselineHz([100, 200, 300, 400])).toBe(250);
  });

  it('ignores out-of-range samples', () => {
    expect(estimateBaselineHz([0, 200, 5000, 200])).toBe(200);
  });

  /** Median specifically so one octave-error frame cannot drag the baseline. */
  it('resists a single octave-error outlier', () => {
    expect(estimateBaselineHz([198, 200, 202, 400])).toBeCloseTo(201, 6);
  });

  it('returns null when nothing is voiced', () => {
    expect(estimateBaselineHz([])).toBeNull();
    expect(estimateBaselineHz([10, 20, 9000])).toBeNull();
  });
});

describe('smoothContour', () => {
  it('leaves a constant contour unchanged', () => {
    const input = [pt(0, 5), pt(10, 5), pt(20, 5)];
    expect(smoothContour(input).map((p) => p.semitones)).toEqual([5, 5, 5]);
  });

  it('damps a sudden jump', () => {
    const smoothed = smoothContour([pt(0, 0), pt(10, 10)], 0.3);
    expect(smoothed[1]!.semitones).toBeCloseTo(3, 10);
  });

  it('preserves unvoiced frames as null', () => {
    const smoothed = smoothContour([pt(0, 5), pt(10, null), pt(20, 5)]);
    expect(smoothed[1]!.semitones).toBeNull();
  });

  /**
   * Smoothing must not bridge a silence — that would draw a line through
   * pitch the speaker never produced.
   */
  it('restarts averaging after an unvoiced gap', () => {
    const smoothed = smoothContour([pt(0, 0), pt(10, null), pt(20, 10)], 0.3);
    expect(smoothed[2]!.semitones).toBe(10);
  });

  it('uses the default alpha when none is given', () => {
    expect(smoothContour([pt(0, 0), pt(10, 10)])[1]!.semitones).toBeCloseTo(3, 10);
  });
});

describe('resampleContour', () => {
  it('returns the requested number of points', () => {
    const input = [pt(0, 1), pt(10, 2), pt(20, 3), pt(30, 4)];
    expect(resampleContour(input, 2)).toHaveLength(2);
    expect(resampleContour(input, 8)).toHaveLength(8);
  });

  it('preserves the endpoints', () => {
    const input = [pt(0, 1), pt(10, 2), pt(20, 3)];
    const out = resampleContour(input, 5);
    expect(out[0]!.semitones).toBe(1);
    expect(out[4]!.semitones).toBe(3);
  });

  it('returns an empty array for a non-positive target', () => {
    expect(resampleContour([pt(0, 1)], 0)).toEqual([]);
    expect(resampleContour([pt(0, 1)], -1)).toEqual([]);
  });

  it('pads with unvoiced frames when the input is empty', () => {
    const out = resampleContour([], 3);
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.semitones === null)).toBe(true);
  });

  it('repeats a single input point', () => {
    expect(resampleContour([pt(0, 7)], 4).map((p) => p.semitones)).toEqual([7, 7, 7, 7]);
  });

  it('handles a target length of one', () => {
    expect(resampleContour([pt(0, 1), pt(10, 2)], 1)).toHaveLength(1);
  });
});

describe('compareContours', () => {
  it('reports zero deviation for identical contours', () => {
    const c = [pt(0, 0), pt(10, 3), pt(20, -2)];
    const result = compareContours(c, c);
    expect(result.rmsDeviationSemitones).toBeCloseTo(0, 10);
    expect(result.verdict).toBe(ToneVerdict.Accurate);
    expect(result.comparedFrames).toBe(3);
  });

  it('grades a small deviation as accurate', () => {
    const result = compareContours([pt(0, 0), pt(10, 3)], [pt(0, 1), pt(10, 3)]);
    expect(result.verdict).toBe(ToneVerdict.Accurate);
  });

  it('grades a moderate deviation as close', () => {
    const result = compareContours([pt(0, 0), pt(10, 0)], [pt(0, 2), pt(10, 2)]);
    expect(result.verdict).toBe(ToneVerdict.Close);
  });

  it('grades a large deviation as incorrect', () => {
    const result = compareContours([pt(0, 0), pt(10, 0)], [pt(0, 8), pt(10, 8)]);
    expect(result.verdict).toBe(ToneVerdict.Incorrect);
  });

  /** A learner who paused where the reference did not is not scored on silence. */
  it('compares only frames voiced in both contours', () => {
    const result = compareContours(
      [pt(0, 0), pt(10, null), pt(20, 5)],
      [pt(0, 0), pt(10, 4), pt(20, 5)],
    );
    expect(result.comparedFrames).toBe(2);
    expect(result.rmsDeviationSemitones).toBeCloseTo(0, 10);
  });

  it('handles the reference being unvoiced', () => {
    const result = compareContours([pt(0, 3)], [pt(0, null)]);
    expect(result.comparedFrames).toBe(0);
  });

  /** No overlap must not produce a misleadingly good score. */
  it('returns Incorrect with zero frames when there is no overlap', () => {
    const result = compareContours([pt(0, null)], [pt(0, null)]);
    expect(result.comparedFrames).toBe(0);
    expect(result.verdict).toBe(ToneVerdict.Incorrect);
    expect(result.rmsDeviationSemitones).toBe(Infinity);
  });

  it('compares over the shorter of the two contours', () => {
    const result = compareContours([pt(0, 0), pt(10, 0), pt(20, 0)], [pt(0, 0)]);
    expect(result.comparedFrames).toBe(1);
  });
});

describe('buildContour', () => {
  it('converts frequencies to a timed semitone contour', () => {
    const contour = buildContour([200, 200, 400], 10, 200);
    expect(contour).toHaveLength(3);
    expect(contour[0]!.timeMs).toBe(0);
    expect(contour[1]!.timeMs).toBe(10);
    expect(contour[0]!.semitones).toBeCloseTo(0, 10);
  });

  it('marks out-of-range frames unvoiced', () => {
    expect(buildContour([200, 0, 200], 10, 200)[1]!.semitones).toBeNull();
  });

  it('guards against a non-positive frame interval', () => {
    const contour = buildContour([200, 200], 0, 200);
    expect(contour.every((p) => Number.isFinite(p.timeMs))).toBe(true);
  });

  it('produces an empty contour from empty input', () => {
    expect(buildContour([], 10, 200)).toEqual([]);
  });
});
