/**
 * On-device SQLite schema.
 *
 * ONE definition, used by BOTH clients (ADR-0007):
 *   - mobile: expo-sqlite
 *   - web:    SQLite-WASM over OPFS
 *
 * Deliberately narrower than the Postgres schema. The device stores only what
 * it needs to run offline; it is not a mirror of the server.
 *
 * Timestamps are stored as INTEGER epoch milliseconds rather than as text, so
 * that comparisons and ordering are numeric and locale-independent — the same
 * reason Postgres is pinned to locale=C.
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/** Per-user FSRS state for one vocabulary item. Mirrors the `Card` type in core. */
export const cards = sqliteTable(
  'cards',
  {
    vocabItemId: text('vocab_item_id').primaryKey(),
    state: integer('state').notNull().default(0),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: real('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReview: integer('last_review'),
    due: integer('due'),
  },
  (t) => [index('idx_cards_due').on(t.due)],
);

/**
 * Pending review events awaiting sync.
 *
 * THE most correctness-critical table on the device. An event is written here
 * in the SAME transaction that updates `cards` — if those were separate
 * transactions, a crash between them would either lose a review or apply one
 * twice (docs/08-SYNC-PROTOCOL.md §5.2).
 *
 * A row is deleted only after the server acknowledges its id.
 */
export const reviewOutbox = sqliteTable(
  'review_outbox',
  {
    /** Client-generated UUIDv7 — the idempotency key. */
    eventId: text('event_id').primaryKey(),
    vocabItemId: text('vocab_item_id').notNull(),
    rating: integer('rating').notNull(),
    state: integer('state').notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
    elapsedDays: real('elapsed_days').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastAttempt: integer('last_attempt'),
    /** 0 = pending, 1 = acknowledged. Acked rows are retained 7 days. */
    acked: integer('acked').notNull().default(0),
  },
  (t) => [index('idx_outbox_pending').on(t.acked, t.createdAt)],
);

/** Installed content bundles. */
export const installedBundles = sqliteTable('installed_bundles', {
  id: text('id').primaryKey(),
  dialectId: text('dialect_id').notNull(),
  version: integer('version').notNull(),
  sha256: text('sha256').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  installedAt: integer('installed_at').notNull(),
});

/** Denormalised lesson content, unpacked from a bundle for offline use. */
export const localLessons = sqliteTable(
  'local_lessons',
  {
    id: text('id').primaryKey(),
    bundleId: text('bundle_id').notNull(),
    skillId: text('skill_id').notNull(),
    orderIndex: integer('order_index').notNull(),
    /** Serialised lesson payload including exercises and gloss. */
    payload: text('payload').notNull(),
  },
  (t) => [index('idx_local_lessons_skill').on(t.skillId, t.orderIndex)],
);

/** Key-value settings: anchor language, pitch baseline, sync cursor. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
