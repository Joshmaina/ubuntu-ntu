# Documentation Index

Start with the document that matches who you are.

---

## I want to understand what this is

| Read | Why |
|---|---|
| **[03 · Plain-Language Guide](03-ECOSYSTEM-OVERVIEW.md)** | The whole system explained without jargon. **Best starting point for anyone.** |
| [01 · Vision](01-VISION.md) | The problem, the audience, the intended impact, and what we are deliberately not building |
| [11 · Glossary](11-GLOSSARY.md) | Every term, across linguistics, learning science, and engineering |

## I represent an organisation, university, or funder

| Read | Why |
|---|---|
| **[02 · Concept Note](02-CONCEPT-NOTE.md)** | Problem, solution, beneficiaries, outcomes, risks, phasing, sustainability |
| [09 · Data Governance](09-DATA-GOVERNANCE.md) | Community ownership, consent, ethics, licensing position |
| [01 · Vision](01-VISION.md) | Longer-form context |

## I am going to write code

| Read | Why |
|---|---|
| [05 · Architecture](05-ARCHITECTURE.md) | System design; start with §2, the three decisions that shape everything |
| [06 · Technical Roadmap](06-TECHNICAL-ROADMAP.md) | Milestones, gates, conventions, local setup |
| [04 · Requirements](04-SRS.md) | Numbered requirements; cite these IDs in commits and tests |
| [07 · Content Model](07-CONTENT-MODEL.md) | Lesson file format and validation rules |
| [08 · Sync Protocol](08-SYNC-PROTOCOL.md) | Offline synchronisation — read before touching sync |
| [10 · Dependencies](10-DEPENDENCIES.md) | What we use, what it costs, what replaces it |
| [adr/](adr/) | Why decisions were made |

## I speak an African language and want to help

| Read | Why |
|---|---|
| **[03 · Plain-Language Guide](03-ECOSYSTEM-OVERVIEW.md)** | What the project is and how contribution works |
| [09 · Data Governance](09-DATA-GOVERNANCE.md) | Your rights over what you contribute |
| [CONTRIBUTING](../CONTRIBUTING.md) | How to take part |

---

## Full index

| # | Document | Audience |
|---|---|---|
| 01 | [Vision](01-VISION.md) | Everyone |
| 02 | [Concept Note](02-CONCEPT-NOTE.md) | Funders, institutions, partners |
| 03 | [Ecosystem Overview](03-ECOSYSTEM-OVERVIEW.md) | Everyone — non-technical |
| 04 | [Software Requirements](04-SRS.md) | Developers |
| 05 | [Architecture](05-ARCHITECTURE.md) | Developers |
| 06 | [Technical Roadmap](06-TECHNICAL-ROADMAP.md) | Developers |
| 07 | [Content Model](07-CONTENT-MODEL.md) | Developers, linguists |
| 08 | [Sync Protocol](08-SYNC-PROTOCOL.md) | Developers |
| 09 | [Data Governance](09-DATA-GOVERNANCE.md) | Everyone |
| 10 | [Dependency Ledger](10-DEPENDENCIES.md) | Developers |
| 11 | [Glossary](11-GLOSSARY.md) | Everyone |
| — | [Decision Records](adr/) | Developers |

---

## Reading conventions

**Document status.** Every document opens with a status line. Everything is currently
`Draft v0.1` — reviewed by nobody but the author. Treat accordingly.

**Requirement IDs.** `FR-042`, `NFR-004`. Stable and never reused. Cited in commits and
tests so any behaviour is traceable to a requirement.

**Flagged gaps.** Where something is unverified, unresolved, or needs external review, it
is marked in the text rather than smoothed over. Notably:

- Statistics needing citation before external publication ([01 §8](01-VISION.md), [02 §1](02-CONCEPT-NOTE.md))
- [09 · Data Governance](09-DATA-GOVERNANCE.md) has not had legal review
- [ADR-0006](adr/0006-fsrs-formula.md) is **Proposed** and blocks milestone M1

Visible gaps are preferable to invisible errors.

**Precedence.** Where documents conflict: [01 · Vision](01-VISION.md) sets direction;
[09 · Data Governance](09-DATA-GOVERNANCE.md) overrides product goals;
[04 · SRS](04-SRS.md) governs behaviour; ADRs govern technical decisions within it.
