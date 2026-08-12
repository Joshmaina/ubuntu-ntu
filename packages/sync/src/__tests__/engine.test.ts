import { describe, it, expect, vi } from 'vitest';
import { Rating } from '@ubuntu-ntu/core';
import { LearningStore } from '../store.js';
import { SyncEngine } from '../engine.js';
import type { IngestResponse, OutboxEvent } from '../types.js';
import { NodeSqliteAdapter } from './node-adapter.js';

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);

let counter = 0;
const nextId = (): string => `00000000-0000-7000-8000-${String(++counter).padStart(12, '0')}`;

function setup(reviews = 3): LearningStore {
  const store = new LearningStore(new NodeSqliteAdapter());
  for (let i = 0; i < reviews; i++) {
    store.applyReview({
      eventId: nextId(),
      vocabItemId: `v${i}`,
      rating: Rating.Good,
      reviewedAt: NOW + i,
    });
  }
  return store;
}

const acceptAll = (events: readonly OutboxEvent[]): Promise<IngestResponse> =>
  Promise.resolve({
    accepted: events.map((e) => e.eventId),
    duplicate: [],
    rejected: [],
    serverTime: new Date(NOW).toISOString(),
  });

describe('successful sync', () => {
  it('pushes pending events and clears the queue', async () => {
    const store = setup(3);
    const outcome = await new SyncEngine(store, acceptAll).sync(NOW);

    expect(outcome.pushed).toBe(3);
    expect(outcome.acknowledged).toBe(3);
    expect(outcome.remaining).toBe(0);
    expect(store.pendingCount()).toBe(0);
  });

  it('does nothing when the queue is empty', async () => {
    const store = new LearningStore(new NodeSqliteAdapter());
    const push = vi.fn(acceptAll);
    const outcome = await new SyncEngine(store, push).sync(NOW);

    expect(push).not.toHaveBeenCalled();
    expect(outcome.pushed).toBe(0);
  });

  /** A duplicate means the server already has it — as good as accepted. */
  it('treats duplicates as acknowledged', async () => {
    const store = setup(2);
    const engine = new SyncEngine(store, (events) =>
      Promise.resolve({
        accepted: [],
        duplicate: events.map((e) => e.eventId),
        rejected: [],
        serverTime: new Date(NOW).toISOString(),
      }),
    );

    const outcome = await engine.sync(NOW);
    expect(outcome.acknowledged).toBe(2);
    expect(store.pendingCount()).toBe(0);
  });

  it('respects the batch size', async () => {
    const store = setup(10);
    let seen = 0;
    const engine = new SyncEngine(
      store,
      (events) => {
        seen = events.length;
        return acceptAll(events);
      },
      { batchSize: 4 },
    );

    await engine.sync(NOW);
    expect(seen).toBe(4);
    expect(store.pendingCount()).toBe(6);
  });
});

describe('failure handling', () => {
  /**
   * FR-094: sync failure must never surface as an error the learner has to
   * deal with. The engine reports it and the events stay queued.
   */
  it('never throws on a transport failure', async () => {
    const store = setup(2);
    const engine = new SyncEngine(store, () => Promise.reject(new Error('offline')));

    const outcome = await engine.sync(NOW);
    expect(outcome.error).toBe('offline');
    expect(outcome.acknowledged).toBe(0);
    expect(store.pendingCount()).toBe(2); // nothing lost
  });

  it('handles a non-Error rejection', async () => {
    const store = setup(1);
    const engine = new SyncEngine(store, () => Promise.reject('string failure'));
    expect((await engine.sync(NOW)).error).toBe('string failure');
  });

  it('retries succeed after a failure, losing nothing', async () => {
    const store = setup(2);
    let attempt = 0;
    const engine = new SyncEngine(store, (events) => {
      attempt++;
      return attempt === 1 ? Promise.reject(new Error('offline')) : acceptAll(events);
    });

    await engine.sync(NOW);
    expect(store.pendingCount()).toBe(2);

    await engine.sync(NOW + 5000);
    expect(store.pendingCount()).toBe(0);
  });

  it('counts attempts on the queued events', async () => {
    const store = setup(1);
    const engine = new SyncEngine(store, () => Promise.reject(new Error('offline')));

    await engine.sync(NOW);
    await engine.sync(NOW + 1000);
    expect(store.pendingEvents()[0]!.attempts).toBe(2);
  });
});

describe('rejection handling', () => {
  /** One poison event must not block the whole queue forever. */
  it('discards permanently unacceptable events', async () => {
    const store = setup(2);
    const [poison, good] = store.pendingEvents();

    const engine = new SyncEngine(store, () =>
      Promise.resolve({
        accepted: [good!.eventId],
        duplicate: [],
        rejected: [{ eventId: poison!.eventId, reason: 'unknown_vocab_item' }],
        serverTime: new Date(NOW).toISOString(),
      }),
    );

    const outcome = await engine.sync(NOW);
    expect(outcome.rejected).toBe(1);
    expect(store.pendingCount()).toBe(0); // one accepted, one discarded
  });

  /**
   * Clock skew is the one retryable rejection: the client re-stamps against
   * serverTime and tries again, so the event must stay queued.
   */
  it('keeps clock-skew rejections queued for retry', async () => {
    const store = setup(1);
    const [event] = store.pendingEvents();

    const engine = new SyncEngine(store, () =>
      Promise.resolve({
        accepted: [],
        duplicate: [],
        rejected: [{ eventId: event!.eventId, reason: 'clock_skew_exceeded' }],
        serverTime: new Date(NOW).toISOString(),
      }),
    );

    await engine.sync(NOW);
    expect(store.pendingCount()).toBe(1);
  });
});

describe('concurrency', () => {
  it('does not run two passes at once', async () => {
    const store = setup(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const engine = new SyncEngine(store, async (events) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return acceptAll(events);
    });

    await Promise.all([engine.sync(NOW), engine.sync(NOW), engine.sync(NOW)]);
    expect(maxConcurrent).toBe(1);
  });
});

describe('backoff', () => {
  it('grows exponentially', () => {
    const engine = new SyncEngine(setup(0), acceptAll, { jitter: () => 1 });
    expect(engine.nextDelayMs(1)).toBeLessThan(engine.nextDelayMs(3));
    expect(engine.nextDelayMs(3)).toBeLessThan(engine.nextDelayMs(6));
  });

  it('is capped', () => {
    const engine = new SyncEngine(setup(0), acceptAll, { maxDelayMs: 5000, jitter: () => 1 });
    expect(engine.nextDelayMs(50)).toBeLessThanOrEqual(5000);
  });

  /**
   * Jitter matters in this market specifically: when a region regains
   * connectivity, unjittered clients would retry in lockstep and arrive as a
   * synchronised herd.
   */
  it('applies jitter so retries spread out', () => {
    const low = new SyncEngine(setup(0), acceptAll, { jitter: () => 0 });
    const high = new SyncEngine(setup(0), acceptAll, { jitter: () => 1 });
    expect(low.nextDelayMs(3)).toBeLessThan(high.nextDelayMs(3));
  });

  it('treats attempt zero as the base interval', () => {
    const engine = new SyncEngine(setup(0), acceptAll, { baseDelayMs: 1000, jitter: () => 1 });
    expect(engine.nextDelayMs(0)).toBe(1000);
  });

  it('uses a default jitter when none is supplied', () => {
    expect(new SyncEngine(setup(0), acceptAll).nextDelayMs(1)).toBeGreaterThan(0);
  });

  it('reports readiness to retry', () => {
    const engine = new SyncEngine(setup(0), acceptAll, { baseDelayMs: 1000, jitter: () => 1 });
    expect(engine.isReadyToRetry(1, null, NOW)).toBe(true);
    expect(engine.isReadyToRetry(1, NOW, NOW + 500)).toBe(false);
    expect(engine.isReadyToRetry(1, NOW, NOW + 2000)).toBe(true);
  });
});
