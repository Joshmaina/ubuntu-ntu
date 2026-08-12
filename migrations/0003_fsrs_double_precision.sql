-- 0003_fsrs_double_precision.sql
--
-- Fixes a silent precision loss found by the offline round-trip test.
--
-- REAL in PostgreSQL is float4 — single precision, roughly 7 significant
-- decimal digits. JavaScript numbers are IEEE-754 doubles (float8). Every FSRS
-- value written by the server was therefore being truncated on the way in:
--
--   client computed : 44.050762910497404
--   server stored   : 44.050762
--
-- The scheduling impact of that particular difference is negligible (~0.08 ms),
-- so this is not urgent in itself. What matters is the CLASS of defect: the
-- client and server were no longer bit-identical, which quietly undermines the
-- guarantee ADR-0002 exists to provide. A test asserting they agree would have
-- to be weakened to accommodate it, and a weakened equality test is exactly how
-- a real divergence later goes unnoticed.
--
-- float8 matches the JavaScript number type exactly, so equality is restorable.

ALTER TABLE user_fsrs_cards
  ALTER COLUMN stability    TYPE DOUBLE PRECISION,
  ALTER COLUMN difficulty   TYPE DOUBLE PRECISION,
  ALTER COLUMN elapsed_days TYPE DOUBLE PRECISION;

ALTER TABLE fsrs_review_logs
  ALTER COLUMN elapsed_days TYPE DOUBLE PRECISION;

COMMENT ON COLUMN user_fsrs_cards.stability IS
  'Memory stability in days. DOUBLE PRECISION (float8) to match the JavaScript '
  'number type exactly — float4 truncates and breaks client/server equality.';
