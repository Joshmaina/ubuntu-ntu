/**
 * Review-event ingestion and deterministic replay.
 *
 * This is ADR-0003 made executable, and the two rules are absolute:
 *
 *   1. Ingestion is IDEMPOTENT on the client-generated event id.
 *      Re-submitting a batch is a no-op, which is what lets the client retry
 *      naively and still be correct.
 *
 *   2. Card state is DERIVED by replaying the event log through
 *      @ubuntu-ntu/core — never accepted from the client. The client cannot
 *      corrupt progress by being buggy, tampered with, or out of date.
 *
 * Together these give conflict-free multi-device sync with no merge logic:
 * events commute because replay is deterministic and ordering lives in the
 * data (reviewedAt, then event id as tiebreaker).
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { emptyCard, review, type Card, type Rating } from '@ubuntu-ntu/core';
import type { Env } from '@ubuntu-ntu/config';
import { tables, type Db } from '../db.js';

/**
 * `| undefined` is explicit on the optional fields because the project runs
 * with `exactOptionalPropertyTypes`, and Zod's inferred output permits an
 * explicitly-undefined property. Omitting it makes the route handler's parsed
 * body structurally incompatible with this type.
 */
export interface IncomingEvent {
  eventId: string;
  vocabItemId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: string;
  durationMs?: number | undefined;
  clientId?: string | undefined;
}

export interface IngestResult {
  accepted: string[];
  duplicate: string[];
  rejected: { eventId: string; reason: string }[];
  serverTime: string;
}

/**
 * Ingest a batch.
 *
 * `now` is passed in rather than read from the clock so the whole path stays
 * deterministic and testable — the same discipline core is held to.
 */
export async function ingestEvents(
  db: Db,
  userId: string,
  events: readonly IncomingEvent[],
  env: Env,
  now: number,
): Promise<IngestResult> {
  const accepted: string[] = [];
  const duplicate: string[] = [];
  const rejected: { eventId: string; reason: string }[] = [];
  const touched = new Set<string>();

  // Only accept events for vocabulary that exists. A reference to an unknown
  // item would otherwise violate the foreign key and abort the whole batch,
  // punishing 499 good events for one bad one.
  const referenced = [...new Set(events.map((e) => e.vocabItemId))];
  const known = new Set(
    referenced.length === 0
      ? []
      : (
          await db
            .select({ id: tables.vocabularyItems.id })
            .from(tables.vocabularyItems)
            .where(inArray(tables.vocabularyItems.id, referenced))
        ).map((r) => r.id),
  );

  for (const event of events) {
    const reviewedAt = new Date(event.reviewedAt);

    if (Number.isNaN(reviewedAt.getTime())) {
      rejected.push({ eventId: event.eventId, reason: 'invalid_timestamp' });
      continue;
    }

    // Device clocks are unreliable. A far-future timestamp would poison the
    // schedule permanently, so it is bounced for the client to re-stamp.
    // Backdated events are accepted — an offline device legitimately has them.
    if (reviewedAt.getTime() - now > env.MAX_CLOCK_SKEW_MS) {
      rejected.push({ eventId: event.eventId, reason: 'clock_skew_exceeded' });
      continue;
    }

    if (!known.has(event.vocabItemId)) {
      rejected.push({ eventId: event.eventId, reason: 'unknown_vocab_item' });
      continue;
    }

    // Idempotency is a DATABASE guarantee (primary key on id), not an
    // application concern. `returning` tells us whether the row was new.
    const inserted = await db
      .insert(tables.fsrsReviewLogs)
      .values({
        id: event.eventId,
        userId,
        vocabItemId: event.vocabItemId,
        rating: event.rating,
        state: 0, // informational; replay recomputes authoritative state
        reviewedAt,
        durationMs: event.durationMs ?? 0,
        clientId: event.clientId ?? null,
      })
      .onConflictDoNothing({ target: tables.fsrsReviewLogs.id })
      .returning({ id: tables.fsrsReviewLogs.id });

    if (inserted.length > 0) {
      accepted.push(event.eventId);
      touched.add(event.vocabItemId);
    } else {
      // Already had it — as good as accepting. The client purges either way.
      duplicate.push(event.eventId);
    }
  }

  for (const vocabItemId of touched) {
    await recomputeCard(db, userId, vocabItemId);
  }

  return { accepted, duplicate, rejected, serverTime: new Date(now).toISOString() };
}

/**
 * Derive authoritative card state by replaying every event for this card.
 *
 * Ordering is by reviewedAt, then event id — a deterministic tiebreaker for
 * identical timestamps, so two servers replaying the same log always agree.
 *
 * Deferred optimisation: snapshot every N events and replay from there. Not
 * implemented until measurement demands it, because this is the one function
 * that must be obviously correct.
 */
export async function recomputeCard(db: Db, userId: string, vocabItemId: string): Promise<Card> {
  const events = await db
    .select({
      rating: tables.fsrsReviewLogs.rating,
      reviewedAt: tables.fsrsReviewLogs.reviewedAt,
    })
    .from(tables.fsrsReviewLogs)
    .where(
      and(
        eq(tables.fsrsReviewLogs.userId, userId),
        eq(tables.fsrsReviewLogs.vocabItemId, vocabItemId),
      ),
    )
    .orderBy(asc(tables.fsrsReviewLogs.reviewedAt), asc(tables.fsrsReviewLogs.id));

  let card = emptyCard();
  for (const event of events) {
    card = review(card, event.rating as Rating, event.reviewedAt.getTime()).card;
  }

  await db
    .insert(tables.userFsrsCards)
    .values({
      userId,
      vocabItemId,
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: card.lastReview === null ? null : new Date(card.lastReview),
      due: card.due === null ? null : new Date(card.due),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tables.userFsrsCards.userId, tables.userFsrsCards.vocabItemId],
      set: {
        state: card.state,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        reps: card.reps,
        lapses: card.lapses,
        lastReview: card.lastReview === null ? null : new Date(card.lastReview),
        due: card.due === null ? null : new Date(card.due),
        updatedAt: new Date(),
      },
    });

  return card;
}
