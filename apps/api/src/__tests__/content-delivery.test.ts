/**
 * End-to-end content delivery.
 *
 * Closes the half of the M4 walking skeleton the earlier round trip skipped.
 * That test seeded vocabulary straight into Postgres and had the device review
 * known ids — it never exercised how content actually REACHES a device.
 *
 * Full path here: built bundle in Postgres → manifest → download → verify
 * sha256 → install into on-device SQLite → learn from it with the network gone.
 *
 * Requires the stack plus `pnpm migrate && pnpm seed && pnpm build:bundles`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { loadEnv, type Env } from '@ubuntu-ntu/config';
import { Rating } from '@ubuntu-ntu/core';
import {
  LearningStore,
  BundleInstaller,
  SyncEngine,
  InstallFailure,
  type OutboxEvent,
  type SqliteAdapter,
} from '@ubuntu-ntu/sync';
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

const sha256 = (input: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(input, 'utf8').digest('hex'));

let app: FastifyInstance;
let db: Db;
let close: () => Promise<void>;

const NOW = Date.UTC(2026, 8, 11, 9, 0, 0);
const DAY = 86_400_000;
const DIALECT = 'ki-central';

beforeAll(async () => {
  loadDotEnv();
  const env: Env = loadEnv({
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
  const email = `cd-${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct-horse-battery', homeCountryCode: 'KE' },
  });
  const { accessToken } = response.json<{ accessToken: string }>();
  const [row] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  return { userId: row!.id, token: accessToken };
}

interface ManifestEntry {
  id: string;
  version: number;
  sizeBytes: number;
  sha256: string;
  lessonIds: string[];
}

async function fetchManifest(): Promise<{ countryCode: string; bundles: ManifestEntry[] }> {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/bundles/manifest?dialect=${DIALECT}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function device() {
  const adapter = new Adapter();
  const store = new LearningStore(adapter);
  return { adapter, store, installer: new BundleInstaller(store, adapter, sha256) };
}

// ---------------------------------------------------------------------------

describe('manifest', () => {
  it('lists at least one built bundle', async () => {
    const manifest = await fetchManifest();
    expect(manifest.bundles.length).toBeGreaterThan(0);
    expect(manifest.countryCode).toBe('KE');
  });

  it('every bundle carries the hash a client needs to verify it', async () => {
    const { bundles } = await fetchManifest();
    for (const bundle of bundles) {
      expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(bundle.sizeBytes).toBeGreaterThan(0);
      expect(bundle.lessonIds.length).toBeGreaterThan(0);
    }
  });
});

describe('download', () => {
  it('serves bytes whose hash matches the manifest', async () => {
    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;

    const response = await app.inject({ method: 'GET', url: `/v1/bundles/${entry.id}` });
    expect(response.statusCode).toBe(200);

    // The server must not re-serialise or pretty-print: the client hashes these
    // exact bytes, and any normalisation would make a valid bundle look corrupt.
    expect(await sha256(response.body)).toBe(entry.sha256);
  });

  it('marks bundles immutable so clients may cache forever', async () => {
    const { bundles } = await fetchManifest();
    const response = await app.inject({ method: 'GET', url: `/v1/bundles/${bundles[0]!.id}` });
    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('returns 404 for an unknown bundle', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/bundles/bundle-nope-000000' });
    expect(response.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// The gate: content reaches a device and works with no network
// ---------------------------------------------------------------------------

describe('download, install, and learn offline', () => {
  it('installs a downloaded bundle and serves its lessons with no network', async () => {
    const { installer } = device();

    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;
    const raw = (await app.inject({ method: 'GET', url: `/v1/bundles/${entry.id}` })).body;

    const result = await installer.install(
      raw,
      { id: entry.id, version: entry.version, sha256: entry.sha256, sizeBytes: entry.sizeBytes },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lessons).toBe(entry.lessonIds.length);

    // Every lesson the manifest promised is now readable locally.
    for (const lessonId of entry.lessonIds) {
      expect(installer.getLesson(lessonId)).not.toBeNull();
    }
  });

  it('carries the geographic scope with the content itself', async () => {
    const { installer } = device();
    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;
    const raw = (await app.inject({ method: 'GET', url: `/v1/bundles/${entry.id}` })).body;

    await installer.install(
      raw,
      { id: entry.id, version: entry.version, sha256: entry.sha256, sizeBytes: entry.sizeBytes },
      NOW,
    );

    // A device that has the bundle knows which community it came from, offline.
    const [installed] = installer.installed();
    expect(installed!.countryCode).toBe('KE');
    expect(installed!.communityRegion.length).toBeGreaterThan(0);
  });

  /**
   * The complete walking skeleton: content arrives over the network, then the
   * network goes away entirely and learning still works end to end.
   */
  it('reviews installed vocabulary offline, then syncs on reconnection', async () => {
    const { userId, token } = await newUser();
    const { store, installer } = device();

    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;
    const raw = (await app.inject({ method: 'GET', url: `/v1/bundles/${entry.id}` })).body;
    await installer.install(
      raw,
      { id: entry.id, version: entry.version, sha256: entry.sha256, sizeBytes: entry.sizeBytes },
      NOW,
    );

    // Vocabulary comes from the BUNDLE, not from hardcoded test ids — this is
    // the link the earlier round trip never exercised.
    const vocabIds = installer.vocabularyIds();
    expect(vocabIds.length).toBeGreaterThan(0);

    let online = false;
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

    // Offline: review everything the bundle delivered.
    vocabIds.forEach((vocabItemId, i) => {
      store.applyReview({
        eventId: randomUUID(),
        vocabItemId,
        rating: ((i % 4) + 1) as Rating,
        reviewedAt: NOW - (vocabIds.length - i) * DAY,
      });
    });

    expect((await engine.sync(NOW)).error).toBeDefined();
    expect(store.pendingCount()).toBe(vocabIds.length);

    online = true;
    const outcome = await engine.sync(NOW);

    expect(outcome.acknowledged).toBe(vocabIds.length);
    expect(outcome.remaining).toBe(0);

    // The server accepted every id — so bundle content and server content agree.
    const logs = await db
      .select()
      .from(tables.fsrsReviewLogs)
      .where(eq(tables.fsrsReviewLogs.userId, userId));
    expect(logs).toHaveLength(vocabIds.length);
  });

  /**
   * Integrity across the real transport. A truncated download must be refused,
   * not silently turned into lessons.
   */
  it('refuses a bundle corrupted in transit', async () => {
    const { installer } = device();
    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;
    const raw = (await app.inject({ method: 'GET', url: `/v1/bundles/${entry.id}` })).body;

    const truncated = raw.slice(0, raw.length - 20);
    const result = await installer.install(
      truncated,
      { id: entry.id, version: entry.version, sha256: entry.sha256, sizeBytes: entry.sizeBytes },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(InstallFailure.HashMismatch);
    expect(installer.installed()).toHaveLength(0);
  });

  it('re-downloading an already-installed bundle is unnecessary', async () => {
    const { installer } = device();
    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;
    const raw = (await app.inject({ method: 'GET', url: `/v1/bundles/${entry.id}` })).body;
    const descriptor = {
      id: entry.id,
      version: entry.version,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
    };

    await installer.install(raw, descriptor, NOW);

    // Content addressing: the id already present means byte-identical content,
    // so a client can skip the download entirely.
    expect(installer.hasBundle(entry.id)).toBe(true);
  });
});

describe('content addressing', () => {
  /**
   * Rebuilding unchanged content must produce the SAME id. If it did not,
   * "immutable and content-addressed" would be false and every rebuild would
   * force every device to re-download.
   */
  it('the published bundle id derives from its content hash', async () => {
    const { bundles } = await fetchManifest();
    const entry = bundles[0]!;
    expect(entry.id).toContain(entry.sha256.slice(0, 12));
  });
});
