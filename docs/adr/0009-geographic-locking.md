# ADR-0009: Country-based geographic locking

**Status:** **Accepted** — implemented strictly, with one policy flag open for decision
**Date:** 2026-08-12
**Requirements:** FR-230 – FR-238, NFR-090

## Context

Dialects vary across borders and across regions within a border. A recording in
one variety presented as another teaches wrong tone and wrong lexicon, and
nothing in the system previously prevented a contributor from submitting audio
for a community they have no connection to.

The requirement: lock languages, dialects, and contributions to specific
countries and community regions, so that cross-border dialect conflicts, tone
ambiguity, and regional overlap cannot occur.

## Decision

**Schema.** `languages.country_code`, `dialects.country_code` +
`dialects.community_region`, and `users.home_country_code` +
`users.verified_dialects`, all NOT NULL, with `UNIQUE (country_code, id)` on
dialects so a dialect id can never be re-pointed at another country. Country
codes are ISO 3166-1 alpha-2, format-checked in the database.

**Enforcement.** A contributor may submit audio or vote only when **both** hold:

1. `home_country_code` equals the dialect's `country_code`
2. the dialect appears in their `verified_dialects`

Failure returns **HTTP 403** with `DIALECT_GEOGRAPHIC_MISMATCH` (rule 1) or
`DIALECT_NOT_VERIFIED` (rule 2). Bundle manifests always carry `countryCode` and
`communityRegion`.

**The review queue is gated too**, not only the write. Filtering at vote time
alone would let a reviewer *see* another community's recordings even though they
could not act on them, and the exposure matters independently of the write.

The rule lives in `packages/core/geo.ts` as pure logic — it decides who may
speak for a community, so it must be exhaustively testable and behave
identically everywhere.

## Two consequences the project should decide on deliberately

These are not objections to the requirement; they are effects of it that will
otherwise be discovered later, at greater cost.

### 1. The diaspora is locked out by rule 1

[02-CONCEPT-NOTE.md §8](../02-CONCEPT-NOTE.md) names the global African diaspora
as a primary audience and the intended monetisation engine.
[01-VISION.md §4](../01-VISION.md) lists them as a primary user group.

Under strict country matching, a Yoruba speaker in London
(`home_country_code = 'GB'`) can never contribute to Yoruba, regardless of
fluency, verification, or how recently they left. So can no Kenyan nurse in
Manchester, no Nigerian engineer in Houston. These are among the most motivated
potential contributors in the entire project.

**Resolution as implemented:** strict matching is the default, exactly as
specified. A configuration flag `ALLOW_DIASPORA_CONTRIBUTIONS` (default
`false`) admits a contributor who is *verified* for the dialect regardless of
country — competence rather than passport. Both settings are pinned by test so
the policy cannot drift silently.

**This is a decision for the project, not for the code.** The mechanism exists;
which way it is set is a governance choice about who is allowed to speak for a
community.

### 2. A single country per language is factually wrong for most African languages

Colonial borders were drawn without regard to speech communities, so most
African languages cross them:

| Language | Countries |
|---|---|
| Swahili | TZ, KE, UG, CD, RW, BI |
| Hausa | NG, NE, GH, CM |
| Somali | SO, ET, KE, DJ |
| Yoruba | NG, BJ, TG |
| Fulfulde | ~20 countries across the Sahel |
| Maasai | KE, TZ |

A single NOT NULL `country_code` on `languages` forces the schema to assert
things like *"Swahili belongs to Kenya"* — false, and in some cases politically
charged.

**Resolution as implemented:** `country_code` is retained as specified and
documented as the **primary** country, and `also_spoken_in VARCHAR(2)[]` records
the rest. `isSpokenIn()` checks both. The array is required (though it may be
empty) so authors state consciously that a language is single-country rather
than leaving the question unasked.

> Worth stating plainly: geography is a good proxy for dialect competence and a
> poor definition of it. `verified_dialects` — already part of the
> specification — is the mechanism that measures the thing we actually care
> about. Geography usefully narrows the pool; verification is what establishes
> that someone can speak for a community.

## Consequences

### Positive

- Cross-border dialect submissions are impossible by default.
- `community_region` catches intra-country variation, which country alone cannot
  — Nyeri and Kiambu Gĩkũyũ differ in ways that matter for tone.
- Contribution geography is recorded at submission time and preserved even if a
  dialect's country is later corrected, so the audit trail cannot retroactively
  misrepresent what was approved.
- Verification is granted by a designated authority, never self-asserted, which
  aligns the mechanism with [09-DATA-GOVERNANCE.md §8](../09-DATA-GOVERNANCE.md).

### Negative

- Diaspora contributors excluded by default (see above).
- `home_country_code` is now required at registration. Learners are unaffected
  in practice, but it is one more field before a stranger can try the product.
- Refugees, migrants, and pastoralist communities (Maasai, Somali, Fulani)
  legitimately live across borders; a single home country models them poorly.
- A contributor who moves country loses contribution rights until their record
  is updated.

### Neutral

- Learning is entirely unaffected. Geography gates contribution, never study.

## Alternatives considered

**Verification only, no country check** — Simpler, and arguably measures the
right thing. Rejected because the requirement is explicitly geographic, and
because geography is a useful cheap filter *before* a human verifies anyone.

**Country as advisory metadata with a warning** — Rejected: a warning that can
be clicked through is not a lock.

**Region-only, no country** — Rejected: region names are ambiguous across
borders, and country is the coarse grouping that makes region names unambiguous.

## Open question for the project

**Should `ALLOW_DIASPORA_CONTRIBUTIONS` be enabled?**

Enabling it means a verified contributor may contribute regardless of residence.
Leaving it off means the strictest possible geographic integrity, at the cost of
excluding a primary audience from contributing.

There is a defensible case for either, and it is not the maintainer's call to
make alone — see [09-DATA-GOVERNANCE.md §11](../09-DATA-GOVERNANCE.md). It should
be settled with the pilot community before contribution opens.
