# ADR-0002: A single shared learning core

**Status:** Accepted
**Date:** 2026-08-10
**Requirements:** FR-081, FR-082, FR-092, NFR-060, NFR-061, NFR-062

## Context

FSRS scheduling must run on the device, because the due queue has to be computable with
no network (FR-081). It must *also* run on the server, because the server derives
authoritative card state by replaying the event log (FR-092, ADR-0003).

That means the same algorithm executes in two runtimes.

If the two implementations diverge in any respect — a rounding difference, a mishandled
edge case, a parameter typo — the phone and the server compute different schedules for
the same review history. The resulting corruption is:

- **Silent.** No error is raised; both sides believe they are correct.
- **Cumulative.** Each subsequent review compounds the divergence.
- **Unreproducible.** It depends on a specific user's full review history.
- **Damaging to the product's core value.** Scheduling accuracy *is* the learning engine.

This is among the worst classes of bug available to us, and the conventional mitigation —
"keep the two implementations in sync carefully" — is a process control against a
structural problem. Process controls degrade.

## Decision

**One implementation, in `packages/core`, imported by both client and server.**

`packages/core` is subject to hard constraints, enforced in CI:

1. **Zero runtime dependencies.** Nothing in `package.json` dependencies.
2. **No imports of any kind** — no Node built-ins, no `crypto`, no platform APIs.
3. **No I/O.** No file, network, or storage access.
4. **No implicit clock reads.** Every time-dependent function takes `now` as an explicit
   parameter (NFR-062).
5. **No randomness.** Any needed entropy is passed in.
6. **100% line and branch coverage**, enforced by threshold, not merely reported
   (NFR-061).

Contents: FSRS scheduling, tone comparison mathematics, gloss parsing and alignment,
shared validation predicates.

## Consequences

### Positive

- **Client/server divergence becomes structurally impossible.** There is no second
  implementation that could drift. This is the entire point.
- Purity makes the module exhaustively testable: same inputs, same outputs, always.
- Explicit `now` parameters make time-travel testing trivial — future due queues,
  long-interval behaviour, and timezone edge cases are all directly testable (FR-085).
- Determinism is what makes event replay (ADR-0003) sound.
- The module compiles for any JavaScript runtime without adaptation.

### Negative

- Constraint 4 is mildly awkward ergonomically: every call site must supply `now`.
  Accepted — the testability gain substantially exceeds the inconvenience.
- 100% coverage on a module containing genuine mathematics requires real effort. Also
  accepted: this is precisely the module where that effort pays.
- Anything needing I/O must live outside core, which occasionally forces a slightly
  awkward split between pure computation and its impure caller.

### Neutral

- Core will be small — likely under 1,500 lines. Its importance is disproportionate to
  its size.

## Alternatives considered

**Separate implementations, kept in sync by discipline** — Rejected. This is the default
and it is the failure mode described above. Two implementations *will* diverge; the only
question is when it is noticed.

**Server-authoritative scheduling only** — Rejected. Violates the offline requirement
(FR-081) outright, which is non-negotiable for the target users.

**Client-authoritative, server stores blindly** — Rejected. The server cannot then
validate anything, a buggy client version corrupts progress permanently, and there is no
recovery path.

**A published npm package consumed by both** — Rejected for now. Adds release friction
with no benefit while both consumers live in one repository. Reconsider if the core is
ever useful to external projects, which would be a good problem to have.
