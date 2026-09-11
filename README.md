<div align="center">

# UBUNTU-NTU

**Open infrastructure for learning — and preserving — African languages.**

*Offline-first · Tone-aware · Community-owned*

[![Status](https://img.shields.io/badge/status-M4%20in%20progress-blue)]()
[![Tests](https://img.shields.io/badge/tests-306%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/core%20coverage-100%25-brightgreen)]()
[![Code](https://img.shields.io/badge/license-Apache--2.0-green)]()
[![Content](https://img.shields.io/badge/content-CC%20BY--SA%204.0%20(provisional)-lightgrey)]()

</div>

---

## What this is

Roughly one third of the world's living languages are African. Digital language
technology serves almost none of them.

UBUNTU-NTU is a mobile application that teaches African languages the way they are
actually spoken — **by ear, by tone, and in cultural context** — and builds a permanent
open archive of those languages in the process.

The two goals are the same activity. Every recording that teaches a learner also
preserves a language.

> **Current status: M4 in progress.** The learning engine, database, API, offline
> sync, and content pipeline are built and verified — **306 passing tests**, 100%
> coverage on every shared package. What remains for M4 is the device shell.
>
> See the [Implementation Reference](docs/13-IMPLEMENTATION-REFERENCE.md) for exactly
> what exists today, or the [roadmap](docs/06-TECHNICAL-ROADMAP.md) for what comes next.

---

## Why it is different

**It works with no internet.** Not "works offline too" — offline is the *primary* mode.
Lessons download once as a few megabytes. Checking an answer, playing audio, recording
your voice, and analysing your pitch all happen on the device. A learning session
transfers zero bytes.

**It runs on a phone and in a browser.** A mobile app (Android-first) for learners on the
continent, where guaranteed offline and data economy matter most — and an installable web
app for the diaspora, desktop learners, and anyone trying it without installing anything.
Both work offline; both share the same scheduling engine, sync protocol, and pitch
analysis. → [Platform strategy](docs/12-PLATFORM-STRATEGY.md)

**It teaches tone, visibly.** Many African languages are tonal: the same syllables at a
different pitch mean a different word. Being told "your tone was wrong" is useless. So
we draw your pitch against the native speaker's, normalised so a deep voice and a high
voice are compared fairly. You can *see* the difference, and see it close.

**It never drops you into a cold sentence.** Our core exercise, *Scaffolded Sentence
Deconstruction*, removes cognitive load one layer at a time:

```text
1. ANCHOR    "I am going to the market."          ← meaning first, in your language
2. LITERAL   Mo │ ń       │ lọ │ sí │ ọjà         ← structure, morpheme by morpheme
             I  │ PRESENT │ go │ to │ market
3. SLOW      "Mo... ń lọ... sí... ọjà."           ← your ear finds the boundaries
4. NATIVE    "Mo ń lọ sí ọjà."                    ← full speed, now comprehensible
```

**The language comes from the community.** Lessons are recorded by native speakers,
validated by their peers, and credited by name. We build the system; we do not author
the language.

**The archive outlives the product.** Everything validated enters a permanent, openly
licensed corpus. If this project fails entirely, the recorded language survives.

---

## Documentation

Start with whichever fits you.

### For everyone

| Document | What it covers |
|---|---|
| **[Plain-Language Guide](docs/03-ECOSYSTEM-OVERVIEW.md)** | How the whole thing works, no jargon. **Start here.** |
| [Vision](docs/01-VISION.md) | The problem, who it is for, the impact we are aiming at |
| [Glossary](docs/11-GLOSSARY.md) | Every term used across the project |

### For partners, funders, and institutions

| Document | What it covers |
|---|---|
| **[Concept Note](docs/02-CONCEPT-NOTE.md)** | Problem, solution, beneficiaries, outcomes, risks, phasing |
| [Data Governance](docs/09-DATA-GOVERNANCE.md) | Rights, consent, community ownership, ethics |

### For developers

| Document | What it covers |
|---|---|
| [Architecture](docs/05-ARCHITECTURE.md) | System design and the three decisions that shape it |
| [Technical Roadmap](docs/06-TECHNICAL-ROADMAP.md) | Milestones, gates, and working conventions |
| [Requirements](docs/04-SRS.md) | Numbered functional and non-functional requirements |
| [Content Model](docs/07-CONTENT-MODEL.md) | Lesson file format and validation rules |
| [Sync Protocol](docs/08-SYNC-PROTOCOL.md) | Offline synchronisation design |
| [Platform Strategy](docs/12-PLATFORM-STRATEGY.md) | Web vs mobile — what is shared, what is written twice |
| **[Implementation Reference](docs/13-IMPLEMENTATION-REFERENCE.md)** | **What is built today, every tool and dependency, hazards found** |
| [Dependencies](docs/10-DEPENDENCIES.md) | Every dependency, its licence, and its cost |
| [Decision Records](docs/adr/) | Why things are the way they are |

---

## Architecture in brief

Three decisions determine everything else:

**1. One shared learning core.** FSRS scheduling lives in a zero-dependency,
pure-TypeScript package imported identically by phone and server. Divergence between the
two becomes structurally impossible rather than merely unlikely.
→ [ADR-0002](docs/adr/0002-shared-learning-core.md)

**2. Progress syncs as an event log, not as state.** The client appends immutable review
events; the server replays them deterministically. Two devices offline at once converge
with nothing lost — no CRDTs, no conflict resolution, because there are no conflicts.
→ [ADR-0003](docs/adr/0003-event-sourced-sync.md)

**3. Content is version-controlled text.** Lessons are YAML in git, validated in CI,
compiled into Postgres. A linguist can correct a tone through a GitHub pull request. The
contributor portal stops being a prerequisite for content work.
→ [ADR-0004](docs/adr/0004-content-as-code.md)

### Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Mobile | Expo (Android-first) · React Native Skia · Reanimated |
| Web | React + Vite · installable PWA · SQLite-WASM over OPFS · SVG |
| Device DB | expo-sqlite + Drizzle (same schema on both surfaces) |
| API | Fastify + TypeScript |
| Data | PostgreSQL 16 · Redis 7 · MinIO |
| Testing | Vitest (core, API) · Jest (mobile) · Playwright (web offline) |

**Web is nearly free**, and not by luck. Three earlier decisions — a pure zero-import
core, event-sourced sync, and batch rather than real-time pitch analysis — were each made
for unrelated reasons, and together they mean the scheduling engine, sync protocol,
schema, and pitch algorithm all run unmodified in a browser. Only UI, storage adapters,
and audio plumbing are new. → [ADR-0007](docs/adr/0007-web-platform.md)

**Cost to run today: $0.00.** Everything is local and open source. Paid services sit
behind port interfaces with working free adapters.
→ [Dependency ledger](docs/10-DEPENDENCIES.md)

---

## Roadmap

| Milestone | Gate |
|---|---|
| ✅ M0 · Foundation | CI green; three containers healthy |
| ✅ M1 · Learning core | FSRS at 100% coverage; zero imports verified |
| ✅ M2 · Schema & content | Clean migrate + seed from empty container |
| ✅ M3 · API | Duplicate event POST proven idempotent |
| ⚠️ **M4 · Walking skeleton** | **Aeroplane mode → force-close → reconnect → state correct** |
| M5 · Sentence Deconstruction | Four stages; slow playback preserves pitch |
| M6 · Pitch feedback | Contour renders ≤ 300 ms on a 2 GB Android device |
| M7 · Exercise breadth | Six types, all YAML-authorable |
| M8 · Engagement | Streak survives timezone change and offline gap |
| **M9 · Web PWA** | Offline after first visit; web↔mobile progress converges; contours match |
| M10 · Contributor studio | External contributor submits and validates end to end |

M4 is the milestone that matters. Everything before it is setup; everything after is
breadth.

---

## Contributing

**You do not need to be a programmer.** The most valuable contribution to this project is
someone who speaks an African language natively.

| You are | How to help |
|---|---|
| A native speaker | Record phrases, or check whether existing recordings are right |
| A linguist | Validate content; serve as a designated authority for a variety |
| An elder | Record proverbs, stories, oral history |
| A developer | See the [roadmap](docs/06-TECHNICAL-ROADMAP.md) |
| An institution | Partner on a pilot language — see the [Concept Note](docs/02-CONCEPT-NOTE.md) |

→ [CONTRIBUTING.md](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

## What we are looking for right now

Not funding. In order of usefulness:

1. **A language community** willing to co-design the pilot
2. **A designated linguistic authority** — someone who can rule on what is correct
3. **Native-speaker contributors**
4. **An institutional partner** — a university linguistics department or cultural institute

If any of that could be you, please open an issue or start a discussion.

---

## Licence

| | |
|---|---|
| Code | [Apache-2.0](LICENSE) |
| Documentation | CC BY 4.0 |
| Language corpus | CC BY-SA 4.0 — **provisional** |

The corpus licence is deliberately not settled. It will be decided **with** the pilot
language community, not for them. See
[Data Governance §6](docs/09-DATA-GOVERNANCE.md).

---

## On the name

**Ubuntu** — a southern African concept, roughly *"I am because we are."* Personhood is
realised through community.

**-ntu** — the root meaning *person* across many Bantu languages: *muntu*, *bantu*,
*ubuntu*.

A language cannot be preserved by one person. Neither can this.
