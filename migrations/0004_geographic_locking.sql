-- 0004_geographic_locking.sql
--
-- Country-based geographic locking for languages, dialects, and contributions.
--
-- Goal: prevent cross-border dialect conflicts, tone ambiguity, and regional
-- overlap by scoping content and contribution rights to a country and community
-- region.
--
-- See docs/adr/0009-geographic-locking.md for the trade-offs this creates —
-- particularly for the diaspora and for languages spoken across borders.

-- ---------------------------------------------------------------------------
-- Languages: origin country
-- ---------------------------------------------------------------------------

-- Backfilled to 'KE' because the only seeded language is the Gikuyu pilot.
-- Adding NOT NULL in one step would fail on existing rows.
ALTER TABLE languages ADD COLUMN country_code VARCHAR(2);
UPDATE languages SET country_code = 'KE' WHERE country_code IS NULL;
ALTER TABLE languages ALTER COLUMN country_code SET NOT NULL;

ALTER TABLE languages
  ADD CONSTRAINT languages_country_code_format
  CHECK (country_code ~ '^[A-Z]{2}$');

COMMENT ON COLUMN languages.country_code IS
  'ISO 3166-1 alpha-2 of the PRIMARY country of origin. Many African languages '
  'are spoken across borders (Swahili: KE/TZ/UG/CD; Hausa: NG/NE/GH/CM; '
  'Somali: SO/ET/KE/DJ). This column records the primary association only — '
  'see also_spoken_in for the full set. See ADR-0009.';

-- A single country column cannot represent a cross-border language, and most
-- African languages are cross-border. Without this the schema would assert
-- falsehoods such as "Swahili belongs to Kenya".
ALTER TABLE languages ADD COLUMN also_spoken_in VARCHAR(2)[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN languages.also_spoken_in IS
  'Additional ISO 3166-1 alpha-2 codes where this language is natively spoken. '
  'Empty for genuinely single-country languages.';

-- ---------------------------------------------------------------------------
-- Dialects: country + community region
-- ---------------------------------------------------------------------------

ALTER TABLE dialects ADD COLUMN country_code VARCHAR(2);
ALTER TABLE dialects ADD COLUMN community_region VARCHAR(100);

UPDATE dialects SET country_code = 'KE' WHERE country_code IS NULL;
UPDATE dialects
  SET community_region = COALESCE(region, 'Unspecified')
  WHERE community_region IS NULL;

ALTER TABLE dialects ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE dialects ALTER COLUMN community_region SET NOT NULL;

ALTER TABLE dialects
  ADD CONSTRAINT dialects_country_code_format
  CHECK (country_code ~ '^[A-Z]{2}$');

-- Guarantees dialect identifiers are strictly scoped to their native country.
-- `id` is already the primary key, so this is additionally an assertion that a
-- given dialect id can never be re-pointed at a different country.
ALTER TABLE dialects
  ADD CONSTRAINT dialects_country_id_unique UNIQUE (country_code, id);

CREATE INDEX idx_dialects_country ON dialects(country_code);
CREATE INDEX idx_dialects_country_region ON dialects(country_code, community_region);

COMMENT ON COLUMN dialects.community_region IS
  'Specific speech community, e.g. "Eldoret, Rift Valley" or "Nyeri, Central". '
  'Finer-grained than country: two varieties in one country may differ in tone '
  'and lexicon, which is the ambiguity this locking exists to prevent.';

-- ---------------------------------------------------------------------------
-- Users: home country and verified dialects
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN home_country_code VARCHAR(2);
UPDATE users SET home_country_code = 'KE' WHERE home_country_code IS NULL;
ALTER TABLE users ALTER COLUMN home_country_code SET NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_home_country_code_format
  CHECK (home_country_code ~ '^[A-Z]{2}$');

-- Dialect ids this user is verified to contribute to. Competence-based rather
-- than passport-based: this is the mechanism that can admit a diaspora speaker
-- who genuinely speaks the variety. See ADR-0009.
ALTER TABLE users ADD COLUMN verified_dialects VARCHAR(32)[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_users_home_country ON users(home_country_code);

COMMENT ON COLUMN users.verified_dialects IS
  'Dialect ids this contributor has been verified to contribute to. Verification '
  'is granted by a designated linguistic authority, not self-asserted.';

-- ---------------------------------------------------------------------------
-- Audio contributions
-- ---------------------------------------------------------------------------

CREATE TABLE audio_contributions (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    contributor_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dialect_id     VARCHAR(32)  NOT NULL REFERENCES dialects(id) ON DELETE CASCADE,
    vocab_item_id  VARCHAR(128) REFERENCES vocabulary_items(id) ON DELETE SET NULL,

    prompt_text    TEXT         NOT NULL,
    audio_path     TEXT         NOT NULL,
    duration_ms    INTEGER,
    snr_db         DOUBLE PRECISION,

    -- Denormalised from the dialect AT SUBMISSION TIME. Deliberate: if a
    -- dialect's country were ever corrected, historical submissions must retain
    -- the geography under which they were accepted, or the audit trail lies.
    country_code   VARCHAR(2)   NOT NULL,

    -- pending | approved | rejected | withdrawn
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending',

    -- Contributors may withdraw at any time (governance §5).
    withdrawn_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT audio_contributions_status_valid
      CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT audio_contributions_country_format
      CHECK (country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX idx_contributions_dialect ON audio_contributions(dialect_id, status);
CREATE INDEX idx_contributions_contributor ON audio_contributions(contributor_id);
CREATE INDEX idx_contributions_country ON audio_contributions(country_code);

-- ---------------------------------------------------------------------------
-- Peer validation votes
-- ---------------------------------------------------------------------------

CREATE TABLE contribution_votes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contribution_id UUID        NOT NULL REFERENCES audio_contributions(id) ON DELETE CASCADE,
    reviewer_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- approve | reject | wrong_dialect
    vote            VARCHAR(16) NOT NULL,
    reason          VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT contribution_votes_vote_valid
      CHECK (vote IN ('approve', 'reject', 'wrong_dialect')),
    -- FR-106: one vote per reviewer per submission.
    CONSTRAINT contribution_votes_unique UNIQUE (contribution_id, reviewer_id)
);

CREATE INDEX idx_votes_contribution ON contribution_votes(contribution_id);

-- Note: "a contributor cannot validate their own submission" (FR-106) spans two
-- tables and so cannot be a CHECK constraint. It is enforced in the API and
-- covered by test.
