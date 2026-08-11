-- 0001_initial.sql
-- Initial schema for UBUNTU-NTU. Mirrors packages/schema/src/pg.ts.
--
-- Content tables (languages … exercises) are DERIVED from content/*.yaml and
-- can be dropped and rebuilt at any time (ADR-0004). The irreplaceable tables
-- are users and fsrs_review_logs.

-- ---------------------------------------------------------------------------
-- Languages and varieties
-- ---------------------------------------------------------------------------

CREATE TABLE languages (
    id           VARCHAR(10)  PRIMARY KEY,
    name         VARCHAR(64)  NOT NULL,
    native_name  VARCHAR(64)  NOT NULL,
    is_tonal     BOOLEAN      NOT NULL DEFAULT FALSE,
    metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE dialects (
    id                     VARCHAR(32)  PRIMARY KEY,
    language_id            VARCHAR(10)  NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    name                   VARCHAR(100) NOT NULL,
    region                 VARCHAR(128),
    description            TEXT,
    -- NFR-050/051: content in a variety with no designated linguistic
    -- authority must not reach learners. Nullable so provisional content can
    -- exist during development; publication is gated on it being set.
    authority_name         VARCHAR(128),
    authority_affiliation  VARCHAR(200),
    authority_confirmed_at TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dialects_language ON dialects(language_id);

-- ---------------------------------------------------------------------------
-- Skill graph
-- ---------------------------------------------------------------------------

CREATE TABLE skills (
    id          VARCHAR(128) PRIMARY KEY,
    dialect_id  VARCHAR(32)  NOT NULL REFERENCES dialects(id) ON DELETE CASCADE,
    title       JSONB        NOT NULL,
    description JSONB,
    icon        VARCHAR(48),
    position_x  INTEGER      NOT NULL DEFAULT 0,
    position_y  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_dialect ON skills(dialect_id);

CREATE TABLE skill_prerequisites (
    skill_id        VARCHAR(128) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    prerequisite_id VARCHAR(128) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (skill_id, prerequisite_id),
    CONSTRAINT no_self_prerequisite CHECK (skill_id <> prerequisite_id)
);

-- ---------------------------------------------------------------------------
-- Lessons, vocabulary, exercises
-- ---------------------------------------------------------------------------

CREATE TABLE lessons (
    id          VARCHAR(128) PRIMARY KEY,
    skill_id    VARCHAR(128) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    title       JSONB        NOT NULL,
    order_index INTEGER      NOT NULL,
    xp_reward   INTEGER      NOT NULL DEFAULT 10,
    -- Publication gate (NFR-050). False until a native speaker signs off.
    validated   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_lessons_skill_order ON lessons(skill_id, order_index);

CREATE TABLE vocabulary_items (
    id              VARCHAR(128) PRIMARY KEY,
    dialect_id      VARCHAR(32)  NOT NULL REFERENCES dialects(id) ON DELETE CASCADE,
    target          TEXT         NOT NULL,
    ipa             TEXT,
    tones           JSONB,
    anchors         JSONB        NOT NULL,
    part_of_speech  VARCHAR(32),
    audio_path      TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vocab_dialect ON vocabulary_items(dialect_id);

CREATE TABLE exercises (
    id            VARCHAR(128) PRIMARY KEY,
    lesson_id     VARCHAR(128) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    type          VARCHAR(32)  NOT NULL,
    order_index   INTEGER      NOT NULL,
    payload       JSONB        NOT NULL,
    vocab_item_id VARCHAR(128) REFERENCES vocabulary_items(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_exercises_lesson_order ON exercises(lesson_id, order_index);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email             VARCHAR(320) NOT NULL,
    -- argon2id. Never plaintext, never logged (FR-002).
    password_hash     TEXT         NOT NULL,
    anchor_language   VARCHAR(10)  NOT NULL DEFAULT 'en',
    pitch_baseline_hz REAL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_email ON users(email);

CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    -- Rotation family: reuse of a consumed token invalidates the whole family,
    -- not just that token (NFR-034).
    family_id   UUID        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
CREATE UNIQUE INDEX idx_refresh_hash ON refresh_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- FSRS
-- ---------------------------------------------------------------------------

-- Derived state. NOT the source of truth — recomputed by replaying
-- fsrs_review_logs through @ubuntu-ntu/core (ADR-0003). Exists so the due
-- queue can be read without replaying on every request.
CREATE TABLE user_fsrs_cards (
    user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocab_item_id  VARCHAR(128) NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    state          INTEGER      NOT NULL DEFAULT 0,
    stability      REAL         NOT NULL DEFAULT 0,
    difficulty     REAL         NOT NULL DEFAULT 0,
    elapsed_days   REAL         NOT NULL DEFAULT 0,
    scheduled_days INTEGER      NOT NULL DEFAULT 0,
    reps           INTEGER      NOT NULL DEFAULT 0,
    lapses         INTEGER      NOT NULL DEFAULT 0,
    last_review    TIMESTAMPTZ,
    due            TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, vocab_item_id),
    CONSTRAINT difficulty_range CHECK (difficulty >= 0 AND difficulty <= 10),
    CONSTRAINT state_range      CHECK (state BETWEEN 0 AND 3)
);

CREATE INDEX idx_fsrs_due_queue ON user_fsrs_cards(user_id, due);

-- The append-only event log. THE source of truth for progress (ADR-0003).
-- id is a client-generated UUIDv7 and is the idempotency key: re-submitting the
-- same event is a no-op, which is what makes naive retry safe (FR-091).
CREATE TABLE fsrs_review_logs (
    id            UUID         PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocab_item_id VARCHAR(128) NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    rating        INTEGER      NOT NULL,
    state         INTEGER      NOT NULL,
    reviewed_at   TIMESTAMPTZ  NOT NULL,
    elapsed_days  REAL         NOT NULL DEFAULT 0,
    duration_ms   INTEGER      NOT NULL DEFAULT 0,
    client_id     VARCHAR(64),
    received_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT rating_range CHECK (rating BETWEEN 1 AND 4)
);

-- Replay ordering: reviewed_at, then id as deterministic tiebreaker.
CREATE INDEX idx_review_replay
    ON fsrs_review_logs(user_id, vocab_item_id, reviewed_at, id);

-- ---------------------------------------------------------------------------
-- Content bundles
-- ---------------------------------------------------------------------------

CREATE TABLE bundles (
    id         VARCHAR(128) PRIMARY KEY,
    dialect_id VARCHAR(32)  NOT NULL REFERENCES dialects(id) ON DELETE CASCADE,
    version    INTEGER      NOT NULL,
    size_bytes INTEGER      NOT NULL,
    sha256     VARCHAR(64)  NOT NULL,
    lesson_ids JSONB        NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bundles_dialect_version ON bundles(dialect_id, version);
