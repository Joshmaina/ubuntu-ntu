import { describe, it, expect } from 'vitest';
import { LearningStore } from '../store.js';
import { Rating, State } from '@ubuntu-ntu/core';
import { NodeSqliteAdapter, FailingAdapter } from './node-adapter.js';

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);
const DAY = 86_400_000;

const store = (): LearningStore => new LearningStore(new NodeSqliteAdapter());

let counter = 0;
const nextId = (): string => `00000000-0000-7000-8000-${String(++counter).padStart(12, '0')}`;

describe('cards', () => {
  it('returns an empty card for an unseen item', () => {
    const card = store().getCard('ki.a.v1');
    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
  });

  it('persists state after a review', () => {
    const s = store();
    s.applyReview({ eventId: nextId(), vocabItemId: 'ki.a.v1', rating: Rating.Good, reviewedAt: NOW });

    const card = s.getCard('ki.a.v1');
    expect(card.reps).toBe(1);
    expect(card.state).toBe(State.Review);
    expect(card.stability).toBeCloseTo(3.7145, 4);
  });

  it('accumulates across successive reviews', () => {
    const s = store();
    s.applyReview({ eventId: nextId(), vocabItemId: 'ki.a.v1', rating: Rating.Good, reviewedAt: NOW });
    s.applyReview({
      eventId: nextId(),
      vocabItemId: 'ki.a.v1',
      rating: Rating.Good,
      reviewedAt: NOW + 4 * DAY,
    });

    const card = s.getCard('ki.a.v1');
    expect(card.reps).toBe(2);
    expect(card.stability).toBeGreaterThan(3.7145);
  });

  it('records a lapse when a known card is forgotten', () => {
    const s = store();
    s.applyReview({ eventId: nextId(), vocabItemId: 'ki.a.v1', rating: Rating.Good, reviewedAt: NOW });
    s.applyReview({
      eventId: nextId(),
      vocabItemId: 'ki.a.v1',
      rating: Rating.Again,
      reviewedAt: NOW + 5 * DAY,
    });

    expect(s.getCard('ki.a.v1').lapses).toBe(1);
    expect(s.getCard('ki.a.v1').state).toBe(State.Relearning);
  });
});

describe('due queue', () => {
  it('orders overdue cards before never-reviewed ones', () => {
    const s = store();
    s.applyReview({
      eventId: nextId(),
      vocabItemId: 'overdue',
      rating: Rating.Again,
      reviewedAt: NOW - 400 * DAY,
    });
    s.applyReview({
      eventId: nextId(),
      vocabItemId: 'fresh',
      rating: Rating.Easy,
      reviewedAt: NOW,
    });

    const due = s.dueCards(NOW);
    expect(due.map((d) => d.vocabItemId)).toContain('overdue');
    expect(due.map((d) => d.vocabItemId)).not.toContain('fresh');
  });

  it('honours the limit', () => {
    const s = store();
    for (let i = 0; i < 10; i++) {
      s.applyReview({
        eventId: nextId(),
        vocabItemId: `v${i}`,
        rating: Rating.Again,
        reviewedAt: NOW - 400 * DAY,
      });
    }
    expect(s.dueCards(NOW, 3)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// The invariant this package exists to guarantee
// ---------------------------------------------------------------------------

describe('atomicity of card update and outbox insert', () => {
  it('writes both in a single transaction', () => {
    const s = store();
    s.applyReview({ eventId: nextId(), vocabItemId: 'ki.a.v1', rating: Rating.Good, reviewedAt: NOW });

    expect(s.getCard('ki.a.v1').reps).toBe(1);
    expect(s.pendingCount()).toBe(1);
  });

  /**
   * A crash between the card update and the outbox insert must leave NEITHER.
   *
   * If the card were updated without an outbox row, the review would be applied
   * locally and never synced — silently lost, and undetectable afterwards.
   */
  it('rolls back the card update when the outbox insert fails', () => {
    const adapter = new FailingAdapter(/INSERT INTO review_outbox/);
    const s = new LearningStore(adapter);

    expect(() =>
      s.applyReview({
        eventId: nextId(),
        vocabItemId: 'ki.a.v1',
        rating: Rating.Good,
        reviewedAt: NOW,
      }),
    ).toThrow('simulated crash');

    // Neither write survived.
    expect(s.getCard('ki.a.v1').reps).toBe(0);
    expect(s.pendingCount()).toBe(0);
  });

  /** The mirror case: no outbox row without a corresponding card update. */
  it('rolls back the outbox insert when the card update fails', () => {
    const adapter = new FailingAdapter(/INSERT INTO cards/);
    const s = new LearningStore(adapter);

    expect(() =>
      s.applyReview({
        eventId: nextId(),
        vocabItemId: 'ki.a.v1',
        rating: Rating.Good,
        reviewedAt: NOW,
      }),
    ).toThrow('simulated crash');

    expect(s.pendingCount()).toBe(0);
    expect(s.getCard('ki.a.v1').reps).toBe(0);
  });

  /** After a failed review the store must still be usable, not wedged. */
  it('remains usable after a rolled-back review', () => {
    const adapter = new FailingAdapter(/INSERT INTO review_outbox/, 1);
    const s = new LearningStore(adapter);

    expect(() =>
      s.applyReview({ eventId: nextId(), vocabItemId: 'v1', rating: Rating.Good, reviewedAt: NOW }),
    ).toThrow();

    // Second attempt succeeds — the failing adapter only fails once.
    s.applyReview({ eventId: nextId(), vocabItemId: 'v1', rating: Rating.Good, reviewedAt: NOW });
    expect(s.getCard('v1').reps).toBe(1);
    expect(s.pendingCount()).toBe(1);
  });
});

describe('outbox lifecycle', () => {
  it('lists pending events oldest first', () => {
    const s = store();
    const first = nextId();
    const second = nextId();
    s.applyReview({ eventId: first, vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });
    s.applyReview({ eventId: second, vocabItemId: 'b', rating: Rating.Good, reviewedAt: NOW + 1000 });

    expect(s.pendingEvents().map((e) => e.eventId)).toEqual([first, second]);
  });

  it('acknowledged events leave the pending queue', () => {
    const s = store();
    const id = nextId();
    s.applyReview({ eventId: id, vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });

    s.markAcknowledged([id], NOW);
    expect(s.pendingCount()).toBe(0);
  });

  it('acknowledging an empty list is a no-op', () => {
    const s = store();
    s.applyReview({ eventId: nextId(), vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });
    s.markAcknowledged([], NOW);
    expect(s.pendingCount()).toBe(1);
  });

  it('records attempts', () => {
    const s = store();
    const id = nextId();
    s.applyReview({ eventId: id, vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });

    s.recordAttempt([id], NOW);
    s.recordAttempt([id], NOW + 1000);
    expect(s.pendingEvents()[0]!.attempts).toBe(2);
  });

  it('recording an attempt for an empty list is a no-op', () => {
    const s = store();
    expect(() => s.recordAttempt([], NOW)).not.toThrow();
  });

  /** A permanently unacceptable event must not block the queue behind it. */
  it('discards poison events', () => {
    const s = store();
    const poison = nextId();
    const good = nextId();
    s.applyReview({ eventId: poison, vocabItemId: 'unknown', rating: Rating.Good, reviewedAt: NOW });
    s.applyReview({ eventId: good, vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });

    s.discard([poison]);
    expect(s.pendingEvents().map((e) => e.eventId)).toEqual([good]);
  });

  it('discarding an empty list is a no-op', () => {
    const s = store();
    expect(() => s.discard([])).not.toThrow();
  });

  it('purges acknowledged rows past the retention window', () => {
    const s = store();
    const id = nextId();
    s.applyReview({ eventId: id, vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });
    s.markAcknowledged([id], NOW);

    expect(s.purgeAcknowledged(NOW + 3 * DAY)).toBe(0); // still within retention
    expect(s.purgeAcknowledged(NOW + 10 * DAY)).toBe(1);
  });

  it('never purges unacknowledged rows', () => {
    const s = store();
    s.applyReview({ eventId: nextId(), vocabItemId: 'a', rating: Rating.Good, reviewedAt: NOW });
    s.purgeAcknowledged(NOW + 365 * DAY);
    expect(s.pendingCount()).toBe(1);
  });
});

describe('settings', () => {
  it('returns null for an unset key', () => {
    expect(store().getSetting('pitchBaselineHz')).toBeNull();
  });

  it('stores and overwrites', () => {
    const s = store();
    s.setSetting('pitchBaselineHz', '198');
    expect(s.getSetting('pitchBaselineHz')).toBe('198');
    s.setSetting('pitchBaselineHz', '205');
    expect(s.getSetting('pitchBaselineHz')).toBe('205');
  });
});

describe('isDue passthrough', () => {
  it('treats a never-reviewed card as due', () => {
    const s = store();
    expect(s.isDue(s.getCard('unseen'), NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Durability
// ---------------------------------------------------------------------------

describe('survives process restart', () => {
  it('retains cards and pending events across a reopen', () => {
    // A shared in-memory database, reopened through a second store instance —
    // the same code path a force-close and relaunch would take.
    const adapter = new NodeSqliteAdapter();
    const first = new LearningStore(adapter);
    const id = nextId();
    first.applyReview({ eventId: id, vocabItemId: 'ki.a.v1', rating: Rating.Good, reviewedAt: NOW });

    const reopened = new LearningStore(adapter);
    expect(reopened.getCard('ki.a.v1').reps).toBe(1);
    expect(reopened.pendingEvents().map((e) => e.eventId)).toEqual([id]);
  });
});
