-- 0006_bundle_payload.sql
--
-- Store the serialised bundle payload alongside its metadata.
--
-- The `bundles` table recorded a sha256 and a size but nothing that could
-- actually be downloaded, so GET /v1/bundles/manifest described content that
-- did not exist anywhere. This closes the content-delivery half of the walking
-- skeleton.
--
-- DELIBERATELY IN POSTGRES FOR NOW. Bundles belong in object storage (MinIO
-- locally, R2 in production) behind StoragePort, and they will move there once
-- audio exists and payloads stop being small JSON. Keeping them in the database
-- today means the whole build -> serve -> verify -> install path is testable
-- with no storage dependency, which is worth more than premature correctness
-- about where bytes live.
--
-- `payload` is TEXT rather than JSONB on purpose: the client verifies a hash
-- over the EXACT bytes that were hashed at build time. JSONB normalises
-- whitespace and key order, which would change the hash and turn every valid
-- bundle into a spurious integrity failure.

ALTER TABLE bundles ADD COLUMN payload TEXT;
ALTER TABLE bundles ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bundles ADD COLUMN country_code VARCHAR(2);
ALTER TABLE bundles ADD COLUMN community_region VARCHAR(100);

COMMENT ON COLUMN bundles.payload IS
  'Exact serialised bundle text whose sha256 is recorded in this row. TEXT, not '
  'JSONB: JSONB would normalise key order and whitespace, changing the hash.';
