/**
 * Geographic locking — integration tests.
 *
 * Spec path was `src/controllers/__tests__/contributions.test.ts`; this repo
 * uses a monorepo layout, so it lives at
 * `apps/api/src/controllers/__tests__/contributions.test.ts`.
 *
 * Core assertion: a contributor registered under 'KE' cannot upload to, vote
 * on, or even SEE contributions for a dialect locked to 'NG'.
 *
 * Runs against a real Postgres — the country lock involves real rows and real
 * constraints, and a mock would only prove the mock behaves.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { loadEnv, type Env } from '@ubuntu-ntu/config';
import { buildApp } from '../../app.js';
import { createDb, tables, type Db } from '../../db.js';
import { loadDotEnv } from '../../env.js';

let strictApp: FastifyInstance;
let diasporaApp: FastifyInstance;
let db: Db;
let close: () => Promise<void>;

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

/** Test fixtures. Nigerian rows are created here; the Kenyan ones are seeded. */
const KE_DIALECT = 'ki-central';
const NG_LANGUAGE = 'zz-test-yo';
const NG_DIALECT = 'zz-yo-oyo';

beforeAll(async () => {
  loadDotEnv();
  const base = {
    ...process.env,
    NODE_ENV: 'test' as const,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-secret-that-is-long-enough',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-long-enough',
  };

  const strictEnv: Env = loadEnv({ ...base, ALLOW_DIASPORA_CONTRIBUTIONS: 'false' });
  const diasporaEnv: Env = loadEnv({ ...base, ALLOW_DIASPORA_CONTRIBUTIONS: 'true' });

  const handle = createDb(strictEnv.UBUNTU_NTU_DATABASE_URL);
  db = handle.db;
  close = handle.close;

  strictApp = await buildApp({ db, env: strictEnv, now: () => NOW });
  diasporaApp = await buildApp({ db, env: diasporaEnv, now: () => NOW });
  await strictApp.ready();
  await diasporaApp.ready();

  // A Nigerian language and dialect, so the cross-border case is real data
  // rather than a stub.
  await db
    .insert(tables.languages)
    .values({
      id: NG_LANGUAGE,
      name: 'Test Yoruba',
      nativeName: 'Yorùbá (test)',
      isTonal: true,
      countryCode: 'NG',
      alsoSpokenIn: ['BJ', 'TG'],
    })
    .onConflictDoNothing();

  await db
    .insert(tables.dialects)
    .values({
      id: NG_DIALECT,
      languageId: NG_LANGUAGE,
      name: 'Test Oyo',
      countryCode: 'NG',
      communityRegion: 'Oyo, South West',
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(tables.dialects).where(eq(tables.dialects.id, NG_DIALECT));
  await db.delete(tables.languages).where(eq(tables.languages.id, NG_LANGUAGE));
  await strictApp.close();
  await diasporaApp.close();
  await close();
});

/** Register a user in `country`, optionally verified for some dialects. */
async function newUser(
  country: string,
  verifiedDialects: string[] = [],
): Promise<{ userId: string; token: string }> {
  const email = `geo-${randomUUID()}@example.test`;
  const response = await strictApp.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct-horse-battery', homeCountryCode: country },
  });
  expect(response.statusCode).toBe(201);

  const { accessToken } = response.json<{ accessToken: string }>();
  const [row] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);

  if (verifiedDialects.length > 0) {
    // Verification is granted by an authority, not self-asserted — set directly.
    await db
      .update(tables.users)
      .set({ verifiedDialects })
      .where(eq(tables.users.id, row!.id));
  }

  return { userId: row!.id, token: accessToken };
}

const submit = (app: FastifyInstance, token: string, dialectId: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/contributions/audio',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      dialectId,
      promptText: 'Wĩ mwega',
      audioPath: `contributions/${randomUUID()}.opus`,
      durationMs: 2400,
    },
  });

const vote = (app: FastifyInstance, token: string, contributionId: string) =>
  app.inject({
    method: 'POST',
    url: `/v1/contributions/${contributionId}/vote`,
    headers: { authorization: `Bearer ${token}` },
    payload: { vote: 'approve' },
  });

// ---------------------------------------------------------------------------

describe('country registration', () => {
  it('requires a home country at registration', async () => {
    const response = await strictApp.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `nc-${randomUUID()}@example.test`, password: 'correct-horse-battery' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a malformed country code', async () => {
    for (const bad of ['ke', 'KEN', 'K']) {
      const response = await strictApp.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: `bad-${randomUUID()}@example.test`,
          password: 'correct-horse-battery',
          homeCountryCode: bad,
        },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('creates a default learner profile on registration', async () => {
    const { userId } = await newUser('KE');
    const profiles = await db
      .select()
      .from(tables.learnerProfiles)
      .where(eq(tables.learnerProfiles.accountId, userId));

    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.isDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE REQUIRED TEST
// ---------------------------------------------------------------------------

describe('a KE contributor cannot act on an NG dialect', () => {
  it('is refused with 403 DIALECT_GEOGRAPHIC_MISMATCH when uploading', async () => {
    // Verified for the NG dialect, so ONLY geography can be the reason.
    const kenyan = await newUser('KE', [NG_DIALECT]);

    const response = await submit(strictApp, kenyan.token, NG_DIALECT);

    expect(response.statusCode).toBe(403);
    const body = response.json<{ error: string; message: string }>();
    expect(body.error).toBe('DIALECT_GEOGRAPHIC_MISMATCH');
    expect(body.message).toContain('KE');
    expect(body.message).toContain('NG');
  });

  it('writes nothing to the database when refused', async () => {
    const kenyan = await newUser('KE', [NG_DIALECT]);
    await submit(strictApp, kenyan.token, NG_DIALECT);

    const rows = await db
      .select()
      .from(tables.audioContributions)
      .where(eq(tables.audioContributions.contributorId, kenyan.userId));
    expect(rows).toHaveLength(0);
  });

  it('is refused with 403 when voting on an NG contribution', async () => {
    const nigerian = await newUser('NG', [NG_DIALECT]);
    const kenyan = await newUser('KE', [NG_DIALECT]);

    const created = await submit(strictApp, nigerian.token, NG_DIALECT);
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();

    const response = await vote(strictApp, kenyan.token, id);
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('DIALECT_GEOGRAPHIC_MISMATCH');
  });

  it('records no vote when refused', async () => {
    const nigerian = await newUser('NG', [NG_DIALECT]);
    const kenyan = await newUser('KE', [NG_DIALECT]);

    const { id } = (await submit(strictApp, nigerian.token, NG_DIALECT)).json<{ id: string }>();
    await vote(strictApp, kenyan.token, id);

    const votes = await db
      .select()
      .from(tables.contributionVotes)
      .where(eq(tables.contributionVotes.contributionId, id));
    expect(votes).toHaveLength(0);
  });

  /**
   * The queue is gated too. Filtering only at vote time would leak one
   * community's recordings to another — the exposure matters even when no
   * write is possible.
   */
  it('cannot even see the NG review queue', async () => {
    const kenyan = await newUser('KE', [NG_DIALECT]);
    const response = await strictApp.inject({
      method: 'GET',
      url: `/v1/contributions/queue?dialectId=${NG_DIALECT}`,
      headers: { authorization: `Bearer ${kenyan.token}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('the mirror case also holds: an NG contributor is refused a KE dialect', async () => {
    const nigerian = await newUser('NG', [KE_DIALECT]);
    const response = await submit(strictApp, nigerian.token, KE_DIALECT);

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('DIALECT_GEOGRAPHIC_MISMATCH');
  });
});

// ---------------------------------------------------------------------------

describe('in-country contributors', () => {
  it('a verified NG contributor may upload to an NG dialect', async () => {
    const nigerian = await newUser('NG', [NG_DIALECT]);
    const response = await submit(strictApp, nigerian.token, NG_DIALECT);

    expect(response.statusCode).toBe(201);
    const body = response.json<{ countryCode: string; status: string }>();
    expect(body.countryCode).toBe('NG');
    expect(body.status).toBe('pending');
  });

  /** Right country is not sufficient — competence must be established too. */
  it('an unverified in-country contributor is refused DIALECT_NOT_VERIFIED', async () => {
    const nigerian = await newUser('NG', []);
    const response = await submit(strictApp, nigerian.token, NG_DIALECT);

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('DIALECT_NOT_VERIFIED');
  });

  it('a verified KE contributor may upload to the KE dialect', async () => {
    const kenyan = await newUser('KE', [KE_DIALECT]);
    expect((await submit(strictApp, kenyan.token, KE_DIALECT)).statusCode).toBe(201);
  });

  /** FR-106: consensus by one person is not consensus. */
  it('refuses self-review', async () => {
    const nigerian = await newUser('NG', [NG_DIALECT]);
    const { id } = (await submit(strictApp, nigerian.token, NG_DIALECT)).json<{ id: string }>();

    const response = await vote(strictApp, nigerian.token, id);
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('SELF_REVIEW_FORBIDDEN');
  });

  it('a second in-country reviewer may vote once', async () => {
    const author = await newUser('NG', [NG_DIALECT]);
    const reviewer = await newUser('NG', [NG_DIALECT]);
    const { id } = (await submit(strictApp, author.token, NG_DIALECT)).json<{ id: string }>();

    expect((await vote(strictApp, reviewer.token, id)).statusCode).toBe(201);
    expect((await vote(strictApp, reviewer.token, id)).statusCode).toBe(409);
  });

  it('scopes the review queue to the reviewer\'s own community', async () => {
    const nigerian = await newUser('NG', [NG_DIALECT]);
    await submit(strictApp, nigerian.token, NG_DIALECT);

    const response = await strictApp.inject({
      method: 'GET',
      url: `/v1/contributions/queue?dialectId=${NG_DIALECT}`,
      headers: { authorization: `Bearer ${nigerian.token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ countryCode: string; contributions: unknown[] }>();
    expect(body.countryCode).toBe('NG');
    expect(body.contributions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('diaspora policy (ADR-0009)', () => {
  /**
   * These two tests pin BOTH settings so the policy cannot drift silently.
   * Strict is the default and matches the specification; the override exists
   * because 02-CONCEPT-NOTE.md names the diaspora as a primary audience, and
   * that tension is a decision for the project rather than a bug to hide.
   */
  it('strict mode refuses a verified diaspora contributor', async () => {
    const londoner = await newUser('GB', [NG_DIALECT]);
    const response = await submit(strictApp, londoner.token, NG_DIALECT);

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('DIALECT_GEOGRAPHIC_MISMATCH');
  });

  it('override mode admits a verified diaspora contributor', async () => {
    const londoner = await newUser('GB', [NG_DIALECT]);
    expect((await submit(diasporaApp, londoner.token, NG_DIALECT)).statusCode).toBe(201);
  });

  it('override never admits an UNverified diaspora contributor', async () => {
    const londoner = await newUser('GB', []);
    const response = await submit(diasporaApp, londoner.token, NG_DIALECT);
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------

describe('geographic metadata and constraints', () => {
  it('bundle manifest always carries the geographic scope', async () => {
    const response = await strictApp.inject({
      method: 'GET',
      url: `/v1/bundles/manifest?dialect=${KE_DIALECT}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ countryCode: string; communityRegion: string }>();
    expect(body.countryCode).toBe('KE');
    expect(body.communityRegion.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown dialect rather than an empty manifest', async () => {
    const response = await strictApp.inject({
      method: 'GET',
      url: '/v1/bundles/manifest?dialect=zz-nowhere',
    });
    expect(response.statusCode).toBe(404);
  });

  it('the database rejects a malformed country code', async () => {
    await expect(
      db.execute(
        sql`INSERT INTO dialects (id, language_id, name, country_code, community_region)
            VALUES ('zz-bad', ${NG_LANGUAGE}, 'Bad', 'nga', 'Nowhere')`,
      ),
    ).rejects.toThrow();
  });

  /**
   * Most African languages cross borders — colonial boundaries were drawn
   * without regard to speech communities. A single-country model would
   * misclassify the majority of them.
   */
  it('records additional countries for a cross-border language', async () => {
    const [language] = await db
      .select()
      .from(tables.languages)
      .where(eq(tables.languages.id, NG_LANGUAGE));

    expect(language!.countryCode).toBe('NG');
    expect(language!.alsoSpokenIn).toEqual(['BJ', 'TG']);
  });
});
