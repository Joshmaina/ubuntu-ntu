import { describe, it, expect } from 'vitest';
import {
  retrievability,
  intervalFromRetention,
  initialStability,
  initialDifficulty,
  nextDifficulty,
  stabilityOnRecall,
  stabilityOnLapse,
  emptyCard,
  review,
  isDue,
  dueQueue,
} from '../fsrs.js';
import {
  DECAY,
  FACTOR,
  DEFAULT_CONFIG,
  DEFAULT_WEIGHTS,
  MILLISECONDS_PER_DAY,
} from '../constants.js';
import { Rating, State, type Card } from '../types.js';

const W = DEFAULT_WEIGHTS;
const DAY = MILLISECONDS_PER_DAY;
const T0 = 1_760_000_000_000; // fixed epoch — never read the clock in tests

describe('constants', () => {
  it('has exactly 17 weights (FSRS-4.5, not FSRS-5)', () => {
    expect(DEFAULT_WEIGHTS).toHaveLength(17);
  });

  /**
   * The defining property of the whole model: FACTOR is chosen so that
   * retrievability is exactly 0.9 when elapsed time equals stability.
   * If this fails, "stability" no longer means what every other formula
   * assumes it means.
   */
  it('FACTOR and DECAY satisfy R(S,S) = 0.9', () => {
    expect((1 + FACTOR) ** DECAY).toBeCloseTo(0.9, 12);
  });
});

describe('retrievability', () => {
  it('is 1 at zero elapsed time', () => {
    expect(retrievability(0, 10)).toBeCloseTo(1, 12);
  });

  it('is 0.9 when elapsed equals stability, for any stability', () => {
    for (const s of [0.5, 1, 10, 365, 10_000]) {
      expect(retrievability(s, s)).toBeCloseTo(0.9, 10);
    }
  });

  it('decreases monotonically with elapsed time', () => {
    const values = [0, 1, 5, 20, 100, 1000].map((t) => retrievability(t, 10));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });

  it('increases with stability at fixed elapsed time', () => {
    expect(retrievability(10, 100)).toBeGreaterThan(retrievability(10, 10));
  });

  it('clamps non-positive stability to the floor rather than dividing by zero', () => {
    expect(Number.isFinite(retrievability(10, 0))).toBe(true);
    expect(Number.isFinite(retrievability(10, -5))).toBe(true);
  });

  it('treats negative elapsed time as zero', () => {
    expect(retrievability(-3, 10)).toBeCloseTo(1, 12);
  });
});

describe('intervalFromRetention', () => {
  it('returns stability when target retention is 0.9', () => {
    expect(intervalFromRetention(10, 0.9)).toBeCloseTo(10, 6);
  });

  it('is the exact inverse of retrievability', () => {
    for (const r of [0.75, 0.8, 0.9, 0.95]) {
      const t = intervalFromRetention(20, r);
      expect(retrievability(t, 20)).toBeCloseTo(r, 10);
    }
  });

  it('gives shorter intervals for higher target retention', () => {
    expect(intervalFromRetention(10, 0.95)).toBeLessThan(intervalFromRetention(10, 0.8));
  });
});

describe('initialStability', () => {
  it('maps each rating to its weight w0..w3', () => {
    expect(initialStability(Rating.Again, W)).toBe(W[0]);
    expect(initialStability(Rating.Hard, W)).toBe(W[1]);
    expect(initialStability(Rating.Good, W)).toBe(W[2]);
    expect(initialStability(Rating.Easy, W)).toBe(W[3]);
  });

  it('increases with rating', () => {
    expect(initialStability(Rating.Again, W)).toBeLessThan(initialStability(Rating.Easy, W));
  });

  it('never returns below the stability floor', () => {
    const tiny = [...W] as unknown as typeof W;
    (tiny as unknown as number[])[0] = 0;
    expect(initialStability(Rating.Again, tiny)).toBeGreaterThan(0);
  });
});

describe('initialDifficulty', () => {
  it('follows D0(G) = w4 - (G-3) * w5', () => {
    expect(initialDifficulty(Rating.Good, W)).toBeCloseTo(W[4], 10);
    expect(initialDifficulty(Rating.Hard, W)).toBeCloseTo(W[4] + W[5], 10);
    expect(initialDifficulty(Rating.Again, W)).toBeCloseTo(W[4] + 2 * W[5], 10);
    expect(initialDifficulty(Rating.Easy, W)).toBeCloseTo(W[4] - W[5], 10);
  });

  it('decreases as the rating improves', () => {
    expect(initialDifficulty(Rating.Again, W)).toBeGreaterThan(initialDifficulty(Rating.Easy, W));
  });

  it('clamps to [1, 10]', () => {
    // w4 = 5, w5 = 40 drives Again to 5 + 80 = 85 (clamps high) and
    // Easy to 5 - 40 = -35 (clamps low), exercising both bounds.
    const extreme = [...W] as unknown as number[];
    extreme[4] = 5;
    extreme[5] = 40;
    const w = extreme as unknown as typeof W;
    expect(initialDifficulty(Rating.Again, w)).toBe(10);
    expect(initialDifficulty(Rating.Easy, w)).toBe(1);
  });
});

describe('nextDifficulty', () => {
  it('increases difficulty on Again and decreases it on Easy', () => {
    const d = 5;
    expect(nextDifficulty(d, Rating.Again, W)).toBeGreaterThan(d);
    expect(nextDifficulty(d, Rating.Easy, W)).toBeLessThan(d);
  });

  it('applies linear damping so change shrinks as difficulty approaches 10', () => {
    const lowDelta = nextDifficulty(2, Rating.Again, W) - 2;
    const highDelta = nextDifficulty(9, Rating.Again, W) - 9;
    expect(highDelta).toBeLessThan(lowDelta);
  });

  it('reverts toward D0(Good) — never past it, and stays clamped', () => {
    // Repeated Good should converge on the mean-reversion target D0(3) = w4.
    let d = 10;
    for (let i = 0; i < 500; i++) d = nextDifficulty(d, Rating.Good, W);
    expect(d).toBeCloseTo(W[4], 3);
  });

  it('stays within [1, 10] under repeated extreme input', () => {
    let hard = 5;
    let easy = 5;
    for (let i = 0; i < 200; i++) {
      hard = nextDifficulty(hard, Rating.Again, W);
      easy = nextDifficulty(easy, Rating.Easy, W);
    }
    expect(hard).toBeLessThanOrEqual(10);
    expect(hard).toBeGreaterThanOrEqual(1);
    expect(easy).toBeLessThanOrEqual(10);
    expect(easy).toBeGreaterThanOrEqual(1);
  });
});

describe('stabilityOnRecall', () => {
  it('never decreases stability', () => {
    for (const s of [1, 10, 100]) {
      for (const g of [Rating.Hard, Rating.Good, Rating.Easy] as const) {
        expect(stabilityOnRecall(5, s, 0.9, g, W)).toBeGreaterThanOrEqual(s);
      }
    }
  });

  it('rewards Easy more than Good, and Good more than Hard', () => {
    const hard = stabilityOnRecall(5, 10, 0.9, Rating.Hard, W);
    const good = stabilityOnRecall(5, 10, 0.9, Rating.Good, W);
    const easy = stabilityOnRecall(5, 10, 0.9, Rating.Easy, W);
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it('grows more when recall was less likely (lower R)', () => {
    const atRisk = stabilityOnRecall(5, 10, 0.6, Rating.Good, W);
    const easyRecall = stabilityOnRecall(5, 10, 0.99, Rating.Good, W);
    expect(atRisk).toBeGreaterThan(easyRecall);
  });

  it('grows less for harder items', () => {
    expect(stabilityOnRecall(9, 10, 0.9, Rating.Good, W))
      .toBeLessThan(stabilityOnRecall(2, 10, 0.9, Rating.Good, W));
  });

  it('exhibits diminishing returns as stability rises', () => {
    const smallGain = stabilityOnRecall(5, 1, 0.9, Rating.Good, W) / 1;
    const largeGain = stabilityOnRecall(5, 100, 0.9, Rating.Good, W) / 100;
    expect(largeGain).toBeLessThan(smallGain);
  });
});

describe('stabilityOnLapse', () => {
  it('produces stability at or below the previous value', () => {
    for (const s of [1, 10, 100]) {
      expect(stabilityOnLapse(5, s, 0.9, W)).toBeLessThanOrEqual(s);
    }
  });

  it('never returns below the floor', () => {
    expect(stabilityOnLapse(10, 0.001, 0.1, W)).toBeGreaterThan(0);
  });

  it('is lower for more difficult items', () => {
    expect(stabilityOnLapse(10, 20, 0.9, W)).toBeLessThan(stabilityOnLapse(1, 20, 0.9, W));
  });
});

describe('emptyCard', () => {
  it('starts New with zeroed state and no due date', () => {
    const c = emptyCard();
    expect(c.state).toBe(State.New);
    expect(c.stability).toBe(0);
    expect(c.difficulty).toBe(0);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(c.lastReview).toBeNull();
    expect(c.due).toBeNull();
  });
});

describe('review — first review of a new card', () => {
  it('moves New to Review and initialises stability and difficulty', () => {
    const { card } = review(emptyCard(), Rating.Good, T0, DEFAULT_CONFIG);
    expect(card.state).toBe(State.Review);
    expect(card.stability).toBeCloseTo(W[2], 10);
    expect(card.difficulty).toBeCloseTo(W[4], 10);
    expect(card.reps).toBe(1);
    expect(card.lastReview).toBe(T0);
  });

  it('routes Again on a new card into Learning without counting a lapse', () => {
    const { card } = review(emptyCard(), Rating.Again, T0, DEFAULT_CONFIG);
    expect(card.state).toBe(State.Learning);
    // A card that was never known cannot be forgotten.
    expect(card.lapses).toBe(0);
  });

  it('schedules a longer interval for Easy than for Good', () => {
    const good = review(emptyCard(), Rating.Good, T0, DEFAULT_CONFIG).card;
    const easy = review(emptyCard(), Rating.Easy, T0, DEFAULT_CONFIG).card;
    expect(easy.scheduledDays).toBeGreaterThan(good.scheduledDays);
  });

  it('sets due = reviewedAt + scheduledDays', () => {
    const { card } = review(emptyCard(), Rating.Good, T0, DEFAULT_CONFIG);
    expect(card.due).toBe(T0 + card.scheduledDays * DAY);
  });
});

describe('review — subsequent reviews', () => {
  const first = review(emptyCard(), Rating.Good, T0, DEFAULT_CONFIG).card;

  it('increases stability on successful recall', () => {
    const t1 = T0 + first.scheduledDays * DAY;
    const { card } = review(first, Rating.Good, t1, DEFAULT_CONFIG);
    expect(card.stability).toBeGreaterThan(first.stability);
    expect(card.reps).toBe(2);
  });

  it('counts a lapse and enters Relearning when a Review card is forgotten', () => {
    const t1 = T0 + first.scheduledDays * DAY;
    const { card } = review(first, Rating.Again, t1, DEFAULT_CONFIG);
    expect(card.state).toBe(State.Relearning);
    expect(card.lapses).toBe(1);
    expect(card.stability).toBeLessThanOrEqual(first.stability);
  });

  it('returns Relearning to Review on a successful recall', () => {
    const t1 = T0 + first.scheduledDays * DAY;
    const lapsed = review(first, Rating.Again, t1, DEFAULT_CONFIG).card;
    const { card } = review(lapsed, Rating.Good, t1 + DAY, DEFAULT_CONFIG);
    expect(card.state).toBe(State.Review);
    expect(card.lapses).toBe(1); // not double-counted
  });

  it('records elapsedDays from the previous review', () => {
    const t1 = T0 + 7 * DAY;
    const { card } = review(first, Rating.Good, t1, DEFAULT_CONFIG);
    expect(card.elapsedDays).toBeCloseTo(7, 6);
  });

  it('treats a review earlier than lastReview as zero elapsed days', () => {
    const { card } = review(first, Rating.Good, T0 - 5 * DAY, DEFAULT_CONFIG);
    expect(card.elapsedDays).toBe(0);
  });

  it('honours maximumInterval', () => {
    const capped = { ...DEFAULT_CONFIG, maximumInterval: 3 };
    let card = review(emptyCard(), Rating.Easy, T0, capped).card;
    for (let i = 0; i < 20; i++) {
      card = review(card, Rating.Easy, T0 + (i + 1) * 100 * DAY, capped).card;
    }
    expect(card.scheduledDays).toBeLessThanOrEqual(3);
  });

  it('always schedules at least one day', () => {
    let card = emptyCard();
    for (let i = 0; i < 30; i++) {
      card = review(card, Rating.Again, T0 + i * DAY, DEFAULT_CONFIG).card;
      expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
    }
  });

  it('emits a log entry describing the review as it occurred', () => {
    const t1 = T0 + 5 * DAY;
    const { log } = review(first, Rating.Hard, t1, DEFAULT_CONFIG);
    expect(log.rating).toBe(Rating.Hard);
    expect(log.state).toBe(State.Review); // state BEFORE the review
    expect(log.reviewedAt).toBe(t1);
    expect(log.elapsedDays).toBeCloseTo(5, 6);
  });

  it('uses default config when none is supplied', () => {
    const { card } = review(emptyCard(), Rating.Good, T0);
    expect(card.stability).toBeCloseTo(W[2], 10);
  });
});

describe('review — determinism and purity', () => {
  /**
   * This is the property the entire sync design rests on: the server derives
   * authoritative state by replaying events (ADR-0003). If replay were not
   * deterministic, client and server would disagree.
   */
  it('replaying the same sequence always yields identical state', () => {
    const sequence = [Rating.Good, Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

    const replay = (): Card => {
      let card = emptyCard();
      sequence.forEach((rating, i) => {
        card = review(card, rating, T0 + i * 3 * DAY, DEFAULT_CONFIG).card;
      });
      return card;
    };

    expect(replay()).toEqual(replay());
  });

  it('does not mutate the input card', () => {
    const before = review(emptyCard(), Rating.Good, T0, DEFAULT_CONFIG).card;
    const snapshot = { ...before };
    review(before, Rating.Again, T0 + 10 * DAY, DEFAULT_CONFIG);
    expect(before).toEqual(snapshot);
  });
});

describe('isDue', () => {
  it('treats a never-reviewed card as due', () => {
    expect(isDue(emptyCard(), T0)).toBe(true);
  });

  it('is false before the due date and true on or after it', () => {
    const { card } = review(emptyCard(), Rating.Good, T0, DEFAULT_CONFIG);
    expect(isDue(card, card.due! - 1)).toBe(false);
    expect(isDue(card, card.due!)).toBe(true);
    expect(isDue(card, card.due! + DAY)).toBe(true);
  });
});

describe('dueQueue', () => {
  const overdue = review(emptyCard(), Rating.Good, T0 - 100 * DAY, DEFAULT_CONFIG).card;
  const soon = review(emptyCard(), Rating.Easy, T0, DEFAULT_CONFIG).card;
  const fresh = emptyCard();

  it('returns only due cards, most overdue first', () => {
    const queue = dueQueue([soon, fresh, overdue], T0);
    expect(queue).toContain(overdue);
    expect(queue).toContain(fresh);
    expect(queue).not.toContain(soon);
    expect(queue[0]).toBe(overdue); // never-reviewed sorts after genuinely overdue
  });

  it('is computable for an arbitrary future timestamp (FR-085)', () => {
    const future = dueQueue([soon], T0 + 10_000 * DAY);
    expect(future).toEqual([soon]);
  });

  it('returns an empty array when nothing is due', () => {
    expect(dueQueue([soon], T0)).toEqual([]);
  });

  it('orders multiple never-reviewed cards after genuinely overdue ones', () => {
    const newA = { ...emptyCard(), reps: 0 };
    const newB = { ...emptyCard(), reps: 0 };
    const queue = dueQueue([newA, newB, overdue], T0);
    expect(queue).toHaveLength(3);
    expect(queue[0]).toBe(overdue);
    // Both comparands have a null due date — neither outranks the other.
    expect(queue.slice(1)).toEqual(expect.arrayContaining([newA, newB]));
  });
});
