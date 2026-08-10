# ADR-0001: expo-sqlite + Drizzle over WatermelonDB

**Status:** Accepted
**Date:** 2026-08-10
**Requirements:** FR-021, FR-090, FR-096, NFR-020, NFR-021

## Context

The mobile client needs a durable local database for FSRS card state, the review outbox,
installed bundles, and settings. It must survive force-close and battery death without
corruption (NFR-020, NFR-021) and support atomic multi-table transactions (see
[08-SYNC-PROTOCOL.md §5.2](../08-SYNC-PROTOCOL.md)).

WatermelonDB is the conventional recommendation for offline-first React Native, and was
proposed in the original project blueprint. It is a mature library with lazy loading and
a built-in synchronisation primitive.

The complicating factor: **WatermelonDB's sync primitive assumes a particular protocol
shape** — pull changed records, push changed records, resolve conflicts on collision.
Our synchronisation design is deliberately different. Progress is an append-only event
log replayed deterministically on the server (ADR-0003), and content is immutable
pull-only bundles.

## Decision

Use **expo-sqlite** as the storage engine with **Drizzle ORM** as the query layer.
Implement the outbox and sync logic ourselves.

## Consequences

### Positive

- **Schema definitions are shared with the server.** Drizzle targets both Postgres and
  SQLite from one schema language, so `packages/schema` serves the API and the device.
  Table types cannot drift between them.
- **We control the sync logic**, which we are writing regardless. Using WatermelonDB
  would mean fighting its model to implement our own.
- Direct SQL access when needed, without escaping an abstraction.
- Smaller dependency surface; expo-sqlite is maintained as part of the Expo SDK we
  already depend on.
- SQLite WAL mode gives durability and crash safety directly.

### Negative

- **We write the outbox, retry, and batching logic ourselves** — perhaps 300–500 lines
  that WatermelonDB would have provided. Accepted, because the logic it provides is not
  the logic we need.
- No lazy-loading observables; we manage query performance manually. Not a concern at
  our data volumes (thousands of cards, not millions).
- Less community precedent for this combination in React Native.

### Neutral

- Migration to another SQLite wrapper later is feasible; the storage engine is the same.

## Alternatives considered

**WatermelonDB** — Rejected. Its principal value is the sync primitive, which conflicts
with ADR-0003. Adopting it for storage alone means carrying a large dependency for
features we would disable.

**Realm** — Rejected. Heavier, its own storage engine rather than SQLite, and its sync
offering is a paid service (violates the zero-cost constraint, C-001).

**AsyncStorage / MMKV** — Rejected. Key-value stores with no transactional guarantees
across multiple logical tables. The outbox invariant in
[08-SYNC-PROTOCOL.md §5.2](../08-SYNC-PROTOCOL.md) requires atomic multi-table writes;
without them, a crash between the card update and the outbox insert loses or duplicates
a review.

**op-sqlite** — Considered seriously. Faster than expo-sqlite via JSI. Rejected for now
because it adds a native dependency outside the Expo managed workflow, complicating local
builds. **Revisit if profiling shows SQLite is a bottleneck** — the Drizzle layer makes
the swap cheap.
