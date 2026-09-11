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

import { sql } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  integer,
  real,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  uuid,
  primaryKey,
  index,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';

// --- Languages and varieties -----------------------------------------------

export const languages = pgTable('languages', {
  /** ISO 639-1 where one exists, else ISO 639-3. e.g. 'ki' for Gĩkũyũ. */
  id: varchar('id', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  nativeName: varchar('native_name', { length: 64 }).notNull(),
  isTonal: boolean('is_tonal').notNull().default(false),

  /** ISO 3166-1 alpha-2 of the primary country of origin (ADR-0009). */
  countryCode: varchar('country_code', { length: 2 }).notNull(),
  /**
   * Additional countries where this language is natively spoken.
   * Most African languages are cross-border; a single country column alone
   * would assert falsehoods such as "Swahili belongs to Kenya".
   */
  alsoSpokenIn: varchar('also_spoken_in', { length: 2 })
    .array()
    .notNull()
    .default(sql`'{}'`),

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

    /** ISO 3166-1 alpha-2. Dialect ids are strictly scoped to this (ADR-0009). */
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    /**
     * Specific speech community, e.g. "Eldoret, Rift Valley".
     * Finer-grained than country: two varieties within one country may differ
     * in tone and lexicon, which is the ambiguity this locking exists to
     * prevent.
     */
    communityRegion: varchar('community_region', { length: 100 }).notNull(),

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
  (t) => [
    index('idx_dialects_language').on(t.languageId),
    index('idx_dialects_country').on(t.countryCode),
    index('idx_dialects_country_region').on(t.countryCode, t.communityRegion),
    // Guarantees a dialect id can never be re-pointed at a different country.
    unique('dialects_country_id_unique').on(t.countryCode, t.id),
  ],
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
    /** Lesson-level register, inherited by exercises that do not override it. */
    register: varchar('register', { length: 16 }),

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

    /**
     * Social register. In many African languages this is grammatically
     * MANDATORY rather than stylistic — addressing an elder with a peer form is
     * disrespect, not a grammar slip. Neutral by default so existing content
     * remains valid, but tonal/honorific languages should set it explicitly.
     */
    register: varchar('register', { length: 16 }).notNull().default('neutral'),
    /** Who the utterance is addressed to. Varies independently of register. */
    addressee: varchar('addressee', { length: 16 }),

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
    /** Language of the app interface. Independent of anchorLanguage. */
    uiLocale: varchar('ui_locale', { length: 10 }).notNull().default('en'),
    /** Measured during onboarding; pitch feedback is relative to this (FR-067). */
    pitchBaselineHz: real('pitch_baseline_hz'),

    /** ISO 3166-1 alpha-2 (ADR-0009). */
    homeCountryCode: varchar('home_country_code', { length: 2 }).notNull(),
    /**
     * Dialects this contributor is verified to contribute to. Competence-based
     * rather than passport-based, and granted by a designated authority rather
     * than self-asserted.
     */
    verifiedDialects: varchar('verified_dialects', { length: 32 })
      .array()
      .notNull()
      .default(sql`'{}'`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('idx_users_email').on(t.email),
    index('idx_users_home_country').on(t.homeCountryCode),
  ],
);

/**
 * Multiple learners per account. Families share one phone; without this a
 * second child overwrites the first child's progress.
 *
 * Phase 1: the table exists and every account has a default profile. Phase 2
 * moves the progress primary key onto profile_id — deliberately not done in the
 * same change as geographic locking (migrations/0005).
 */
export const learnerProfiles = pgTable(
  'learner_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 64 }).notNull(),
    anchorLanguage: varchar('anchor_language', { length: 10 }).notNull().default('en'),
    uiLocale: varchar('ui_locale', { length: 10 }).notNull().default('en'),
    pitchBaselineHz: doublePrecision('pitch_baseline_hz'),
    /** Drives stricter defaults: no leaderboards, no notifications, image rules. */
    isChild: boolean('is_child').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_profiles_account').on(t.accountId)],
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
    // DOUBLE PRECISION, not REAL. float4 has ~7 significant digits and silently
    // truncates JavaScript numbers, breaking client/server equality — see
    // migrations/0003.
    stability: doublePrecision('stability').notNull().default(0),
    difficulty: doublePrecision('difficulty').notNull().default(0),
    elapsedDays: doublePrecision('elapsed_days').notNull().default(0),
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
    elapsedDays: doublePrecision('elapsed_days').notNull().default(0),
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

/**
 * Proverbs and idioms.
 *
 * Structurally unlike a sentence: a literal translation reads as nonsense and a
 * fluent one loses the imagery, so BOTH are stored — plus the situations in
 * which the proverb is actually used, without which a learner knows the words
 * and still cannot use it.
 */
export const proverbs = pgTable(
  'proverbs',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    dialectId: varchar('dialect_id', { length: 32 })
      .notNull()
      .references(() => dialects.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    /** Word-for-word. Usually reads as nonsense — that is expected and useful. */
    literalGloss: jsonb('literal_gloss').notNull(),
    meaning: jsonb('meaning').notNull(),
    usageContext: jsonb('usage_context').notNull(),
    audioPath: text('audio_path'),
    tones: jsonb('tones'),
    attribution: varchar('attribution', { length: 128 }),
    validated: boolean('validated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_proverbs_dialect').on(t.dialectId)],
);

// --- Contributions ---------------------------------------------------------

export const audioContributions = pgTable(
  'audio_contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contributorId: uuid('contributor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dialectId: varchar('dialect_id', { length: 32 })
      .notNull()
      .references(() => dialects.id, { onDelete: 'cascade' }),
    vocabItemId: varchar('vocab_item_id', { length: 128 }).references(
      () => vocabularyItems.id,
      { onDelete: 'set null' },
    ),

    promptText: text('prompt_text').notNull(),
    audioPath: text('audio_path').notNull(),
    durationMs: integer('duration_ms'),
    snrDb: doublePrecision('snr_db'),

    /**
     * Denormalised from the dialect AT SUBMISSION TIME, deliberately. If a
     * dialect's country were later corrected, historical submissions must
     * retain the geography under which they were accepted, or the audit trail
     * misrepresents what was actually approved.
     */
    countryCode: varchar('country_code', { length: 2 }).notNull(),

    /** pending | approved | rejected | withdrawn */
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_contributions_dialect').on(t.dialectId, t.status),
    index('idx_contributions_contributor').on(t.contributorId),
    index('idx_contributions_country').on(t.countryCode),
  ],
);

export const contributionVotes = pgTable(
  'contribution_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contributionId: uuid('contribution_id')
      .notNull()
      .references(() => audioContributions.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** approve | reject | wrong_dialect */
    vote: varchar('vote', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_votes_contribution').on(t.contributionId),
    // FR-106: one vote per reviewer per submission.
    unique('contribution_votes_unique').on(t.contributionId, t.reviewerId),
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
    /**
     * The exact serialised text whose sha256 is recorded above. TEXT, not
     * JSONB: JSONB normalises key order and whitespace, which would change the
     * hash and turn every valid bundle into a spurious integrity failure.
     */
    payload: text('payload'),
    formatVersion: integer('format_version').notNull().default(1),
    countryCode: varchar('country_code', { length: 2 }),
    communityRegion: varchar('community_region', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('idx_bundles_dialect_version').on(t.dialectId, t.version)],
);
