# Synchronisation Protocol

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers.
> **Criticality:** Highest. A sync protocol cannot be retrofitted — changing it later is
> a rewrite. This document is written before the code exists, deliberately.

---

## 1. The problem

A user reviews vocabulary on a phone in aeroplane mode. Later they review on a tablet,
also offline. Both eventually reconnect.

**Neither review may be lost, and both devices must converge to identical state.**

The naive approach — sync card state, resolve conflicts by last-write-wins — is silently
destructive. One review disappears. No error surfaces. The user's memory model quietly
degrades and neither they nor we can detect it. For a spaced-repetition system, this is
the worst possible failure: invisible, cumulative, and unreproducible.

---

## 2. The solution: event sourcing with deterministic replay

Three rules:

1. **The client never sends state. It sends events.**
2. **The server never trusts computed state. It replays events.**
3. **Both replay through the identical `packages/core` module.**

Because FSRS replay is deterministic and events carry their own timestamps, order of
*arrival* is irrelevant. Only order of *occurrence* matters, and that is carried in the
data. Events therefore commute, which eliminates conflict resolution entirely — there is
nothing to resolve.

```text
Device A (offline)          Device B (offline)
  ev1 @ 10:00                 ev3 @ 10:05
  ev2 @ 10:02                 ev4 @ 10:07
        │                           │
        └─────────► SERVER ◄────────┘
                       │
          sort by reviewedAt:
          ev1, ev2, ev3, ev4
                       │
          replay through core FSRS
                       │
              authoritative state
```

---

## 3. Data classes

Different data, different protocols. Conflating them is a common and expensive mistake.

| Class | Direction | Protocol | Conflicts |
|---|---|---|---|
| **Content** | Server → client | Versioned immutable bundles | Impossible — content is read-only on the client |
| **Progress** | Client → server | Append-only event log | Impossible — events commute |
| **Profile** | Bidirectional | Last-write-wins, server timestamp | Possible, and acceptable — a stale display name is harmless |
| **Contributions** | Bidirectional | Server-authoritative state machine | Server always wins |

Note that two of the four are conflict-free *by construction* rather than by careful
handling. That is the design goal.

---

## 4. Review events

### 4.1 Shape

```typescript
interface ReviewEvent {
  eventId:    string;   // UUIDv7, client-generated — the idempotency key
  userId:     string;
  cardId:     string;   // vocabulary item ID
  rating:     1 | 2 | 3 | 4;
  reviewedAt: string;   // ISO 8601 UTC, device clock
  durationMs: number;
  clientId:   string;   // installation ID, for diagnostics
  schemaVersion: number;
}
```

**UUIDv7 is chosen deliberately** — it is time-ordered, so events sort naturally by
identifier as a tiebreaker, and index locality on the server is good.

### 4.2 Immutability

Events are never modified or deleted after creation. A mistaken review is corrected by a
*subsequent* review event, never by editing history. This keeps replay stable and audit
trivial.

---

## 5. Client outbox

### 5.1 Table

```sql
CREATE TABLE review_outbox (
  event_id      TEXT PRIMARY KEY,
  payload       TEXT NOT NULL,       -- serialised ReviewEvent
  created_at    INTEGER NOT NULL,
  attempts      INTEGER DEFAULT 0,
  last_attempt  INTEGER,
  acked         INTEGER DEFAULT 0
);
```

### 5.2 The critical invariant

> **An event is written to `review_outbox` in the SAME database transaction that
> updates the card's FSRS state.**

If these are separate transactions, a crash between them either loses a review or double
applies one. Atomicity here is the single most important correctness property in the
client.

```typescript
await db.transaction(async (tx) => {
  await tx.update(cards).set(nextState).where(eq(cards.id, cardId));
  await tx.insert(reviewOutbox).values({ eventId, payload });
});
```

### 5.3 Lifecycle

```text
created ──► pending ──► in-flight ──► acked ──► purged (after 7 days)
                │            │
                └──── retry ─┘
```

An event is deleted **only** after the server acknowledges its `eventId`. Retention for
seven days post-ack allows diagnosis of sync anomalies.

### 5.4 Retry policy

Exponential backoff with jitter: 1s, 2s, 4s … capped at 5 minutes. Jitter prevents a
thundering herd when a whole region regains connectivity simultaneously — a realistic
scenario in the target market.

Retries never surface to the user. Sync failure is not an error state (FR-094).

---

## 6. Ingestion endpoint

### 6.1 Request

```http
POST /v1/events
Authorization: Bearer <access-token>
Content-Type: application/json

{ "events": [ /* ≤ 500 ReviewEvents */ ] }
```

### 6.2 Response

```json
{
  "accepted":  ["0192f3a1-...", "0192f3a2-..."],
  "duplicate": ["0192f39f-..."],
  "rejected":  [{ "eventId": "0192f3a3-...", "reason": "clock_skew_exceeded" }],
  "serverTime": "2026-08-10T14:30:00.000Z"
}
```

The client purges events in **both** `accepted` and `duplicate` — a duplicate means the
server already has it, which is exactly as good as accepting it.

### 6.3 Idempotency

```sql
INSERT INTO review_events (event_id, user_id, card_id, rating, reviewed_at, ...)
VALUES (...)
ON CONFLICT (event_id) DO NOTHING;
```

The primary key on `event_id` makes idempotency a database guarantee rather than an
application concern. Resubmitting the identical batch a hundred times produces identical
state.

**This is tested explicitly** (FR-091, gate at M3) — not assumed.

---

## 7. Server-side replay

```typescript
// Pseudocode — authoritative state is DERIVED, never accepted from the client.
async function recomputeCard(userId: string, cardId: string) {
  const events = await db
    .select().from(reviewEvents)
    .where(and(eq(reviewEvents.userId, userId), eq(reviewEvents.cardId, cardId)))
    .orderBy(asc(reviewEvents.reviewedAt), asc(reviewEvents.eventId));

  let card = emptyCard();
  for (const e of events) {
    card = fsrs.review(card, e.rating, e.reviewedAt);   // ← packages/core
  }
  await upsertCardState(userId, cardId, card);
}
```

Ordering is by `reviewedAt`, then `eventId` as a deterministic tiebreaker for identical
timestamps.

**Optimisation, deferred:** replaying full history per card becomes costly at scale.
Snapshot every N events and replay only from the snapshot. Not implemented until
measurement shows it is needed — premature optimisation here would complicate the one
part of the system that must be obviously correct.

---

## 8. Clock skew

Device clocks are unreliable. Users change them; some devices drift badly.

| Situation | Handling |
|---|---|
| Event timestamp in the future beyond 24h | Reject with `clock_skew_exceeded`; client re-stamps against `serverTime` and retries |
| Small forward skew (< 24h) | Accept — FSRS is robust to minor perturbation |
| Backdated events | Accept — offline devices legitimately submit old events |
| Device clock changed mid-session | Detected via monotonic clock divergence; events flagged for review |

The client records both wall-clock and monotonic elapsed time, permitting detection of
mid-session clock changes without relying on the wall clock it is trying to validate.

---

## 9. Content sync

Entirely separate mechanism, and much simpler because content is immutable.

```http
GET /v1/bundles/manifest?dialect=yo-oyo&since=a3f9c2
```

```json
{
  "dialect": "yo-oyo",
  "bundles": [
    {
      "id": "bundle-yo-oyo-b7e1d4",
      "version": 13,
      "sizeBytes": 4718592,
      "sha256": "b7e1d4...",
      "lessons": ["yo.market.l1", "yo.market.l2"],
      "url": "/v1/bundles/bundle-yo-oyo-b7e1d4"
    }
  ]
}
```

Rules:

- Bundles are **content-addressed** — the ID is derived from the content hash
- A given bundle ID is byte-identical forever, so caching is trivially safe
- SHA-256 verified after download; mismatch discards and retries
- Downloads are resumable via HTTP range requests
- Metered-connection downloads require explicit user consent (FR-023)
- Rollback is instant: publish the previous manifest

---

## 10. Failure modes

| Failure | Behaviour | User impact |
|---|---|---|
| No connectivity | Events queue in outbox | **None** |
| Server down | Retry with backoff | **None** |
| Auth expired | Refresh; if that fails, queue and prompt on next open | Learning continues |
| Outbox grows large | Batches of 500; no cap on queue | None |
| App force-closed mid-sync | Unacked events retry; duplicates absorbed | None |
| Storage full | Learning blocked, clear message, offer bundle deletion | Explicit and actionable |
| Corrupt local DB | Detected on open; re-sync from server | Unsynced events lost — **the only true data-loss path** |
| Server data loss | Clients resubmit unpurged events (7-day window) | Partial recovery |

The corrupt-database row is the one genuine vulnerability. It is mitigated by SQLite's
WAL mode, atomic transactions (§5.2), and prompt syncing — not eliminated. Recording it
honestly is better than pretending otherwise.

---

## 11. Security

| Concern | Control |
|---|---|
| Event forgery | `userId` taken from the authenticated token, never from the payload body |
| Replay attack | Idempotent by design — replay is harmless |
| Batch flooding | Rate limited per user via Redis |
| Oversized payload | 500 events max per request; body size capped |
| Cross-user writes | Enforced server-side; a client-supplied `userId` is ignored entirely |

---

## 12. Testing requirements

These are mandatory, not optional. Each maps to a requirement ID.

| Test | Requirement |
|---|---|
| Identical batch submitted twice → identical state | FR-091 |
| Two simulated devices, disjoint offline events → convergence, nothing lost | FR-093 |
| Events arriving out of chronological order → correct final state | FR-092 |
| Crash between card update and outbox write → no divergence | §5.2 |
| Future-dated event → rejected, re-stamped, accepted | §8 |
| Full aeroplane-mode round trip | **M4 gate** |

---

## 13. Explicitly rejected alternatives

| Rejected | Reason |
|---|---|
| State sync with last-write-wins | Silently loses reviews — the failure this design exists to prevent |
| CRDTs | Unnecessary complexity; deterministic replay achieves the same result far more simply |
| Server-authoritative scheduling | Violates the offline requirement outright |
| Operational transformation | Designed for concurrent text editing; wrong problem shape |
| Client-computed state trusted by server | A tampered or buggy client corrupts progress permanently |
