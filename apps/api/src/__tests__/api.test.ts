/**
 * API integration tests. Require the Docker stack (pnpm docker:up && pnpm migrate && pnpm seed).
 *
 * These run against a REAL Postgres deliberately. The idempotency guarantee in
 * ADR-0003 is enforced by a primary key and ON CONFLICT — a mocked database
 * would test our mock, not the guarantee.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { loadEnv, type Env } from '@ubuntu-ntu/config';
import { buildApp } from '../app.js';
import { createDb, tables, type Db } from '../db.js';
import { loadDotEnv } from '../env.js';

let app: FastifyInstance;
let db: Db;
let close: () => Promise<void>;
let env: Env;

/** Fixed clock — no test may depend on the wall clock. */
const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);
const DAY = 86_400_000;

/** Seeded by `pnpm seed` from content/ki. */
const VOCAB_A = 'ki.greetings.v001';
const VOCAB_B = 'ki.greetings.v002';

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

/** Register a fresh user and return its tokens. */
async function newUser(): Promise<{ userId: string; accessToken: string; refreshToken: string }> {
  const email = `test-${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct-horse-battery' },
  });
  expect(response.statusCode).toBe(201);

  const body = response.json<{ accessToken: string; refreshToken: string }>();
  const [row] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);

  return { userId: row!.id, ...body };
}

const event = (vocabItemId: string, rating: 1 | 2 | 3 | 4, at: number) => ({
  eventId: randomUUID(),
  vocabItemId,
  rating,
  reviewedAt: new Date(at).toISOString(),
  durationMs: 3200,
});

const postEvents = (token: string, events: unknown[]) =>
  app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });

// ---------------------------------------------------------------------------

describe('health', () => {
  it('reports database connectivity', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: true });
  });
});

describe('registration and login', () => {
  it('registers and returns a token pair', async () => {
    const { accessToken, refreshToken } = await newUser();
    expect(accessToken.length).toBeGreaterThan(0);
    expect(refreshToken.length).toBeGreaterThan(0);
  });

  it('rejects a duplicate email', async () => {
    const email = `dup-${randomUUID()}@example.test`;
    const payload = { email, password: 'correct-horse-battery' };
    expect((await app.inject({ method: 'POST', url: '/v1/auth/register', payload })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/register', payload })).statusCode).toBe(409);
  });

  it('never stores the password in plaintext', async () => {
    const email = `hash-${randomUUID()}@example.test`;
    const password = 'a-very-distinctive-password';
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password } });

    const [row] = await db
      .select({ h: tables.users.passwordHash })
      .from(tables.users)
      .where(eq(tables.users.email, email))
      .limit(1);

    expect(row!.h).not.toContain(password);
    expect(row!.h.startsWith('$argon2')).toBe(true);
  });

  it('logs in with correct credentials', async () => {
    const email = `login-${randomUUID()}@example.test`;
    const password = 'correct-horse-battery';
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password } });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects a wrong password', async () => {
    const email = `wrong-${randomUUID()}@example.test`;
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'correct-horse-battery' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'not-the-password' },
    });
    expect(response.statusCode).toBe(401);
  });

  /** The response must not reveal whether an account exists. */
  it('gives an identical response for unknown email and wrong password', async () => {
    const email = `known-${randomUUID()}@example.test`;
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'correct-horse-battery' },
    });

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'nope-nope-nope' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: `ghost-${randomUUID()}@example.test`, password: 'nope-nope-nope' },
    });

    expect(wrongPassword.statusCode).toBe(unknownEmail.statusCode);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });
});

describe('refresh token rotation', () => {
  it('exchanges a refresh token for a new pair', async () => {
    const { refreshToken } = await newUser();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ refreshToken: string }>().refreshToken).not.toBe(refreshToken);
  });

  /**
   * NFR-034. A consumed token being presented again means it leaked: the
   * attacker and the legitimate user cannot both hold a valid chain. The whole
   * family is revoked rather than just the replayed token.
   */
  it('revokes the entire family when a consumed token is reused', async () => {
    const { refreshToken: first } = await newUser();

    const rotated = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first },
    });
    const second = rotated.json<{ refreshToken: string }>().refreshToken;

    // Replay the already-consumed token.
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json<{ error: string }>().error).toBe('refresh_reused');

    // The legitimate successor is now dead too — that is the point.
    const afterRevocation = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: second },
    });
    expect(afterRevocation.statusCode).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'not-a-real-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('logout revokes the family', async () => {
    const { refreshToken } = await newUser();
    const out = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(out.statusCode).toBe(204);

    const after = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(after.statusCode).toBe(401);
  });
});

describe('authorisation', () => {
  it('rejects event ingestion with no token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const response = await postEvents('garbage.token.here', []);
    expect(response.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// The M3 gate
// ---------------------------------------------------------------------------

describe('event ingestion — idempotency (FR-091)', () => {
  /** THE M3 GATE: the same batch twice must produce identical state. */
  it('posting an identical batch twice produces identical state', async () => {
    const { userId, accessToken } = await newUser();
    const batch = [
      event(VOCAB_A, 3, NOW - 10 * DAY),
      event(VOCAB_A, 3, NOW - 5 * DAY),
      event(VOCAB_B, 1, NOW - 3 * DAY),
    ];

    const first = await postEvents(accessToken, batch);
    expect(first.statusCode).toBe(200);
    expect(first.json<{ accepted: string[] }>().accepted).toHaveLength(3);

    const stateAfterFirst = await db
      .select()
      .from(tables.userFsrsCards)
      .where(eq(tables.userFsrsCards.userId, userId));

    const second = await postEvents(accessToken, batch);
    expect(second.statusCode).toBe(200);

    const body = second.json<{ accepted: string[]; duplicate: string[] }>();
    expect(body.accepted).toHaveLength(0);
    expect(body.duplicate).toHaveLength(3);

    const stateAfterSecond = await db
      .select()
      .from(tables.userFsrsCards)
      .where(eq(tables.userFsrsCards.userId, userId));

    const normalise = (rows: typeof stateAfterFirst) =>
      rows
        .map((r) => ({ ...r, updatedAt: null }))
        .sort((a, b) => a.vocabItemId.localeCompare(b.vocabItemId));

    expect(normalise(stateAfterSecond)).toEqual(normalise(stateAfterFirst));

    // And exactly three log rows — no duplicates leaked through.
    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(3);
  });

  it('survives the same batch submitted five times', async () => {
    const { userId, accessToken } = await newUser();
    const batch = [event(VOCAB_A, 4, NOW - DAY)];

    for (let i = 0; i < 5; i++) {
      expect((await postEvents(accessToken, batch)).statusCode).toBe(200);
    }

    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(1);
  });
});

describe('event ingestion — replay convergence (FR-092, FR-093)', () => {
  /**
   * The multi-device scenario the whole design exists for: two devices review
   * offline, sync in either order, and neither review is lost.
   */
  it('converges regardless of arrival order, losing nothing', async () => {
    const deviceOrder = await newUser();
    const reverseOrder = await newUser();

    const early = (v: string) => event(v, 3, NOW - 8 * DAY);
    const late = (v: string) => event(v, 1, NOW - 2 * DAY);

    // User 1: chronological arrival.
    await postEvents(deviceOrder.accessToken, [early(VOCAB_A)]);
    await postEvents(deviceOrder.accessToken, [late(VOCAB_A)]);

    // User 2: the LATER event arrives FIRST — an offline device catching up.
    await postEvents(reverseOrder.accessToken, [late(VOCAB_A)]);
    await postEvents(reverseOrder.accessToken, [early(VOCAB_A)]);

    const cardOf = async (userId: string) => {
      const [row] = await db
        .select()
        .from(tables.userFsrsCards)
        .where(eq(tables.userFsrsCards.userId, userId));
      return row!;
    };

    const a = await cardOf(deviceOrder.userId);
    const b = await cardOf(reverseOrder.userId);

    expect(b.stability).toBeCloseTo(a.stability, 10);
    expect(b.difficulty).toBeCloseTo(a.difficulty, 10);
    expect(b.reps).toBe(a.reps);
    expect(b.lapses).toBe(a.lapses);
    expect(b.state).toBe(a.state);
    expect(b.reps).toBe(2); // both reviews present, neither lost
  });

  it('derives state from the log rather than trusting the client', async () => {
    const { userId, accessToken } = await newUser();
    await postEvents(accessToken, [event(VOCAB_A, 3, NOW - DAY)]);

    const [card] = await db
      .select()
      .from(tables.userFsrsCards)
      .where(eq(tables.userFsrsCards.userId, userId));

    // Good on a new card yields w2 = 3.7145 days of stability.
    expect(card!.stability).toBeCloseTo(3.7145, 4);
    expect(card!.state).toBe(2);
  });
});

describe('event ingestion — validation', () => {
  it('rejects a far-future timestamp but keeps the good events', async () => {
    const { accessToken } = await newUser();
    const response = await postEvents(accessToken, [
      event(VOCAB_A, 3, NOW - DAY),
      event(VOCAB_B, 3, NOW + 400 * DAY),
    ]);

    const body = response.json<{ accepted: string[]; rejected: { reason: string }[] }>();
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]!.reason).toBe('clock_skew_exceeded');
  });

  it('accepts backdated events from an offline device', async () => {
    const { accessToken } = await newUser();
    const response = await postEvents(accessToken, [event(VOCAB_A, 3, NOW - 200 * DAY)]);
    expect(response.json<{ accepted: string[] }>().accepted).toHaveLength(1);
  });

  /** One bad reference must not cost the other 499 events. */
  it('rejects an unknown vocabulary item without failing the batch', async () => {
    const { accessToken } = await newUser();
    const response = await postEvents(accessToken, [
      event(VOCAB_A, 3, NOW - DAY),
      event('ki.does.not.exist', 3, NOW - DAY),
    ]);

    const body = response.json<{ accepted: string[]; rejected: { reason: string }[] }>();
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected[0]!.reason).toBe('unknown_vocab_item');
  });

  it('rejects an invalid rating at the schema boundary', async () => {
    const { accessToken } = await newUser();
    const response = await postEvents(accessToken, [
      { ...event(VOCAB_A, 3, NOW - DAY), rating: 7 },
    ]);
    expect(response.statusCode).toBe(400);
  });

  it('rejects a batch larger than the configured maximum', async () => {
    const { accessToken } = await newUser();
    const oversized = Array.from({ length: env.MAX_EVENT_BATCH + 1 }, () =>
      event(VOCAB_A, 3, NOW - DAY),
    );
    expect((await postEvents(accessToken, oversized)).statusCode).toBe(400);
  });

  it('accepts an empty batch', async () => {
    const { accessToken } = await newUser();
    expect((await postEvents(accessToken, [])).statusCode).toBe(200);
  });
});

describe('due queue', () => {
  it('returns only cards that are due', async () => {
    const { accessToken } = await newUser();
    // Reviewed 400 days ago with a short interval — comfortably overdue.
    await postEvents(accessToken, [event(VOCAB_A, 1, NOW - 400 * DAY)]);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/cards/due',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { cards } = response.json<{ cards: { vocabItemId: string }[] }>();
    expect(cards.map((c) => c.vocabItemId)).toContain(VOCAB_A);
  });

  it('does not leak another user\'s cards', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    await postEvents(owner.accessToken, [event(VOCAB_A, 1, NOW - 400 * DAY)]);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/cards/due',
      headers: { authorization: `Bearer ${stranger.accessToken}` },
    });
    expect(response.json<{ cards: unknown[] }>().cards).toHaveLength(0);
  });
});

describe('OpenAPI', () => {
  it('generates a spec covering every route', async () => {
    const spec = app.swagger() as { paths: Record<string, unknown>; openapi: string };
    expect(spec.openapi).toMatch(/^3\./);
    for (const path of [
      '/health',
      '/v1/auth/register',
      '/v1/auth/login',
      '/v1/auth/refresh',
      '/v1/auth/logout',
      '/v1/bundles/manifest',
      '/v1/events',
      '/v1/cards/due',
    ]) {
      expect(Object.keys(spec.paths)).toContain(path);
    }
  });
});
