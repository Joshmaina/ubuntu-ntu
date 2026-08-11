/**
 * Server-side Postgres schema.
 *
 * The five tables named in the project brief §Task 3 — languages, dialects,
 * skills, lessons, user_fsrs_cards — are all here, alongside the supporting
 * tables they need.
 *
 * Authority note: content tables are DERIVED from content/*.yaml (ADR-0004).
 * Dropping and rebuilding them loses nothing. The tables that hold
 * irreplaceable data are `fsrs_review_logs` and `users`.
 */

import {
  pgTable,
  varchar,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  uuid,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// --- Languages and varieties -----------------------------------------------

export const languages = pgTable('languages', {
  /** ISO 639-1 where one exists, else ISO 639-3. e.g. 'ki' for Gĩkũyũ. */
  id: varchar('id', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  nativeName: varchar('native_name', { length: 64 }).notNull(),
  isTonal: boolean('is_tonal').notNull().default(false),
  /** Tone inventory, scripts, anchor languages — shape varies by language. */
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dialects = pgTable(
  'dialects',
  {
    /** e.g. 'ki-central'. */
    id: varchar('id', { length: 32 }).primaryKey(),
    languageId: varchar('language_id', { length: 10 })
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    region: varchar('region', { length: 128 }),
    description: text('description'),

    /**
     * NFR-050/NFR-051: content in a variety with no designated linguistic
     * authority must not reach learners. Nullable here so provisional content
     * can exist during development; publication is gated on it being set.
     */
    authorityName: varchar('authority_name', { length: 128 }),
    authorityAffiliation: varchar('authority_affiliation', { length: 200 }),
    authorityConfirmedAt: timestamp('authority_confirmed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_dialects_language').on(t.languageId)],
);

// --- Skill graph -----------------------------------------------------------

export const skills = pgTable(
  'skills',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    dialectId: varchar('dialect_id', { length: 32 })
      .notNull()
      .references(() => dialects.id, { onDelete: 'cascade' }),
    /** Localised by anchor language: { en: "...", fr: "..." }. */
    title: jsonb('title').notNull(),
    description: jsonb('description'),
    icon: varchar('icon', { length: 48 }),
    positionX: integer('position_x').notNull().default(0),
    positionY: integer('position_y').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_skills_dialect').on(t.dialectId)],
);

/** Graph edges. A skill unlocks when all its prerequisites are complete. */
export const skillPrerequisites = pgTable(
  'skill_prerequisites',
  {
    skillId: varchar('skill_id', { length: 128 })
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    prerequisiteId: varchar('prerequisite_id', { length: 128 })
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.skillId, t.prerequisiteId] })],
);

// --- Lessons and exercises -------------------------------------------------

export const lessons = pgTable(
  'lessons',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    skillId: varchar('skill_id', { length: 128 })
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    title: jsonb('title').notNull(),
    orderIndex: integer('order_index').notNull(),
    xpReward: integer('xp_reward').notNull().default(10),

    /** Publication gate (NFR-050). False until a native speaker signs off. */
    validated: boolean('validated').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('idx_lessons_skill_order').on(t.skillId, t.orderIndex)],
);

export const vocabularyItems = pgTable(
  'vocabulary_items',
  {
    /** The FSRS scheduling unit. e.g. 'ki.greetings.v001'. */
    id: varchar('id', { length: 128 }).primaryKey(),
    dialectId: varchar('dialect_id', { length: 32 })
      .notNull()
      .references(() => dialects.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    ipa: text('ipa'),
    /** Per-syllable tone labels for tonal languages. */
    tones: jsonb('tones'),
    /** { en: "market", fr: "marché" } */
    anchors: jsonb('anchors').notNull(),
    partOfSpeech: varchar('part_of_speech', { length: 32 }),
    audioPath: text('audio_path'),
    /**
     * Visual learning (ADR-0008). Populated from day one although the image
     * exercise types ship at M7 — schema is never gated.
     * Shape: { path, alt: {en, sw}, credit?, license? }
     */
    image: jsonb('image'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_vocab_dialect').on(t.dialectId)],
);

export const exercises = pgTable(
  'exercises',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    lessonId: varchar('lesson_id', { length: 128 })
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 32 }).notNull(),
    orderIndex: integer('order_index').notNull(),
    /** Type-specific payload — see docs/07-CONTENT-MODEL.md §5.6. */
    payload: jsonb('payload').notNull(),
    vocabItemId: varchar('vocab_item_id', { length: 128 }).references(
      () => vocabularyItems.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('idx_exercises_lesson_order').on(t.lessonId, t.orderIndex)],
);

// --- Users -----------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    /** argon2id. Never a plaintext password, never logged (FR-002). */
    passwordHash: text('password_hash').notNull(),
    anchorLanguage: varchar('anchor_language', { length: 10 }).notNull().default('en'),
    /** Measured during onboarding; pitch feedback is relative to this (FR-067). */
    pitchBaselineHz: real('pitch_baseline_hz'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('idx_users_email').on(t.email)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /**
     * Rotation family. Reuse of a consumed token invalidates the whole family
     * rather than just that token (NFR-034).
     */
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_refresh_user').on(t.userId),
    uniqueIndex('idx_refresh_hash').on(t.tokenHash),
  ],
);

// --- FSRS ------------------------------------------------------------------

/**
 * Derived card state. NOT the source of truth — this is recomputed by replaying
 * `fsrs_review_logs` through @ubuntu-ntu/core (ADR-0003). It exists so the due
 * queue can be read without replaying on every request.
 */
export const userFsrsCards = pgTable(
  'user_fsrs_cards',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vocabItemId: varchar('vocab_item_id', { length: 128 })
      .notNull()
      .references(() => vocabularyItems.id, { onDelete: 'cascade' }),

    state: integer('state').notNull().default(0),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: real('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),

    lastReview: timestamp('last_review', { withTimezone: true }),
    due: timestamp('due', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.vocabItemId] }),
    index('idx_fsrs_due_queue').on(t.userId, t.due),
  ],
);

/**
 * The append-only event log. THE source of truth for progress (ADR-0003).
 *
 * `id` is a client-generated UUIDv7 and is the idempotency key: re-submitting
 * the same event is a no-op, which is what makes naive retry safe (FR-091).
 */
export const fsrsReviewLogs = pgTable(
  'fsrs_review_logs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vocabItemId: varchar('vocab_item_id', { length: 128 })
      .notNull()
      .references(() => vocabularyItems.id, { onDelete: 'cascade' }),

    rating: integer('rating').notNull(),
    /** Card state BEFORE this review. */
    state: integer('state').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
    elapsedDays: real('elapsed_days').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    /** Installation ID, for diagnosing multi-device sync anomalies. */
    clientId: varchar('client_id', { length: 64 }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Replay ordering: reviewedAt, then id as deterministic tiebreaker.
    index('idx_review_replay').on(t.userId, t.vocabItemId, t.reviewedAt, t.id),
  ],
);

// --- Content bundles -------------------------------------------------------

export const bundles = pgTable(
  'bundles',
  {
    /** Content-addressed: derived from a hash of the contents. */
    id: varchar('id', { length: 128 }).primaryKey(),
    dialectId: varchar('dialect_id', { length: 32 })
      .notNull()
      .references(() => dialects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    lessonIds: jsonb('lesson_ids').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('idx_bundles_dialect_version').on(t.dialectId, t.version)],
);
