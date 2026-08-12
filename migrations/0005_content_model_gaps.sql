-- 0005_content_model_gaps.sql
--
-- Closes four content-model gaps identified in the functionality review. All
-- four are cheap now and expensive later, which is the only reason they are
-- being added before the features that use them (schema is never gated —
-- docs/05-ARCHITECTURE.md §10).

-- ---------------------------------------------------------------------------
-- 1. Social register and honorifics
-- ---------------------------------------------------------------------------
--
-- The largest gap in the content model. 01-VISION.md states that greeting an
-- elder versus a peer is grammatically MANDATORY in Gikuyu, Yoruba, Luganda and
-- many others — using the wrong form is disrespect, not a grammar slip. Yet
-- every phrase authored so far is register-neutral, which means we would teach
-- learners to address elders like age-mates.
--
-- Retrofitting this after content scales would mean re-authoring every phrase.

ALTER TABLE vocabulary_items
  ADD COLUMN register VARCHAR(16) NOT NULL DEFAULT 'neutral';

ALTER TABLE vocabulary_items
  ADD CONSTRAINT vocabulary_register_valid
  CHECK (register IN ('neutral', 'familiar', 'respectful', 'formal', 'honorific'));

-- Who the utterance is addressed to. Distinct from register: a form can be
-- respectful AND addressed to a group, and the two vary independently.
ALTER TABLE vocabulary_items ADD COLUMN addressee VARCHAR(16);

ALTER TABLE vocabulary_items
  ADD CONSTRAINT vocabulary_addressee_valid
  CHECK (addressee IS NULL OR
         addressee IN ('peer', 'elder', 'younger', 'group', 'stranger', 'child'));

ALTER TABLE lessons ADD COLUMN register VARCHAR(16);
ALTER TABLE lessons
  ADD CONSTRAINT lessons_register_valid
  CHECK (register IS NULL OR
         register IN ('neutral', 'familiar', 'respectful', 'formal', 'honorific'));

COMMENT ON COLUMN vocabulary_items.register IS
  'Social register. In many African languages this is grammatically mandatory, '
  'not stylistic — the wrong form is a social error rather than a grammar one.';

-- ---------------------------------------------------------------------------
-- 2. Proverbs and idioms
-- ---------------------------------------------------------------------------
--
-- Named as a headline feature in 01-VISION.md and entirely absent from the
-- content model until now. A proverb is structurally unlike a sentence: it
-- needs a literal gloss, a figurative meaning, AND the situations in which it
-- is appropriately used. A literal translation of a proverb is nonsense; a
-- proper one is wisdom, and the difference is the whole point.

CREATE TABLE proverbs (
    id             VARCHAR(128) PRIMARY KEY,
    dialect_id     VARCHAR(32)  NOT NULL REFERENCES dialects(id) ON DELETE CASCADE,

    target         TEXT         NOT NULL,
    -- Word-for-word, which will usually read as nonsense — that is expected and
    -- pedagogically useful.
    literal_gloss  JSONB        NOT NULL,
    -- What it actually means.
    meaning        JSONB        NOT NULL,
    -- When you would say it. Without this a learner knows the words and still
    -- cannot use the proverb.
    usage_context  JSONB        NOT NULL,

    audio_path     TEXT,
    tones          JSONB,
    attribution    VARCHAR(128),
    validated      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proverbs_dialect ON proverbs(dialect_id);

-- ---------------------------------------------------------------------------
-- 3. Multiple learner profiles per account
-- ---------------------------------------------------------------------------
--
-- Families share one phone. Today a second child would overwrite the first
-- child's progress, because progress is keyed on the ACCOUNT.
--
-- Phase 1 (this migration): create the table, give every existing account a
-- default profile, and add a nullable profile_id to the progress tables.
--
-- Phase 2 (deliberately NOT here): move the progress primary key from
-- (user_id, vocab_item_id) to (profile_id, vocab_item_id). That rewrites the
-- key of the sync path verified in the M4 round trip, and doing it in the same
-- migration as an unrelated geographic-locking feature would mean debugging two
-- changes at once if anything regressed.

CREATE TABLE learner_profiles (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name      VARCHAR(64)  NOT NULL,
    anchor_language   VARCHAR(10)  NOT NULL DEFAULT 'en',
    pitch_baseline_hz DOUBLE PRECISION,
    -- Drives stricter defaults: no leaderboards, no notifications, and the
    -- image rules in governance §9a.
    is_child          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_default        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_account ON learner_profiles(account_id);

-- Exactly one default profile per account.
CREATE UNIQUE INDEX idx_profiles_one_default
  ON learner_profiles(account_id) WHERE is_default;

-- Every existing account gets a default profile so phase 2 has nothing to
-- backfill under time pressure.
INSERT INTO learner_profiles (account_id, display_name, anchor_language, is_default)
SELECT id, 'Default', anchor_language, TRUE FROM users;

ALTER TABLE user_fsrs_cards  ADD COLUMN profile_id UUID REFERENCES learner_profiles(id) ON DELETE CASCADE;
ALTER TABLE fsrs_review_logs ADD COLUMN profile_id UUID REFERENCES learner_profiles(id) ON DELETE CASCADE;

CREATE INDEX idx_fsrs_cards_profile ON user_fsrs_cards(profile_id);
CREATE INDEX idx_review_logs_profile ON fsrs_review_logs(profile_id);

COMMENT ON COLUMN user_fsrs_cards.profile_id IS
  'Nullable during phase 1. NULL means the account default profile. Phase 2 '
  'backfills and moves the primary key here.';

-- ---------------------------------------------------------------------------
-- 4. UI locale
-- ---------------------------------------------------------------------------
--
-- The app interface itself is English-only. A Gikuyu learner in Nairobi may
-- prefer Swahili chrome, and a learner in Abidjan French. Distinct from
-- anchor_language, which is about lesson content: someone may want Swahili
-- menus while learning through English anchors, or the reverse.

ALTER TABLE users ADD COLUMN ui_locale VARCHAR(10) NOT NULL DEFAULT 'en';
ALTER TABLE learner_profiles ADD COLUMN ui_locale VARCHAR(10) NOT NULL DEFAULT 'en';

COMMENT ON COLUMN users.ui_locale IS
  'Language of the application interface. Independent of anchor_language, which '
  'governs lesson content.';
