-- 0002_vocabulary_image.sql
-- Visual learning support (ADR-0008).
--
-- Added now although the image exercise types ship at M7. Schema is never
-- gated: a nullable column costs nothing today, and retrofitting an asset class
-- into the content model and bundle format later is expensive.
--
-- Shape: { "path": "...", "alt": {"en": "...", "sw": "..."},
--          "credit": "...", "license": "..." }

ALTER TABLE vocabulary_items ADD COLUMN image JSONB;

COMMENT ON COLUMN vocabulary_items.image IS
  'Image asset for visual learning (ADR-0008). alt text is mandatory in the '
  'content contract: it serves screen readers (NFR-044) and records what the '
  'image is meant to depict, which is how a culturally wrong image gets caught '
  'in review.';
