# Architecture Decision Records

An ADR records **one significant decision**: the context, the choice, and its
consequences. The purpose is that in a year we can recover *why* something is the way it
is, rather than only *what* it is — and so a decision is not silently relitigated by
someone who has forgotten the constraint that produced it.

## When to write one

Write an ADR when a decision is **expensive to reverse**: data models, sync protocols,
framework choices, anything that shapes code we have not written yet.

Do not write one for reversible choices — a lint rule, a file layout, a naming
convention. Those belong in code review.

## Status values

| Status | Meaning |
|---|---|
| **Proposed** | Under discussion |
| **Accepted** | In force |
| **Superseded** | Replaced — links to its replacement |
| **Deprecated** | No longer applies, nothing replaced it |

An accepted ADR is **never edited to change its decision**. It is superseded by a new
one. The record of what we believed, and when, is the point.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-device-database.md) | expo-sqlite + Drizzle over WatermelonDB | Accepted |
| [0002](0002-shared-learning-core.md) | A single shared learning core | Accepted |
| [0003](0003-event-sourced-sync.md) | Event-sourced progress synchronisation | Accepted |
| [0004](0004-content-as-code.md) | Content as version-controlled text | Accepted |
| [0005](0005-defer-realtime-pitch.md) | Defer real-time pitch streaming | Accepted |
| [0006](0006-fsrs-formula.md) | Canonical FSRS-4.5 retrievability formula | Accepted — default, reversible |
| [0007](0007-web-platform.md) | Web as a first-class learner surface | Accepted |

## Template

```markdown
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Superseded by ADR-XXXX
**Date:** YYYY-MM-DD
**Requirements:** FR-xxx, NFR-xxx

## Context
The situation and the forces at play. What makes this decision necessary?

## Decision
What we are doing. Stated plainly and unambiguously.

## Consequences
### Positive
### Negative
### Neutral

## Alternatives considered
What else, and why not.
```
