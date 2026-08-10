# UBUNTU-NTU — Vision

> **Document status:** Draft v0.1 · Last updated 2026-08-10 · Owner: Project Lead
> **Audience:** Everyone. This is the north-star document. If any other document
> contradicts this one, this one wins until explicitly amended.

---

## 1. The one-sentence version

**UBUNTU-NTU is an offline-first mobile app that teaches African languages the way
they are actually spoken — by ear, by tone, and in cultural context — and builds a
permanent open archive of those languages in the process.**

---

## 2. The problem we exist to solve

There are roughly 2,000 languages spoken across Africa. Almost none of them can be
learned properly on a phone.

This is not a small gap. It is a structural exclusion, and it has three distinct causes
that reinforce each other:

### 2.1 The data problem

Modern language technology is built on large digital text corpora. African languages
are **low-resource**: there is very little of them written down on the internet in a
machine-readable form. This means the standard playbook — scrape the web, train a
model, ship a product — simply does not run. Companies conclude the market is
unservable and move on.

### 2.2 The pedagogy problem

The apps that do exist treat language as text-to-text translation. But many African
languages are **tonal** — in Yoruba, the same syllable at a different pitch is a
different word entirely. They are often **agglutinative**, packing what English needs
a whole sentence for into a single word. And they carry **mandatory social encoding**:
in Yoruba or Luganda, how you greet someone depends on their age relative to yours,
and getting it wrong is not a grammar mistake, it is rudeness.

A text-flashcard app cannot teach any of this. It teaches you to read a language you
still cannot hear, speak, or use without giving offence.

### 2.3 The infrastructure problem

The dominant assumption in app development — always-on, cheap, fast connectivity — does
not hold for most of the intended users. Data is expensive relative to income.
Connectivity is intermittent. Devices are mid-range Android, not flagships. An app that
requires a server round-trip to check an answer is unusable, and an app that streams
audio is unaffordable.

### 2.4 The consequence

Language loss. A generation of young Africans grows up in Lagos, Nairobi, Accra, or
Kinshasa speaking English or French at school and struggling to hold a conversation
with their own grandparents. Millions in the diaspora watch their children lose a
heritage in a single generation. When the last fluent speakers of a language die, what
goes with them is not just vocabulary — it is a way of describing the world, a body of
proverbs, an oral history, and an irreplaceable piece of human intellectual heritage.

> **Figures to verify before external publication:** claims about the number of
> African languages and the count classified as endangered must be sourced to a
> citable authority (UNESCO Atlas of the World's Languages in Danger, Ethnologue)
> with an access date. Do not publish estimates from memory. See
> [Open Questions](#8-open-questions).

---

## 3. What we are building

Four things, which together form one system:

**1. A learner app** — offline-first, available as a **mobile app (Android-first) and an
installable web app**, that teaches through hearing and speaking rather than reading. Its
distinguishing features are *Scaffolded Sentence Deconstruction* (see below) and *pitch
contour feedback* for tonal languages. Mobile serves learners on the continent, where
guaranteed offline operation and data economy matter most; web serves the diaspora,
desktop learners, and anyone trying the product without installing anything.
See [12-PLATFORM-STRATEGY.md](12-PLATFORM-STRATEGY.md).

**2. A contribution pathway** — a way for native speakers, elders, linguists, and
students to add and correct content, with attribution and peer validation.

**3. An open language archive** — every validated recording, gloss, and phrase becomes
part of a permanent, openly licensed dataset that outlives the app itself.

**4. A governance framework** — explicit rules about who owns contributed language
data and who decides how it is used. This is not an afterthought; see
[09-DATA-GOVERNANCE.md](09-DATA-GOVERNANCE.md).

### 3.1 The signature feature: Scaffolded Sentence Deconstruction

The central pedagogical bet of this project. A beginner hearing a full native sentence
experiences *syntax shock* — the brain attempts word-by-word translation, the word
order does not correspond, and the learner freezes and disengages.

We defuse this by never presenting a cold native sentence. Instead, four stages:

```text
STAGE 1 — ANCHOR       "I am going to the market."         (learner's own language)
                        ↓  meaning is now known; anxiety removed
STAGE 2 — LITERAL       Mo  │ ń       │ lọ  │ sí │ ọjà
                        I   │ PRESENT │ go  │ to │ market   (morpheme-by-morpheme)
                        ↓  structure is now visible
STAGE 3 — SLOW          "Mo... ń lọ... sí... ọjà."          (0.5×, tone marks lit)
                        ↓  the ear finds the word boundaries
STAGE 4 — NATIVE        "Mo ń lọ sí ọjà."                   (full speed)
```

The learner is never guessing at meaning while also trying to parse sound. Meaning
comes first, structure second, sound third, speed last. Each stage removes exactly one
source of cognitive load.

### 3.2 The second bet: seeing your own tone

For tonal languages, we render the learner's pitch contour against the native
speaker's, normalised to **relative semitones** so that a deep voice and a high voice
can be compared fairly. You do not need to be told "your tone was wrong." You can see
the two curves diverge, and you can see them converge as you improve.

---

## 4. Who this is for

We are building for four groups, in priority order.

### Primary — Urban African youth (16–35)

Grew up in a major city. Educated in English, French, or Portuguese. Understands their
mother tongue when spoken to but cannot speak it back. Feels the gap acutely, often
with embarrassment. Owns a mid-range Android phone. Data-conscious.

*What they need:* a private, judgement-free way to close a gap they find slightly
shameful. **Privacy in early practice is a product requirement, not a nice-to-have.**

### Primary — The global African diaspora

Parents in the UK, US, Canada, France, and the Gulf who want their children to speak
Yoruba, Igbo, Twi, Shona, Wolof, or Kikuyu. High motivation, driven by identity rather
than economics. Reliable connectivity, capable devices.

*What they need:* something a child will actually use, and evidence it is authentic
rather than machine-generated.

### Secondary — Language communities and their institutions

Cultural associations, community radio, language boards, and universities who are
already trying to preserve and document their language and lack a modern delivery tool.

*What they need:* the archive, the attribution, and genuine control over how their
language is represented. They are not a data source. They are co-owners.

### Secondary — Researchers and technologists

NLP researchers (Masakhane, Sunbird AI, Lelapa AI and others) who need clean,
consented, well-labelled speech data for African languages.

*What they need:* an openly licensed corpus with honest provenance metadata.

---

## 5. What we are explicitly NOT building

The most useful part of this document. Scope discipline is what allows a small team to
finish anything.

| Not building | Why |
|---|---|
| A general-purpose translator | Different product, needs orders of magnitude more data |
| A social network | Community features come later, and only in service of learning |
| An AI conversation partner | Requires models that do not yet exist for these languages |
| A native iOS app at launch | Android is dominant in-market; iOS costs money we do not have. iOS users are served by the web app in the interim |
| React Native Web (one shared UI codebase) | Would require ~6–7 MB of CanvasKit WASM for pitch rendering, contradicting our data-economy constraints. See [ADR-0007](adr/0007-web-platform.md) |
| Support for 50 languages at launch | One language done excellently beats ten done badly |
| Our own ASR/speech-recognition model | We integrate others' work; we do not train foundation models |

---

## 6. The impact we are aiming at

We are deliberately separating **claims we can substantiate** from **aspirations**.
Concept notes that blur the two do not get funded twice.

### What the system does by construction

These are true if the software works, and require no assumptions about adoption:

- Every validated recording enters a permanent, openly licensed archive. Even total
  product failure leaves the corpus behind. **This is the floor, and it is a real
  floor.**
- Contributors are credited by name in the app, tying digital cultural work to the
  people who did it.
- The dataset lowers the barrier for the next team, whoever they are.

### What we hope for, and will measure

- Learners who progress from passive understanding to speaking with confidence.
- Diaspora children acquiring meaningful competence in a heritage language.
- Elders' oral knowledge captured before it is lost.
- A replicable template other language communities can run themselves.

### How we will know (proposed core metrics)

| Metric | Why it is the honest one |
|---|---|
| Learners completing a **spoken** exercise in week 4 | Speaking, not tapping — the actual goal |
| Validated recordings in the archive | Preservation output, independent of app adoption |
| Distinct contributors, and % still active at 90 days | A crowd of one is not a crowd |
| Median session length on 2G / offline | Proves the infrastructure thesis |
| % of sessions completed fully offline | The core technical bet, measured directly |

> Vanity metrics we will not report as impact: downloads, registered accounts,
> total XP. They measure interest, not learning.

---

## 7. Principles

1. **Offline is the default, not the fallback.** Every feature is designed for a phone
   in aeroplane mode first.
2. **The community owns the language.** We are custodians of a dataset, not owners of
   a heritage.
3. **Authenticity over scale.** A human-verified phrase beats a thousand generated ones.
4. **Attribution always.** Every recording carries its speaker's name if they want it.
5. **No dark patterns.** Streaks encourage; they do not punish or manipulate.
6. **Free to learn, for the people whose language it is.** Monetisation targets those
   with the ability to pay, and never gates a community's access to its own language.
7. **Build in the open.** Code and content are public and auditable.

---

## 8. Open questions

Honest unknowns. Each must be resolved before it blocks a milestone.

| # | Question | Blocks |
|---|---|---|
| Q1 | Which pilot language, and confirmed by which community? | Content authoring |
| Q2 | Which orthography standard — full diacritics or simplified? | Every recording made |
| Q3 | Who is the named native-speaker authority for pilot content? | First real lesson |
| Q4 | What licence for contributed audio, and who consents on the community's behalf? | First upload |
| Q5 | Verified, citable figures for language endangerment | External publication |
| Q6 | Does the tone-contour feedback measurably improve pronunciation? | The core product bet |

**Q6 is the existential one.** The entire differentiation rests on an unproven
hypothesis. We should design the earliest possible test of it and be prepared to hear
that it is wrong.

---

## 9. Related documents

| Document | Purpose |
|---|---|
| [02-CONCEPT-NOTE.md](02-CONCEPT-NOTE.md) | Partners, funders, institutions |
| [03-ECOSYSTEM-OVERVIEW.md](03-ECOSYSTEM-OVERVIEW.md) | Plain-language walkthrough |
| [04-SRS.md](04-SRS.md) | Numbered requirements |
| [05-ARCHITECTURE.md](05-ARCHITECTURE.md) | Technical design |
| [09-DATA-GOVERNANCE.md](09-DATA-GOVERNANCE.md) | Rights, consent, ownership |
