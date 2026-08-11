/**
 * FSRS-4.5 constants.
 *
 * ADR-0006 isolates the forgetting-curve choice to this file so that changing
 * it is a one-line edit plus regenerated fixtures, rather than a hunt through
 * the scheduler.
 *
 * Values verified against the FSRS reference specification
 * (open-spaced-repetition/awesome-fsrs wiki, "The Algorithm"), NOT transcribed
 * from memory or from any prior discussion.
 */

import type { FsrsConfig, FsrsWeights } from './types.js';

/**
 * Forgetting-curve shape.
 *
 *   R(t, S) = (1 + FACTOR * t / S) ^ DECAY
 *
 * FACTOR is derived so that R(S, S) = 0.9 exactly — which is what makes
 * "stability" mean "the interval at which recall probability is 90%":
 *
 *   (1 + 19/81) ^ -0.5 = (100/81) ^ -0.5 = 0.9   ✓
 *
 * The two values are therefore not independent. `FACTOR` is expressed as a
 * literal fraction rather than a decimal to keep that relationship exact.
 */
export const DECAY = -0.5;
export const FACTOR = 19 / 81;

/** FSRS-4.5 default parameters. Exactly 17 — FSRS-5 introduced 19. */
export const DEFAULT_WEIGHTS: FsrsWeights = [
  0.4872,   // w0  initial stability, Again
  1.4003,   // w1  initial stability, Hard
  3.7145,   // w2  initial stability, Good
  13.8206,  // w3  initial stability, Easy
  5.1618,   // w4  initial difficulty base
  1.2298,   // w5  initial difficulty slope
  0.8975,   // w6  difficulty delta per grade
  0.031,    // w7  mean-reversion strength
  1.6474,   // w8  recall stability: base
  0.1367,   // w9  recall stability: stability exponent
  1.0461,   // w10 recall stability: retrievability factor
  2.1072,   // w11 post-lapse stability: base
  0.0793,   // w12 post-lapse stability: difficulty exponent
  0.3246,   // w13 post-lapse stability: stability exponent
  1.587,    // w14 post-lapse stability: retrievability factor
  0.2272,   // w15 hard penalty
  2.8755,   // w16 easy bonus
];

export const DEFAULT_CONFIG: FsrsConfig = {
  w: DEFAULT_WEIGHTS,
  requestRetention: 0.9,
  maximumInterval: 36500,
};

/** Difficulty is clamped to this range throughout. */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/** Stability floor, in days. Prevents division by zero and absurd intervals. */
export const MIN_STABILITY = 0.01;

export const MILLISECONDS_PER_DAY = 86_400_000;

/** Tone comparison thresholds, in semitones RMS deviation. */
export const TONE_ACCURATE_THRESHOLD = 1.5;
export const TONE_CLOSE_THRESHOLD = 3.0;
