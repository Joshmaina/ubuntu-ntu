/**
 * On-device learning store.
 *
 * The single most correctness-critical component on the client. Everything here
 * exists to guarantee one property:
 *
 *   A review is NEVER applied to card state without also being recorded in the
 *   outbox, and never recorded twice.
 *
 * If those two writes were separate transactions, a crash between them would
 * either lose the review (card updated, nothing to sync) or double-apply it
 * (outbox written, card update lost, then replayed on top). Both corruptions
 * are silent and cumulative — see docs/08-SYNC-PROTOCOL.md §5.2.
 */

import { emptyCard, review, isDue, type Card, type Rating } from '@ubuntu-ntu/core';
import type { SqliteAdapter, OutboxEvent } from './types.js';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS cards (
    vocab_item_id  TEXT PRIMARY KEY,
    state          INTEGER NOT NULL DEFAULT 0,
    stability      REAL    NOT NULL DEFAULT 0,
    difficulty     REAL    NOT NULL DEFAULT 0,
    elapsed_days   REAL    NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    reps           INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    last_review    INTEGER,
    due            INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);

  CREATE TABLE IF NOT EXISTS review_outbox (
    event_id      TEXT PRIMARY KEY,
    vocab_item_id TEXT    NOT NULL,
    rating        INTEGER NOT NULL,
    reviewed_at   INTEGER NOT NULL,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_attempt  INTEGER,
    acked         INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_outbox_pending ON review_outbox(acked, created_at);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

interface CardRow {
  vocab_item_id: string;
  state: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review: number | null;
  due: number | null;
}

function toCard(row: CardRow): Card {
  return {
    state: row.state as Card['state'],
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: row.last_review,
    due: row.due,
  };
}

export class LearningStore {
  constructor(private readonly db: SqliteAdapter) {
    this.db.exec(SCHEMA);
  }

  getCard(vocabItemId: string): Card {
    const rows = this.db.all<CardRow>('SELECT * FROM cards WHERE vocab_item_id = ?', [
      vocabItemId,
    ]);
    return rows.length === 0 ? emptyCard() : toCard(rows[0]!);
  }

  /** Cards due at `now`, most overdue first. Never-reviewed cards sort last. */
  dueCards(now: number, limit = 50): { vocabItemId: string; card: Card }[] {
    return this.db
      .all<CardRow>(
        `SELECT * FROM cards
         WHERE due IS NULL OR due <= ?
         ORDER BY COALESCE(due, 9223372036854775807) ASC
         LIMIT ?`,
        [now, limit],
      )
      .map((row) => ({ vocabItemId: row.vocab_item_id, card: toCard(row) }));
  }

  /**
   * Apply a review.
   *
   * THE critical invariant: the card update and the outbox insert happen in ONE
   * transaction. Either both land or neither does. There is no interleaving in
   * which a crash loses or duplicates a review.
   *
   * `eventId` is supplied by the caller (a UUIDv7) rather than generated here,
   * because @ubuntu-ntu/core forbids randomness and this package keeps the same
   * discipline: deterministic given its inputs.
   */
  applyReview(params: {
    eventId: string;
    vocabItemId: string;
    rating: Rating;
    reviewedAt: number;
    durationMs?: number;
  }): Card {
    const { eventId, vocabItemId, rating, reviewedAt, durationMs = 0 } = params;
    const next = review(this.getCard(vocabItemId), rating, reviewedAt).card;

    this.db.exec('BEGIN');
    try {
      this.db.run(
        `INSERT INTO cards
           (vocab_item_id, state, stability, difficulty, elapsed_days,
            scheduled_days, reps, lapses, last_review, due)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(vocab_item_id) DO UPDATE SET
           state = excluded.state,
           stability = excluded.stability,
           difficulty = excluded.difficulty,
           elapsed_days = excluded.elapsed_days,
           scheduled_days = excluded.scheduled_days,
           reps = excluded.reps,
           lapses = excluded.lapses,
           last_review = excluded.last_review,
           due = excluded.due`,
        [
          vocabItemId,
          next.state,
          next.stability,
          next.difficulty,
          next.elapsedDays,
          next.scheduledDays,
          next.reps,
          next.lapses,
          next.lastReview,
          next.due,
        ],
      );

      this.db.run(
        `INSERT INTO review_outbox
           (event_id, vocab_item_id, rating, reviewed_at, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, vocabItemId, rating, reviewedAt, durationMs, reviewedAt],
      );

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return next;
  }

  /** Events awaiting acknowledgement, oldest first. */
  pendingEvents(limit = 500): OutboxEvent[] {
    return this.db
      .all<{
        event_id: string;
        vocab_item_id: string;
        rating: number;
        reviewed_at: number;
        duration_ms: number;
        attempts: number;
      }>(
        `SELECT event_id, vocab_item_id, rating, reviewed_at, duration_ms, attempts
         FROM review_outbox WHERE acked = 0 ORDER BY created_at ASC LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        eventId: r.event_id,
        vocabItemId: r.vocab_item_id,
        rating: r.rating as 1 | 2 | 3 | 4,
        reviewedAt: r.reviewed_at,
        durationMs: r.duration_ms,
        attempts: r.attempts,
      }));
  }

  pendingCount(): number {
    // COUNT(*) always returns exactly one row, so the index access is safe.
    // A `?? 0` fallback here would be unreachable code that can never be tested.
    return this.db.all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM review_outbox WHERE acked = 0',
    )[0]!.n;
  }

  /**
   * Mark events acknowledged.
   *
   * Called for BOTH accepted and duplicate ids: a duplicate means the server
   * already has it, which is exactly as good as accepting it.
   */
  markAcknowledged(eventIds: readonly string[], now: number): void {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => '?').join(',');
    this.db.run(
      `UPDATE review_outbox SET acked = 1, last_attempt = ?
       WHERE event_id IN (${placeholders})`,
      [now, ...eventIds],
    );
  }

  recordAttempt(eventIds: readonly string[], now: number): void {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => '?').join(',');
    this.db.run(
      `UPDATE review_outbox SET attempts = attempts + 1, last_attempt = ?
       WHERE event_id IN (${placeholders})`,
      [now, ...eventIds],
    );
  }

  /**
   * Drop an event the server will never accept (unknown vocabulary, malformed).
   *
   * Retrying forever would block every event behind it — a permanently stuck
   * outbox is worse than losing one bad event.
   */
  discard(eventIds: readonly string[]): void {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => '?').join(',');
    this.db.run(`DELETE FROM review_outbox WHERE event_id IN (${placeholders})`, [...eventIds]);
  }

  /** Purge acknowledged rows older than the retention window (7 days). */
  purgeAcknowledged(now: number, retentionMs = 7 * 86_400_000): number {
    const before = this.pendingOrAckedCount();
    this.db.run('DELETE FROM review_outbox WHERE acked = 1 AND last_attempt < ?', [
      now - retentionMs,
    ]);
    return before - this.pendingOrAckedCount();
  }

  private pendingOrAckedCount(): number {
    return this.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM review_outbox')[0]!.n;
  }

  getSetting(key: string): string | null {
    return this.db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])[0]
      ?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  /** Convenience re-export so callers need not import core directly. */
  isDue(card: Card, now: number): boolean {
    return isDue(card, now);
  }
}
