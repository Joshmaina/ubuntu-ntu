/**
 * Shared types for the learning core.
 *
 * ADR-0002: this package imports nothing and performs no I/O. Every function
 * that depends on the current time receives it as an explicit parameter.
 */

/** Learner's self-reported recall performance. FSRS grade G. */
export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const;

export type Rating = (typeof Rating)[keyof typeof Rating];

/** Lifecycle state of a card. */
export const State = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;

export type State = (typeof State)[keyof typeof State];

/**
 * Per-user memory state for one vocabulary item.
 *
 * `stability` is measured in days and is defined as the interval at which
 * retrievability falls to 0.9. `difficulty` is on [1, 10].
 */
export interface Card {
  readonly state: State;
  /** Days. 0 for a new card. */
  readonly stability: number;
  /** [1, 10]. 0 for a new card. */
  readonly difficulty: number;
  /** Days since the previous review at the moment of the last review. */
  readonly elapsedDays: number;
  /** Interval assigned at the last review, in days. */
  readonly scheduledDays: number;
  /** Total reviews. */
  readonly reps: number;
  /** Reviews rated Again while in Review state. */
  readonly lapses: number;
  /** Epoch milliseconds, or null if never reviewed. */
  readonly lastReview: number | null;
  /** Epoch milliseconds. */
  readonly due: number | null;
}

/** An immutable record that a card was reviewed. The unit of sync. */
export interface ReviewLog {
  readonly rating: Rating;
  readonly state: State;
  /** Epoch milliseconds. */
  readonly reviewedAt: number;
  readonly elapsedDays: number;
  readonly scheduledDays: number;
}

/** Result of applying a review: the next card state plus the log entry. */
export interface ReviewResult {
  readonly card: Card;
  readonly log: ReviewLog;
}

/**
 * FSRS-4.5 parameter vector. Exactly 17 elements.
 *
 * Verified against the FSRS reference specification, not transcribed from
 * memory — see docs/adr/0006-fsrs-formula.md.
 */
export type FsrsWeights = readonly [
  number, number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
];

export interface FsrsConfig {
  readonly w: FsrsWeights;
  /** Target retention on [0, 1). Standard default 0.9. */
  readonly requestRetention: number;
  /** Hard cap on any scheduled interval, in days. */
  readonly maximumInterval: number;
}

/** A single pitch sample. `null` semitones marks an unvoiced frame. */
export interface PitchPoint {
  /** Milliseconds from the start of the utterance. */
  readonly timeMs: number;
  /** Semitones relative to the speaker's baseline, or null if unvoiced. */
  readonly semitones: number | null;
}

/** How closely a learner's contour matched the reference. */
export const ToneVerdict = {
  Accurate: 'accurate',
  Close: 'close',
  Incorrect: 'incorrect',
} as const;

export type ToneVerdict = (typeof ToneVerdict)[keyof typeof ToneVerdict];

export interface ToneComparison {
  /** Root-mean-square deviation in semitones over voiced frames. */
  readonly rmsDeviationSemitones: number;
  /** Voiced frames compared. Zero means no comparison was possible. */
  readonly comparedFrames: number;
  readonly verdict: ToneVerdict;
}

/** One morpheme in an interlinear gloss. */
export interface Morpheme {
  /** Surface form in the target language. */
  readonly morph: string;
  /** Literal meaning in the anchor language. */
  readonly anchor?: string;
  /**
   * Grammatical category for morphemes with no lexical equivalent
   * (e.g. PRESENT, PLURAL). FR-043 forbids a blank cell.
   */
  readonly category?: string;
}
