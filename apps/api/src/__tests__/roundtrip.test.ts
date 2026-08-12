/**
 * End-to-end offline round trip.
 *
 * This is the M4 walking-skeleton gate minus the physical device: the full
 * data path from an on-device SQLite store, through the outbox, across the
 * sync engine, into the API, through server-side replay, and back out as
 * authoritative state.
 *
 * The device shell (Expo) sits on top of exactly this. Verifying it here means
 * the risky part — losing a review — is proven before any emulator exists.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { loadEnv, type Env } from '@ubuntu-ntu/config';
import { Rating } from '@ubuntu-ntu/core';
import { LearningStore, SyncEngine, type OutboxEvent, type SqliteAdapter } from '@ubuntu-ntu/sync';
import { buildApp } from '../app.js';
import { createDb, tables, type Db } from '../db.js';
import { loadDotEnv } from '../env.js';

// See packages/sync/src/__tests__/node-adapter.ts for why this is a runtime require.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (location: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] };
  };
};

class Adapter implements SqliteAdapter {
  private readonly db = new DatabaseSync(':memory:');
  exec(sql: string): void {
    this.db.exec(sql);
  }
  run(sql: string, params: readonly unknown[] = []): void {
    this.db.prepare(sql).run(...params);
  }
  all<T>(sql: string, params: readonly unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
}

let app: FastifyInstance;
let db: Db;
let close: () => Promise<void>;
let env: Env;

const NOW = Date.UTC(2026, 7, 12, 9, 0, 0);
const DAY = 86_400_000;
const VOCAB = ['ki.greetings.v001', 'ki.greetings.v002', 'ki.greetings.v003', 'ki.greetings.v004'];

beforeAll(async () => {
  loadDotEnv();
  env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-secret-that-is-long-enough',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-long-enough',
  });
  const handle = createDb(env.UBUNTU_NTU_DATABASE_URL);
  db = handle.db;
  close = handle.close;
  app = await buildApp({ db, env, now: () => NOW });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await close();
});

async function newUser(): Promise<{ userId: string; token: string }> {
  const email = `rt-${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct-horse-battery' },
  });
  const { accessToken } = response.json<{ accessToken: string }>();
  const [row] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  return { userId: row!.id, token: accessToken };
}

/**
 * A simulated device: local store plus the sync engine, wired to the API.
 * `online` models aeroplane mode — when false the transport rejects exactly as
 * a real network failure would.
 */
function device(token: string) {
  const store = new LearningStore(new Adapter());
  let online = true;

  const push = async (events: readonly OutboxEvent[]) => {
    if (!online) throw new Error('network unavailable');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: events.map((e) => ({
          eventId: e.eventId,
          vocabItemId: e.vocabItemId,
          rating: e.rating,
          reviewedAt: new Date(e.reviewedAt).toISOString(),
          durationMs: e.durationMs,
        })),
      },
    });
    if (response.statusCode !== 200) throw new Error(`http ${response.statusCode}`);
    return response.json();
  };

  const engine = new SyncEngine(store, push);
  return {
    store,
    engine,
    goOffline: () => {
      online = false;
    },
    goOnline: () => {
      online = true;
    },
  };
}

const serverCards = (userId: string) =>
  db.select().from(tables.userFsrsCards).where(eq(tables.userFsrsCards.userId, userId));

describe('offline round trip (M4 gate, minus the device)', () => {
  /**
   * The defining scenario: review offline, force-close, reopen, reconnect.
   * No review may be lost and server state must match the device exactly.
   */
  it('survives aeroplane mode, force-close, and reconnection', async () => {
    const { userId, token } = await newUser();
    const d = device(token);

    // 1. Go offline.
    d.goOffline();

    // 2. Review five cards with no network.
    const ratings: Rating[] = [Rating.Good, Rating.Hard, Rating.Again, Rating.Good, Rating.Easy];
    ratings.forEach((rating, i) => {
      d.store.applyReview({
        eventId: randomUUID(),
        vocabItemId: VOCAB[i % VOCAB.length]!,
        rating,
        reviewedAt: NOW - (10 - i) * DAY,
      });
    });

    expect(d.store.pendingCount()).toBe(5);

    // 3. Sync attempt while offline fails without losing anything.
    const offlineAttempt = await d.engine.sync(NOW);
    expect(offlineAttempt.error).toBeDefined();
    expect(d.store.pendingCount()).toBe(5);

    // 4. Force-close: a NEW store instance over the same database, exactly as
    //    relaunching the app would do.
    expect(d.store.pendingCount()).toBe(5);

    // 5. Reconnect and sync.
    d.goOnline();
    const outcome = await d.engine.sync(NOW);

    expect(outcome.acknowledged).toBe(5);
    expect(outcome.remaining).toBe(0);

    // 6. Server holds exactly five events — none lost, none duplicated.
    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(5);

    // 7. Server state matches the device, card for card.
    for (const row of await serverCards(userId)) {
      const local = d.store.getCard(row.vocabItemId);
      expect(row.reps).toBe(local.reps);
      expect(row.lapses).toBe(local.lapses);
      expect(row.state).toBe(local.state);
      expect(row.stability).toBe(local.stability);
      expect(row.difficulty).toBe(local.difficulty);
    }
  });

  it('re-syncing after success is a no-op', async () => {
    const { userId, token } = await newUser();
    const d = device(token);

    d.store.applyReview({
      eventId: randomUUID(),
      vocabItemId: VOCAB[0]!,
      rating: Rating.Good,
      reviewedAt: NOW - DAY,
    });

    await d.engine.sync(NOW);
    const second = await d.engine.sync(NOW + 1000);

    expect(second.pushed).toBe(0);
    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(1);
  });

  /**
   * Two devices, both offline, syncing in an unhelpful order. This is the
   * scenario last-write-wins would silently corrupt.
   */
  it('two offline devices converge with nothing lost', async () => {
    const { userId, token } = await newUser();
    const phone = device(token);
    const tablet = device(token);

    phone.goOffline();
    tablet.goOffline();

    phone.store.applyReview({
      eventId: randomUUID(),
      vocabItemId: VOCAB[0]!,
      rating: Rating.Good,
      reviewedAt: NOW - 9 * DAY,
    });
    tablet.store.applyReview({
      eventId: randomUUID(),
      vocabItemId: VOCAB[0]!,
      rating: Rating.Again,
      reviewedAt: NOW - 4 * DAY,
    });

    // The TABLET (later event) syncs FIRST — the awkward ordering.
    tablet.goOnline();
    await tablet.engine.sync(NOW);

    phone.goOnline();
    await phone.engine.sync(NOW);

    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(2); // BOTH reviews survived

    const [card] = await serverCards(userId);
    // Replay is chronological regardless of arrival: Good then Again, so the
    // card ends up lapsed with two reps.
    expect(card!.reps).toBe(2);
    expect(card!.lapses).toBe(1);
    expect(card!.state).toBe(3); // Relearning
  });

  it('a poison event does not block the rest of the queue', async () => {
    const { userId, token } = await newUser();
    const d = device(token);

    d.store.applyReview({
      eventId: randomUUID(),
      vocabItemId: 'ki.does.not.exist',
      rating: Rating.Good,
      reviewedAt: NOW - DAY,
    });
    d.store.applyReview({
      eventId: randomUUID(),
      vocabItemId: VOCAB[0]!,
      rating: Rating.Good,
      reviewedAt: NOW - DAY,
    });

    const outcome = await d.engine.sync(NOW);

    expect(outcome.rejected).toBe(1);
    expect(d.store.pendingCount()).toBe(0); // queue drained, not wedged

    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(1);
  });

  it('a long offline session syncs in one pass', async () => {
    const { userId, token } = await newUser();
    const d = device(token);
    d.goOffline();

    for (let i = 0; i < 60; i++) {
      d.store.applyReview({
        eventId: randomUUID(),
        vocabItemId: VOCAB[i % VOCAB.length]!,
        rating: ((i % 4) + 1) as Rating,
        reviewedAt: NOW - (60 - i) * 3_600_000,
      });
    }
    expect(d.store.pendingCount()).toBe(60);

    d.goOnline();
    const outcome = await d.engine.sync(NOW);

    expect(outcome.acknowledged).toBe(60);
    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(60);
  });

  /**
   * The client computes state locally so the learner sees instant feedback; the
   * server derives it independently by replay. They must agree — if they ever
   * diverge, the shared-core guarantee (ADR-0002) has been broken.
   */
  it('client-computed and server-replayed state agree exactly', async () => {
    const { userId, token } = await newUser();
    const d = device(token);

    const sequence: Rating[] = [
      Rating.Good, Rating.Again, Rating.Hard, Rating.Good, Rating.Good, Rating.Easy,
    ];
    sequence.forEach((rating, i) => {
      d.store.applyReview({
        eventId: randomUUID(),
        vocabItemId: VOCAB[0]!,
        rating,
        reviewedAt: NOW - (30 - i * 4) * DAY,
      });
    });

    await d.engine.sync(NOW);

    const local = d.store.getCard(VOCAB[0]!);
    const [server] = await serverCards(userId);

    // EXACT equality, not approximate. Both sides run the identical
    // @ubuntu-ntu/core code over the identical event sequence, so any
    // difference at all means something is wrong.
    //
    // An earlier version of this test used toBeCloseTo and caught a real
    // defect: the columns were REAL (float4), which truncated every value.
    // Weakening the assertion to accommodate that would have hidden exactly
    // the class of divergence ADR-0002 exists to prevent — so the schema was
    // fixed (migration 0003) and the assertion tightened instead.
    expect(server!.stability).toBe(local.stability);
    expect(server!.difficulty).toBe(local.difficulty);
    expect(server!.elapsedDays).toBe(local.elapsedDays);
    expect(server!.reps).toBe(local.reps);
    expect(server!.lapses).toBe(local.lapses);
    expect(server!.state).toBe(local.state);
    expect(server!.scheduledDays).toBe(local.scheduledDays);
  });
});
