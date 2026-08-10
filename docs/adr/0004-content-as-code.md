# ADR-0004: Content as version-controlled text

**Status:** Accepted
**Date:** 2026-08-10
**Requirements:** NFR-050, NFR-051, NFR-052, NFR-053, C-004

## Context

Lesson content — phrases, glosses, tone data, audio references — must be authored,
reviewed by native speakers, corrected, and published. Content is the long pole of this
project: the software can be finished and the product still be worthless without
validated language material.

The conventional approach is a database plus an authoring web application. Content lives
in Postgres; contributors use a CMS.

Two problems with that here:

1. **The authoring application must be built first.** In the original roadmap this sat at
   Phase 3. Content authoring would then be blocked for roughly a year — and content
   authoring is the critical path.
2. **Native-speaker review is hard to do well in a CMS.** Reviewing a tone correction
   needs diffing, threaded discussion, and a revert path. Building all of that is
   substantial work.

Meanwhile we already depend on a system that provides diffing, review, threaded
discussion, attribution, history, and revert: git and GitHub.

## Decision

**Lesson content is authored as YAML files in `content/`, under version control.
Postgres is a derived artefact.**

- Content is validated by Zod schemas in CI; malformed content cannot merge (NFR-052)
- A seeder compiles YAML into Postgres
- The database may be dropped and rebuilt at any time with no loss
- Contributors without any tooling edit through the GitHub web interface and open a pull
  request

Format specification: [07-CONTENT-MODEL.md](../07-CONTENT-MODEL.md).

## Consequences

### Positive

- **Content authoring is unblocked from day one.** This is the decisive benefit — it
  removes roughly a year from the content critical path.
- **The contributor portal ceases to be a prerequisite.** It becomes, later, a friendlier
  writer of these same files rather than a gate in front of them.
- Native-speaker review happens through pull requests: diffs, comments, history, revert
  — all free, all mature, none of it built by us.
- CI validation catches an entire class of errors mechanically. The gloss-concatenation
  check in particular (does the morpheme sequence actually reassemble into the target
  sentence?) catches a pedagogically destructive error that is invisible on visual
  inspection.
- Attribution and change history come free from git (NFR-053).
- The publication gate — no content without a designated linguistic authority (NFR-050,
  NFR-051) — is enforceable as a CI check rather than as a human process.

### Negative

- **Contributors need a GitHub account and basic comfort with the web editor.** This is a
  genuine barrier for non-technical native speakers, and it is the principal cost of this
  decision. Accepted for Phase 1; the studio removes it later.
- YAML is whitespace-sensitive and easy to break. Mitigated by CI validation with clear
  error messages, but it will still frustrate some contributors.
- Binary audio in git bloats the repository. Tolerable at Opus sizes (a few KB per clip);
  migrate to Git LFS beyond roughly 10,000 files.
- Full re-validation on every push becomes slow past roughly 5,000 files; incremental
  validation is the answer when we get there.

### Neutral

- Content and code share a release cadence. Fine for now; may want independent content
  releases later, which the bundle mechanism already permits.

## Alternatives considered

**Database-first with a CMS** — Rejected for Phase 1. Blocks content authoring behind
building the CMS. Reconsidered at roughly 500 lessons, at which point the studio writes
these same files rather than replacing them.

**Headless CMS (Strapi, Directus, Sanity)** — Rejected. Self-hosted options add
infrastructure; hosted options cost money (C-001). Neither gives review workflows better
than pull requests for this use case.

**Google Sheets as the authoring surface** — Seriously considered, and genuinely
attractive: near-zero barrier for non-technical contributors, and familiar to most.
Rejected because it has no schema validation, no review workflow, no meaningful version
history, and creates a dependency on a third-party service holding the content source of
truth. **Worth revisiting as an import path** — a script that pulls a sheet and emits
validated YAML would combine the accessibility with the guarantees.

**JSON instead of YAML** — Rejected. No comments, noisier syntax, and worse for humans
hand-editing linguistic data with diacritics.
