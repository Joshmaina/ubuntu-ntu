/**
 * FSRS-4.5 spaced repetition scheduler.
 *
 * ADR-0002: pure, dependency-free, deterministic. Every function that depends
 * on the current time takes it as an explicit parameter. This is what allows
 * the identical module to run on device and on the server, which in turn is
 * what makes event replay (ADR-0003) sound.
 *
 * Formulas verified against the FSRS reference specification — see
 * docs/adr/0006-fsrs-formula.md.
 */

import {
  DECAY,
  FACTOR,
  DEFAULT_CONFIG,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MIN_STABILITY,
  MILLISECONDS_PER_DAY,
} from './constants.js';
import {
  Rating,
  State,
  type Card,
  type FsrsConfig,
  type FsrsWeights,
  type ReviewResult,
} from './types.js';

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Probability of recalling an item after `elapsedDays`, given `stability`.
 *
 *   R(t, S) = (1 + FACTOR * t / S) ^ DECAY
 *
 * By construction R(S, S) = 0.9 — stability *is* the 90%-recall interval.
 */
export function retrievability(elapsedDays: number, stability: number): number {
  const t = Math.max(0, elapsedDays);
  const s = Math.max(MIN_STABILITY, stability);
  return (1 + (FACTOR * t) / s) ** DECAY;
}

/**
 * Interval at which retrievability will have decayed to `targetRetention`.
 * The exact inverse of `retrievability`.
 *
 *   I(r, S) = (S / FACTOR) * (r ^ (1 / DECAY) - 1)
 */
export function intervalFromRetention(stability: number, targetRetention: number): number {
  const s = Math.max(MIN_STABILITY, stability);
  return (s / FACTOR) * (targetRetention ** (1 / DECAY) - 1);
}

/** S0(G) = w[G-1] */
export function initialStability(rating: Rating, w: FsrsWeights): number {
  return Math.max(MIN_STABILITY, w[rating - 1]!);
}

/** D0(G) = w4 - (G - 3) * w5, clamped to [1, 10] */
export function initialDifficulty(rating: Rating, w: FsrsWeights): number {
  return clamp(w[4] - (rating - 3) * w[5], MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/**
 * Difficulty update with linear damping and mean reversion.
 *
 *   ΔD  = -w6 * (G - 3)
 *   D'  = D + ΔD * (10 - D) / 9        ← damping: change shrinks near the ceiling
 *   D'' = w7 * D0(3) + (1 - w7) * D'   ← reversion toward the Good baseline
 */
export function nextDifficulty(difficulty: number, rating: Rating, w: FsrsWeights): number {
  const delta = -w[6] * (rating - 3);
  const damped = difficulty + delta * ((MAX_DIFFICULTY - difficulty) / 9);
  const reverted = w[7] * initialDifficulty(Rating.Good, w) + (1 - w[7]) * damped;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/**
 * Stability after a successful recall (Hard, Good, or Easy).
 *
 *   S'r = S * (e^w8 * (11 - D) * S^-w9 * (e^(w10 * (1 - R)) - 1)
 *              * hardPenalty * easyBonus + 1)
 *
 * The three shaping terms: harder items gain less, already-stable items gain
 * proportionally less (diminishing returns), and a recall that was *unlikely*
 * to succeed — low R — teaches the model more than an easy one.
 */
export function stabilityOnRecall(
  difficulty: number,
  stability: number,
  r: number,
  rating: Rating,
  w: FsrsWeights,
): number {
  const s = Math.max(MIN_STABILITY, stability);
  const hardPenalty = rating === Rating.Hard ? w[15] : 1;
  const easyBonus = rating === Rating.Easy ? w[16] : 1;

  const growth =
    Math.exp(w[8]) *
    (11 - difficulty) *
    s ** -w[9] *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;

  return Math.max(MIN_STABILITY, s * (growth + 1));
}

/**
 * Stability after forgetting (rated Again).
 *
 *   S'f = w11 * D^-w12 * ((S + 1)^w13 - 1) * e^(w14 * (1 - R))
 *
 * Capped at the previous stability: forgetting must never be rewarded with a
 * longer interval than the learner already had.
 */
export function stabilityOnLapse(
  difficulty: number,
  stability: number,
  r: number,
  w: FsrsWeights,
): number {
  const s = Math.max(MIN_STABILITY, stability);
  const lapsed =
    w[11] * difficulty ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - r));
  return clamp(lapsed, MIN_STABILITY, s);
}

/** A card that has never been reviewed. */
export function emptyCard(): Card {
  return {
    state: State.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    due: null,
  };
}

/**
 * Apply a review and return the next card state plus an immutable log entry.
 *
 * `reviewedAt` is epoch milliseconds and is always supplied by the caller —
 * this function never reads a clock (NFR-062), which is what makes replay
 * reproducible.
 */
export function review(
  card: Card,
  rating: Rating,
  reviewedAt: number,
  config: FsrsConfig = DEFAULT_CONFIG,
): ReviewResult {
  const { w, requestRetention, maximumInterval } = config;

  const elapsedDays =
    card.lastReview === null ? 0 : Math.max(0, (reviewedAt - card.lastReview) / MILLISECONDS_PER_DAY);

  const isNew = card.state === State.New;
  const forgot = rating === Rating.Again;

  let stability: number;
  let difficulty: number;

  if (isNew) {
    stability = initialStability(rating, w);
    difficulty = initialDifficulty(rating, w);
  } else {
    const r = retrievability(elapsedDays, card.stability);
    difficulty = nextDifficulty(card.difficulty, rating, w);
    stability = forgot
      ? stabilityOnLapse(difficulty, card.stability, r, w)
      : stabilityOnRecall(difficulty, card.stability, r, rating, w);
  }

  // A lapse is only meaningful for an item that was actually known. Failing a
  // card that was never learned is not forgetting.
  const lapses = card.lapses + (forgot && card.state === State.Review ? 1 : 0);

  const nextState: State = forgot
    ? isNew
      ? State.Learning
      : State.Relearning
    : State.Review;

  const scheduledDays = clamp(
    Math.round(intervalFromRetention(stability, requestRetention)),
    1,
    maximumInterval,
  );

  return {
    card: {
      state: nextState,
      stability,
      difficulty,
      elapsedDays,
      scheduledDays,
      reps: card.reps + 1,
      lapses,
      lastReview: reviewedAt,
      due: reviewedAt + scheduledDays * MILLISECONDS_PER_DAY,
    },
    log: {
      rating,
      state: card.state,
      reviewedAt,
      elapsedDays,
      scheduledDays: card.scheduledDays,
    },
  };
}

/** Whether a card is due at `now` (epoch ms). Never-reviewed cards are due. */
export function isDue(card: Card, now: number): boolean {
  return card.due === null || card.due <= now;
}

/**
 * Cards due at `now`, most overdue first. Never-reviewed cards sort last among
 * due items, so genuinely lapsing material is seen before brand-new material.
 */
export function dueQueue<T extends Card>(cards: readonly T[], now: number): T[] {
  return cards
    .filter((card) => isDue(card, now))
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
}
