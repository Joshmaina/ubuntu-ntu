-- =========================================================================
-- UBUNTU-NTU — PostgreSQL schema
--
-- GENERATED FILE — do not edit by hand.
-- Regenerate with: pnpm schema:dump
--
-- Source of truth is migrations/*.sql. This document is derived from the
-- live schema so it can never drift from the database.
-- =========================================================================

-- ----------------------------------------------------------------------
CREATE TABLE audio_contributions (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    contributor_id  UUID NOT NULL,
    dialect_id      CHARACTER VARYING(32) NOT NULL,
    vocab_item_id   CHARACTER VARYING(128),
    prompt_text     TEXT NOT NULL,
    audio_path      TEXT NOT NULL,
    duration_ms     INTEGER,
    snr_db          DOUBLE PRECISION,
    country_code    CHARACTER VARYING(2) NOT NULL,
    status          CHARACTER VARYING(20) NOT NULL DEFAULT 'pending'::character varying,
    withdrawn_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   FOREIGN KEY (contributor_id) REFERENCES users(id) ON DELETE CASCADE
--   CHECK (((country_code)::text ~ '^[A-Z]{2}$'::text))
--   FOREIGN KEY (dialect_id) REFERENCES dialects(id) ON DELETE CASCADE
--   PRIMARY KEY (id)
--   CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'withdrawn'::character varying])::text[])))
--   FOREIGN KEY (vocab_item_id) REFERENCES vocabulary_items(id) ON DELETE SET NULL

CREATE UNIQUE INDEX audio_contributions_pkey ON public.audio_contributions USING btree (id);
CREATE INDEX idx_contributions_contributor ON public.audio_contributions USING btree (contributor_id);
CREATE INDEX idx_contributions_country ON public.audio_contributions USING btree (country_code);
CREATE INDEX idx_contributions_dialect ON public.audio_contributions USING btree (dialect_id, status);

-- ----------------------------------------------------------------------
CREATE TABLE bundles (
    id          CHARACTER VARYING(128) NOT NULL,
    dialect_id  CHARACTER VARYING(32) NOT NULL,
    version     INTEGER NOT NULL,
    size_bytes  INTEGER NOT NULL,
    sha256      CHARACTER VARYING(64) NOT NULL,
    lesson_ids  JSONB NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   FOREIGN KEY (dialect_id) REFERENCES dialects(id) ON DELETE CASCADE
--   PRIMARY KEY (id)

CREATE UNIQUE INDEX bundles_pkey ON public.bundles USING btree (id);
CREATE UNIQUE INDEX idx_bundles_dialect_version ON public.bundles USING btree (dialect_id, version);

-- ----------------------------------------------------------------------
CREATE TABLE contribution_votes (
    id               UUID NOT NULL DEFAULT gen_random_uuid(),
    contribution_id  UUID NOT NULL,
    reviewer_id      UUID NOT NULL,
    vote             CHARACTER VARYING(16) NOT NULL,
    reason           CHARACTER VARYING(50),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   FOREIGN KEY (contribution_id) REFERENCES audio_contributions(id) ON DELETE CASCADE
--   PRIMARY KEY (id)
--   FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
--   UNIQUE (contribution_id, reviewer_id)
--   CHECK (((vote)::text = ANY ((ARRAY['approve'::character varying, 'reject'::character varying, 'wrong_dialect'::character varying])::text[])))

CREATE UNIQUE INDEX contribution_votes_pkey ON public.contribution_votes USING btree (id);
CREATE UNIQUE INDEX contribution_votes_unique ON public.contribution_votes USING btree (contribution_id, reviewer_id);
CREATE INDEX idx_votes_contribution ON public.contribution_votes USING btree (contribution_id);

-- ----------------------------------------------------------------------
CREATE TABLE dialects (
    id                      CHARACTER VARYING(32) NOT NULL,
    language_id             CHARACTER VARYING(10) NOT NULL,
    name                    CHARACTER VARYING(100) NOT NULL,
    region                  CHARACTER VARYING(128),
    description             TEXT,
    authority_name          CHARACTER VARYING(128),
    authority_affiliation   CHARACTER VARYING(200),
    authority_confirmed_at  TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    country_code            CHARACTER VARYING(2) NOT NULL,
    community_region        CHARACTER VARYING(100) NOT NULL
);

-- Constraints:
--   CHECK (((country_code)::text ~ '^[A-Z]{2}$'::text))
--   UNIQUE (country_code, id)
--   FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
--   PRIMARY KEY (id)

CREATE UNIQUE INDEX dialects_country_id_unique ON public.dialects USING btree (country_code, id);
CREATE UNIQUE INDEX dialects_pkey ON public.dialects USING btree (id);
CREATE INDEX idx_dialects_country ON public.dialects USING btree (country_code);
CREATE INDEX idx_dialects_country_region ON public.dialects USING btree (country_code, community_region);
CREATE INDEX idx_dialects_language ON public.dialects USING btree (language_id);

-- ----------------------------------------------------------------------
CREATE TABLE exercises (
    id             CHARACTER VARYING(128) NOT NULL,
    lesson_id      CHARACTER VARYING(128) NOT NULL,
    type           CHARACTER VARYING(32) NOT NULL,
    order_index    INTEGER NOT NULL,
    payload        JSONB NOT NULL,
    vocab_item_id  CHARACTER VARYING(128),
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
--   PRIMARY KEY (id)
--   FOREIGN KEY (vocab_item_id) REFERENCES vocabulary_items(id) ON DELETE SET NULL

CREATE UNIQUE INDEX exercises_pkey ON public.exercises USING btree (id);
CREATE UNIQUE INDEX idx_exercises_lesson_order ON public.exercises USING btree (lesson_id, order_index);

-- ----------------------------------------------------------------------
CREATE TABLE fsrs_review_logs (
    id             UUID NOT NULL,
    user_id        UUID NOT NULL,
    vocab_item_id  CHARACTER VARYING(128) NOT NULL,
    rating         INTEGER NOT NULL,
    state          INTEGER NOT NULL,
    reviewed_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    elapsed_days   DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_ms    INTEGER NOT NULL DEFAULT 0,
    client_id      CHARACTER VARYING(64),
    received_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    profile_id     UUID
);

-- Constraints:
--   PRIMARY KEY (id)
--   FOREIGN KEY (profile_id) REFERENCES learner_profiles(id) ON DELETE CASCADE
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
--   FOREIGN KEY (vocab_item_id) REFERENCES vocabulary_items(id) ON DELETE CASCADE
--   CHECK (((rating >= 1) AND (rating <= 4)))

CREATE UNIQUE INDEX fsrs_review_logs_pkey ON public.fsrs_review_logs USING btree (id);
CREATE INDEX idx_review_logs_profile ON public.fsrs_review_logs USING btree (profile_id);
CREATE INDEX idx_review_replay ON public.fsrs_review_logs USING btree (user_id, vocab_item_id, reviewed_at, id);

-- ----------------------------------------------------------------------
CREATE TABLE languages (
    id              CHARACTER VARYING(10) NOT NULL,
    name            CHARACTER VARYING(64) NOT NULL,
    native_name     CHARACTER VARYING(64) NOT NULL,
    is_tonal        BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    country_code    CHARACTER VARYING(2) NOT NULL,
    also_spoken_in  ARRAY NOT NULL DEFAULT '{}'::character varying[]
);

-- Constraints:
--   CHECK (((country_code)::text ~ '^[A-Z]{2}$'::text))
--   PRIMARY KEY (id)

CREATE UNIQUE INDEX languages_pkey ON public.languages USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE learner_profiles (
    id                 UUID NOT NULL DEFAULT gen_random_uuid(),
    account_id         UUID NOT NULL,
    display_name       CHARACTER VARYING(64) NOT NULL,
    anchor_language    CHARACTER VARYING(10) NOT NULL DEFAULT 'en'::character varying,
    pitch_baseline_hz  DOUBLE PRECISION,
    is_child           BOOLEAN NOT NULL DEFAULT false,
    is_default         BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ui_locale          CHARACTER VARYING(10) NOT NULL DEFAULT 'en'::character varying
);

-- Constraints:
--   FOREIGN KEY (account_id) REFERENCES users(id) ON DELETE CASCADE
--   PRIMARY KEY (id)

CREATE INDEX idx_profiles_account ON public.learner_profiles USING btree (account_id);
CREATE UNIQUE INDEX idx_profiles_one_default ON public.learner_profiles USING btree (account_id) WHERE is_default;
CREATE UNIQUE INDEX learner_profiles_pkey ON public.learner_profiles USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE lessons (
    id           CHARACTER VARYING(128) NOT NULL,
    skill_id     CHARACTER VARYING(128) NOT NULL,
    title        JSONB NOT NULL,
    order_index  INTEGER NOT NULL,
    xp_reward    INTEGER NOT NULL DEFAULT 10,
    validated    BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    register     CHARACTER VARYING(16)
);

-- Constraints:
--   PRIMARY KEY (id)
--   CHECK (((register IS NULL) OR ((register)::text = ANY ((ARRAY['neutral'::character varying, 'familiar'::character varying, 'respectful'::character varying, 'formal'::character varying, 'honorific'::character varying])::text[]))))
--   FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE

CREATE UNIQUE INDEX idx_lessons_skill_order ON public.lessons USING btree (skill_id, order_index);
CREATE UNIQUE INDEX lessons_pkey ON public.lessons USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE proverbs (
    id             CHARACTER VARYING(128) NOT NULL,
    dialect_id     CHARACTER VARYING(32) NOT NULL,
    target         TEXT NOT NULL,
    literal_gloss  JSONB NOT NULL,
    meaning        JSONB NOT NULL,
    usage_context  JSONB NOT NULL,
    audio_path     TEXT,
    tones          JSONB,
    attribution    CHARACTER VARYING(128),
    validated      BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   FOREIGN KEY (dialect_id) REFERENCES dialects(id) ON DELETE CASCADE
--   PRIMARY KEY (id)

CREATE INDEX idx_proverbs_dialect ON public.proverbs USING btree (dialect_id);
CREATE UNIQUE INDEX proverbs_pkey ON public.proverbs USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE refresh_tokens (
    id           UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    token_hash   TEXT NOT NULL,
    family_id    UUID NOT NULL,
    expires_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at  TIMESTAMP WITH TIME ZONE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   PRIMARY KEY (id)
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

CREATE UNIQUE INDEX idx_refresh_hash ON public.refresh_tokens USING btree (token_hash);
CREATE INDEX idx_refresh_user ON public.refresh_tokens USING btree (user_id);
CREATE UNIQUE INDEX refresh_tokens_pkey ON public.refresh_tokens USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE skill_prerequisites (
    skill_id         CHARACTER VARYING(128) NOT NULL,
    prerequisite_id  CHARACTER VARYING(128) NOT NULL
);

-- Constraints:
--   CHECK (((skill_id)::text <> (prerequisite_id)::text))
--   PRIMARY KEY (skill_id, prerequisite_id)
--   FOREIGN KEY (prerequisite_id) REFERENCES skills(id) ON DELETE CASCADE
--   FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE

CREATE UNIQUE INDEX skill_prerequisites_pkey ON public.skill_prerequisites USING btree (skill_id, prerequisite_id);

-- ----------------------------------------------------------------------
CREATE TABLE skills (
    id           CHARACTER VARYING(128) NOT NULL,
    dialect_id   CHARACTER VARYING(32) NOT NULL,
    title        JSONB NOT NULL,
    description  JSONB,
    icon         CHARACTER VARYING(48),
    position_x   INTEGER NOT NULL DEFAULT 0,
    position_y   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraints:
--   FOREIGN KEY (dialect_id) REFERENCES dialects(id) ON DELETE CASCADE
--   PRIMARY KEY (id)

CREATE INDEX idx_skills_dialect ON public.skills USING btree (dialect_id);
CREATE UNIQUE INDEX skills_pkey ON public.skills USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE user_fsrs_cards (
    user_id         UUID NOT NULL,
    vocab_item_id   CHARACTER VARYING(128) NOT NULL,
    state           INTEGER NOT NULL DEFAULT 0,
    stability       DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty      DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days    DOUBLE PRECISION NOT NULL DEFAULT 0,
    scheduled_days  INTEGER NOT NULL DEFAULT 0,
    reps            INTEGER NOT NULL DEFAULT 0,
    lapses          INTEGER NOT NULL DEFAULT 0,
    last_review     TIMESTAMP WITH TIME ZONE,
    due             TIMESTAMP WITH TIME ZONE,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    profile_id      UUID
);

-- Constraints:
--   CHECK (((difficulty >= (0)::double precision) AND (difficulty <= (10)::double precision)))
--   CHECK (((state >= 0) AND (state <= 3)))
--   PRIMARY KEY (user_id, vocab_item_id)
--   FOREIGN KEY (profile_id) REFERENCES learner_profiles(id) ON DELETE CASCADE
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
--   FOREIGN KEY (vocab_item_id) REFERENCES vocabulary_items(id) ON DELETE CASCADE

CREATE INDEX idx_fsrs_cards_profile ON public.user_fsrs_cards USING btree (profile_id);
CREATE INDEX idx_fsrs_due_queue ON public.user_fsrs_cards USING btree (user_id, due);
CREATE UNIQUE INDEX user_fsrs_cards_pkey ON public.user_fsrs_cards USING btree (user_id, vocab_item_id);

-- ----------------------------------------------------------------------
CREATE TABLE users (
    id                 UUID NOT NULL DEFAULT gen_random_uuid(),
    email              CHARACTER VARYING(320) NOT NULL,
    password_hash      TEXT NOT NULL,
    anchor_language    CHARACTER VARYING(10) NOT NULL DEFAULT 'en'::character varying,
    pitch_baseline_hz  REAL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMP WITH TIME ZONE,
    home_country_code  CHARACTER VARYING(2) NOT NULL,
    verified_dialects  ARRAY NOT NULL DEFAULT '{}'::character varying[],
    ui_locale          CHARACTER VARYING(10) NOT NULL DEFAULT 'en'::character varying
);

-- Constraints:
--   CHECK (((home_country_code)::text ~ '^[A-Z]{2}$'::text))
--   PRIMARY KEY (id)

CREATE UNIQUE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_home_country ON public.users USING btree (home_country_code);
CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

-- ----------------------------------------------------------------------
CREATE TABLE vocabulary_items (
    id              CHARACTER VARYING(128) NOT NULL,
    dialect_id      CHARACTER VARYING(32) NOT NULL,
    target          TEXT NOT NULL,
    ipa             TEXT,
    tones           JSONB,
    anchors         JSONB NOT NULL,
    part_of_speech  CHARACTER VARYING(32),
    audio_path      TEXT,
    notes           TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    image           JSONB,
    register        CHARACTER VARYING(16) NOT NULL DEFAULT 'neutral'::character varying,
    addressee       CHARACTER VARYING(16)
);

-- Constraints:
--   CHECK (((addressee IS NULL) OR ((addressee)::text = ANY ((ARRAY['peer'::character varying, 'elder'::character varying, 'younger'::character varying, 'group'::character varying, 'stranger'::character varying, 'child'::character varying])::text[]))))
--   FOREIGN KEY (dialect_id) REFERENCES dialects(id) ON DELETE CASCADE
--   PRIMARY KEY (id)
--   CHECK (((register)::text = ANY ((ARRAY['neutral'::character varying, 'familiar'::character varying, 'respectful'::character varying, 'formal'::character varying, 'honorific'::character varying])::text[])))

CREATE INDEX idx_vocab_dialect ON public.vocabulary_items USING btree (dialect_id);
CREATE UNIQUE INDEX vocabulary_items_pkey ON public.vocabulary_items USING btree (id);
