# Content Model

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers, linguists, content contributors.
> **Authority:** This document defines the source-of-truth format. The database schema
> is *derived* from it — where they disagree, this document is correct and the schema is
> a bug.

---

## 1. Why content lives in text files

The database is a derived artefact. The authoritative content is YAML under version
control.

| Benefit | Consequence |
|---|---|
| Diffable | A tone correction shows as a one-line change in a pull request |
| Reviewable | Native speakers review through GitHub, with threaded discussion |
| Revertible | Bad content is undone by reverting a commit |
| Attributable | Git records who wrote what, when, and why |
| Validated | CI blocks malformed content from merging |
| **Portal-free** | Contribution needs no authoring UI to begin |

That last row is the strategic point: content authoring is unblocked from day one,
rather than waiting on Phase 3 tooling.

---

## 2. Hierarchy

```text
Language          Yoruba
  └── Dialect     Yoruba (Ọ̀yọ́)
        └── Skill         "At the Market"
              └── Lesson        "Buying and Bargaining"
                    └── Exercise      one interaction
                          └── Vocabulary Item   one FSRS-scheduled unit
```

**Skills form a directed acyclic graph**, not a linear sequence. A skill declares
prerequisites; the app unlocks it when all prerequisites are complete. This permits
multiple valid learning paths and avoids forcing an artificial single ordering onto a
language.

**Vocabulary items are the FSRS unit** — the thing scheduled, remembered, and forgotten.
An item may appear in many exercises across many lessons; its memory state is tracked
once per user.

---

## 3. Directory layout

```text
content/
└── yo/                            ISO 639 language code
    ├── language.yaml              language-level metadata
    ├── dialects/
    │   └── oyo.yaml
    ├── vocabulary/
    │   ├── greetings.yaml
    │   └── market.yaml
    ├── skills/
    │   ├── greetings/
    │   │   ├── skill.yaml
    │   │   ├── lesson-01.yaml
    │   │   └── lesson-02.yaml
    │   └── market/
    │       ├── skill.yaml
    │       └── lesson-01.yaml
    └── audio/
        ├── greetings/
        │   ├── l1-full.opus
        │   └── morphemes/
        │       ├── mo.opus
        │       └── n-lo.opus
        └── market/
```

Audio files are referenced by path, never embedded. Binary in git is tolerable at this
scale (Opus clips are a few KB each); revisit with Git LFS beyond roughly 10,000 files.

---

## 4. Identifier convention

Stable, human-readable, hierarchical:

```text
yo.market.l1.ex3          exercise
yo.market.v017            vocabulary item
yo.market                 skill
```

**IDs are permanent.** Renaming an ID orphans every user's FSRS history for that item —
their memory of that word is silently reset. Treat an ID as immutable once published; to
replace an item, deprecate the old ID and create a new one.

---

## 5. File formats

### 5.1 `language.yaml`

```yaml
code: yo
name: Yoruba
nativeName: Yorùbá
isTonal: true
toneSystem:
  levels: [low, mid, high]
  markedInOrthography: true
scripts: [latin]
anchorLanguages: [en, fr]
```

### 5.2 `dialects/oyo.yaml`

```yaml
code: yo-oyo
language: yo
name: Ọ̀yọ́
region: Oyo State, Nigeria
description: >
  Widely regarded as close to the standard literary form.
  Used as the pilot reference variety.
authority:
  name: TBD
  affiliation: TBD
  confirmedAt: null
```

> `authority` is mandatory before any lesson in this dialect may publish (NFR-050,
> NFR-051). A `null` value blocks publication in CI. This is intentional: it makes
> "who says this is correct?" an unavoidable question rather than an assumption.

### 5.3 `vocabulary/market.yaml`

```yaml
- id: yo.market.v017
  target: ọjà
  ipa: /ɔ̀.d͡ʒà/
  tones: [low, low]
  anchors:
    en: market
    fr: marché
  partOfSpeech: noun
  audio: market/v017.opus
  notes: >
    Refers to a physical marketplace, not an abstract economic market.

- id: yo.market.v018
  target: lọ
  ipa: /lɔ̄/
  tones: [mid]
  anchors:
    en: go
    fr: aller
  partOfSpeech: verb
  audio: market/v018.opus
```

### 5.4 `skills/market/skill.yaml`

```yaml
id: yo.market
dialect: yo-oyo
title:
  en: At the Market
  fr: Au marché
description:
  en: Buying, bargaining, and counting.
icon: basket
prerequisites: [yo.greetings]
position: { x: 2, y: 3 }
```

### 5.5 Lesson with Sentence Deconstruction — the central format

```yaml
id: yo.market.l1
skill: yo.market
title:
  en: Going to the Market
orderIndex: 1
xpReward: 10

exercises:
  - id: yo.market.l1.ex1
    type: sentence_deconstruction
    target: "Mo ń lọ sí ọjà."
    anchors:
      en: "I am going to the market."
      fr: "Je vais au marché."

    # Morpheme-aligned gloss. Order MUST match spoken order.
    gloss:
      - morph: "Mo"
        anchor: { en: "I", fr: "je" }
        tone: mid
        audio: market/morphemes/mo.opus
        vocabId: yo.market.v001

      - morph: "ń"
        # Grammatical morpheme: no lexical equivalent.
        # Use a category label — NEVER leave blank (FR-043).
        category: PRESENT
        anchor: { en: "(happening now)", fr: "(en cours)" }
        tone: high
        audio: market/morphemes/n.opus

      - morph: "lọ"
        anchor: { en: "go", fr: "aller" }
        tone: mid
        audio: market/morphemes/lo.opus
        vocabId: yo.market.v018

      - morph: "sí"
        anchor: { en: "to", fr: "à" }
        tone: high
        audio: market/morphemes/si.opus

      - morph: "ọjà"
        anchor: { en: "market", fr: "marché" }
        tone: low
        audio: market/morphemes/oja.opus
        vocabId: yo.market.v017

    audio:
      full: market/l1-full.opus
      anchor:
        en: market/l1-anchor-en.opus

    pitchContour:
      referenceSemitones: [0.0, 3.2, 0.1, 3.4, -2.8]
      sampleRateHz: 100

    assembly:
      distractors: ["ilé", "wá"]

    contributor:
      name: TBD
      dialect: yo-oyo
      recordedAt: null
```

### 5.6 Other exercise types

```yaml
  - id: yo.market.l1.ex2
    type: multiple_choice
    prompt: { en: "Which word means 'market'?" }
    audio: market/v017.opus
    options:
      - { text: "ọjà", correct: true }
      - { text: "ilé", correct: false }
      - { text: "omi", correct: false }
    vocabId: yo.market.v017

  - id: yo.market.l1.ex3
    type: tone_match
    target: "ọjà"
    tones: [low, low]
    referenceContour: [-2.1, -2.8]
    toleranceSemitones: 1.5
    vocabId: yo.market.v017

  - id: yo.market.l1.ex4
    type: audio_match
    audio: market/v018.opus
    options:
      - { text: { en: "go" }, correct: true }
      - { text: { en: "come" }, correct: false }
```

**Supported types:** `sentence_deconstruction` · `multiple_choice` ·
`sentence_builder` · `audio_match` · `tone_match` · `speech_pronunciation` · `flashcard`

---

## 6. Validation rules

Enforced by Zod in CI. Violations block merge.

### Structural

| Rule | Rationale |
|---|---|
| IDs unique across the language | Collisions corrupt FSRS state |
| ID prefix matches directory | Keeps navigation predictable |
| Referenced `vocabId` exists | Prevents orphaned scheduling |
| Referenced audio file exists on disk | Prevents silent lessons |
| Prerequisites exist and form no cycle | A cycle makes a skill permanently unreachable |
| `orderIndex` unique within a skill | Ambiguous ordering |

### Linguistic

| Rule | Rationale |
|---|---|
| Tonal languages: every morpheme has `tone` | The differentiating feature depends on it |
| `tones` length matches syllable count | Catches transcription slips |
| Concatenated gloss morphemes equal `target` | Catches misalignment — the most common authoring error |
| Every morpheme has `anchor` **or** `category` | FR-043: never a blank cell |
| Every anchor language declared in `language.yaml` | Prevents partial translations |

### Publication gates

| Rule | Rationale |
|---|---|
| Dialect `authority` non-null | NFR-050: no unvalidated content reaches learners |
| Contributor attribution present | Principle 4 |
| Audio present for all referenced paths | Silent lesson is worse than no lesson |

> The concatenation check deserves emphasis. If the gloss morphemes do not reassemble
> into the target sentence, the deconstruction exercise teaches a structure that does
> not exist. It is easy to introduce, invisible on inspection, and pedagogically
> destructive — so it is checked mechanically on every push.

---

## 7. Compilation pipeline

```text
content/*.yaml
     │
     ▼  Zod validate ──── fail ──► CI blocks merge
     │
     ▼  seed → Postgres (derived, disposable)
     │
     ▼  bundle builder
     │     ├── gather lessons + audio
     │     ├── compress
     │     └── hash → content-addressed ID
     ▼
 bundle-yo-oyo-a3f9c2.tar
     │
     ▼  manifest published → client downloads
```

Postgres may be dropped and rebuilt from `content/` at any time with no loss. Only user
progress data is irreplaceable — and that lives in a different class entirely (see
[05-ARCHITECTURE.md §6.1](05-ARCHITECTURE.md)).

---

## 8. Authoring workflow

**For developers:** edit YAML, run `pnpm validate:content`, commit, open a PR.

**For linguists and native speakers, with no tooling:**

1. Open the file on github.com
2. Click the pencil icon
3. Edit
4. Describe the change and click *Propose changes*
5. CI validates automatically; a maintainer reviews and merges

This is the entire contributor workflow for Phase 1. It requires no installation, no
account beyond GitHub, and no product engineering from us.

---

## 9. Deliberate limitations

| Limitation | Threshold | Response |
|---|---|---|
| YAML becomes unwieldy | ~1,000 lessons | Contributor studio writes the same files |
| Binary audio in git | ~10,000 files | Migrate to Git LFS |
| Non-technical contributors need GitHub | Immediately | Accepted for Phase 1; studio removes it |
| Full re-validation on every push | ~5,000 files | Incremental validation on changed files |

These are known and accepted, not overlooked. Each has a defined trigger point.
