# ADR-0003: Event-sourced progress synchronisation

**Status:** Accepted
**Date:** 2026-08-10
**Requirements:** FR-083, FR-090 – FR-096
**Related:** ADR-0002 (this decision depends on it)

## Context

Users review vocabulary offline, potentially on multiple devices, and reconnect at
unpredictable times. The system must guarantee that **no review is lost** and that all
devices converge on identical state (FR-093).

The conventional approach is to synchronise *state*: each device sends its current card
state, and the server resolves collisions — typically last-write-wins on a timestamp.

This is silently destructive for spaced repetition. Consider:

```
Device A (offline):  reviews card X at 10:00, rating Good
Device B (offline):  reviews card X at 10:05, rating Again
Both sync at 11:00
```

Last-write-wins keeps B's state and discards A's review entirely. The user's memory model
for that card is now wrong. **No error is raised. Nobody notices.** The damage
accumulates across cards and compounds over months, and it is not reproducible after the
fact.

We considered whether this matters enough to justify a more complex design. It does: the
scheduling engine is the product's core value, and a corruption mode that is invisible,
cumulative, and unreproducible is the hardest possible class of defect to recover from
later.

## Decision

**Synchronise an append-only event log. Derive state by deterministic replay.**

Three rules:

1. The client never sends state — only immutable **review events**.
2. The server never trusts computed state — it **replays** events to derive state.
3. Both replay through the identical `packages/core` module (ADR-0002).

Each event carries a client-generated UUIDv7 that serves as an idempotency key. The
server sorts by `reviewedAt` (with `eventId` as deterministic tiebreaker) and replays.

Full protocol: [08-SYNC-PROTOCOL.md](../08-SYNC-PROTOCOL.md).

## Consequences

### Positive

- **No review can be lost.** Every review is a distinct event; there is no operation that
  overwrites another.
- **Conflict resolution disappears entirely** — not "is handled," but does not exist as a
  problem. Events commute because replay is deterministic and ordering is carried in the
  data rather than in arrival sequence.
- **Idempotency makes retry logic trivial.** Resubmitting a batch is harmless, so the
  client can retry naively and still be correct.
- **Full audit trail.** Every review is preserved, enabling analytics, per-user FSRS
  parameter optimisation (FR-086), and post-hoc debugging of any scheduling complaint.
- **Server-side recomputation is always available.** If we fix an FSRS bug, we replay and
  every user's state becomes correct — no migration, no data loss.

That last property is worth emphasising: it means an algorithm bug is recoverable rather
than permanent.

### Negative

- **Storage grows unbounded.** Every review is retained forever. At ~100 bytes per event
  and a heavy user reviewing 200 items daily, this is roughly 7 MB per user per year —
  acceptable, and compressible. Snapshot-and-compact is designed but deliberately not
  implemented until measurement demands it.
- **Replay cost grows with history.** Recomputing a card with 500 reviews means 500 FSRS
  iterations. Mitigated by snapshotting when it becomes measurable — not before.
- Slightly more moving parts than naive state sync: an outbox table, an ack protocol,
  replay logic.

### Neutral

- The client still maintains local card state for immediate display. That state is a
  cache of local replay, not a source of truth.

## Alternatives considered

**State sync with last-write-wins** — Rejected. The failure mode described in Context is
disqualifying.

**State sync with vector clocks** — Rejected. Detects conflicts but does not tell us how
to *merge* two divergent FSRS states, which is not a well-defined operation. It converts
a silent failure into a visible one with no correct resolution.

**CRDTs** — Rejected. Would work, but is substantially more complex than needed. Our
events are naturally commutative under deterministic replay; a CRDT would add machinery
to solve a problem the domain has already solved for us.

**Server-authoritative scheduling** — Rejected. Violates offline operation (FR-081).

**Operational transformation** — Rejected. Designed for concurrent editing of shared
mutable documents. Wrong problem shape.
