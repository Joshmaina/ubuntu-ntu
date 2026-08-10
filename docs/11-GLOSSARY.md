# Glossary

> **Document status:** Draft v0.1 · 2026-08-10
> **Purpose:** Shared vocabulary across linguists, developers, contributors, and
> partners. This project sits at the intersection of three fields that each use the
> other's words differently — this document keeps us honest about which meaning is
> intended.

---

## Linguistic terms

**Agglutinative** — A language that builds words by stringing together meaning-carrying
pieces, each with one clear function. Swahili *"Ninakupenda"* is `Ni-` (I) + `-na-`
(present) + `-ku-` (you) + `-penda` (love). One word, four pieces, a full English
sentence. This is why word-by-word translation fails and why morpheme glossing is
essential to our pedagogy.

**Anchor language** — The language a learner already knows, used to introduce meaning
before the target language is presented. Ours, not standard terminology; see
*Scaffolded Sentence Deconstruction*.

**Dialect / variety** — A regional or social form of a language. We use *variety* in
formal writing because *dialect* is sometimes heard as implying inferiority to a
"standard." Neither is more correct than the other; both are recorded and labelled.

**Diacritic** — A mark added to a letter to change its sound or tone: *ọ*, *é*, *à*.
Essential in many African orthographies and notoriously awkward to type on standard
mobile keyboards — a real source of learner drop-off, which is why we favour tile
assembly over free typing.

**F₀ (fundamental frequency)** — The physical rate of vocal fold vibration, measured in
Hertz. What we perceive as pitch. The raw measurement underlying all tone feedback.

**Gloss** — A word-by-word or morpheme-by-morpheme literal translation showing how a
sentence is constructed, as opposed to a fluent translation. Central to Stage 2 of our
core exercise.

**Honorific** — A form of address encoding social relationship — age, status, respect. In
many African languages these are grammatically mandatory, not optional politeness. Using
the wrong form is a social error, not a grammatical one.

**Interlinear glossing** — Layout in which each target morpheme is vertically aligned
with its literal meaning:

```text
Mo   ń         lọ   sí   ọjà
I    PRESENT   go   to   market
```

**IPA (International Phonetic Alphabet)** — Standard notation where each symbol maps to
exactly one sound, unambiguously across languages.

**Low-resource language** — A language with insufficient digital text and audio to apply
standard language-technology methods. Describes most African languages, and is the root
cause of the technology gap this project addresses.

**Morpheme** — The smallest unit of meaning. In *"Ninakupenda"*, `-ku-` (you) is a
morpheme. It is not a word — it cannot stand alone — but it carries meaning. **Our gloss
operates at the morpheme level, not the word level**, which is what makes agglutinative
structure visible to a learner.

**Mutual intelligibility** — The degree to which speakers of different varieties
understand each other. High mutual intelligibility (e.g. Asante and Akuapem Twi) may
justify sharing content between varieties.

**Orthography** — The writing system and spelling conventions of a language. Choosing
one is politically sensitive and has practical consequences: **all recordings are tied to
the orthography chosen at the outset**, so changing it later invalidates content.

**Semitone** — A musical pitch interval; twelve make an octave. We express pitch in
semitones relative to a speaker's own baseline so that voices of different natural pitch
can be compared fairly. See *relative semitone normalisation*.

**Tonal language** — A language where pitch changes lexical meaning — the same syllables
at different pitches are different words. Yoruba, Igbo, Zulu, Twi, Kikuyu and many others.
**The central pedagogical challenge this project addresses.**

**Tone contour** — The shape of pitch movement across a word or phrase. What we render
visually, and what the learner is actually trying to match.

**Unvoiced** — A speech segment with no vocal fold vibration and therefore no pitch:
silence, and consonants such as *s*, *t*, *k*. Rendered as **breaks** in the contour, never
as zero-pitch — a zero would draw a false line to the bottom of the chart.

---

## Learning-science terms

**Card** — One item tracked by the spaced repetition system, together with its per-user
memory state. Roughly "one thing you are trying to remember."

**Difficulty (FSRS)** — How intrinsically hard an item is for a given user, on a 1–10
scale. Distinct from *stability*.

**FSRS (Free Spaced Repetition Scheduler)** — The scheduling algorithm we use.
Predicts when you are about to forget something and shows it just before that happens.
More accurate than the older SM-2 family.

**Rating** — The learner's performance on a review: `1 Again` · `2 Hard` · `3 Good` ·
`4 Easy`.

**Retrievability** — Probability that an item can be recalled right now. Decays over time
since last review.

**Review event** — An immutable record that a specific card was reviewed with a specific
rating at a specific time. **The atomic unit of progress in our system** — see
[08-SYNC-PROTOCOL.md](08-SYNC-PROTOCOL.md).

**Scaffolded Sentence Deconstruction** — Our signature pedagogical method. A sentence is
presented in four stages — Anchor (meaning in a known language) → Literal (morpheme
gloss) → Slow (reduced tempo, pitch preserved) → Native (full speed) — so that cognitive
load is removed one layer at a time rather than imposed all at once.

**Spaced repetition** — Reviewing material at increasing intervals, timed to just before
predicted forgetting. Far more efficient than massed repetition.

**Stability (FSRS)** — How slowly memory of an item decays; effectively how long it will
be remembered. Increases with successful review.

**Syntax shock** — The freeze a beginner experiences when hearing a full sentence in a
language whose word order does not map onto their own. The specific problem Scaffolded
Sentence Deconstruction exists to prevent.

---

## Technical terms

**ADR (Architecture Decision Record)** — A short document recording one significant
decision, its context, and its consequences. Written so that in a year we know *why*, not
merely *what*. See [adr/](adr/).

**Bundle** — A downloadable, immutable package of lessons and audio. The unit of offline
content delivery.

**Content-addressed** — Identified by a hash of its own contents, so a given identifier
always refers to byte-identical data. Makes caching trivially safe and rollback instant.

**DAG (Directed Acyclic Graph)** — A structure of nodes and one-way connections with no
cycles. Our skill tree: skills unlock other skills, and no skill can transitively require
itself.

**Event sourcing** — Storing the sequence of things that *happened* rather than the
current state, and deriving state by replaying them. The foundation of our sync design.

**Idempotent** — An operation that has the same effect whether performed once or many
times. Our event ingestion is idempotent, which makes retries safe and naive.

**Offline-first** — Designed to work fully without a network, treating connectivity as an
enhancement rather than a requirement. **The opposite of "works offline too."**

**Opus / Ogg Opus** — An audio codec with excellent speech quality at very low bitrates.
Roughly 10 KB for a three-second phrase — the reason lesson bundles are small enough to
download on expensive data.

**Port / adapter** — An interface (port) with interchangeable implementations (adapters).
Lets us run a free local service today and swap in a paid one later by changing
configuration, not code.

**Replay** — Recomputing state by processing an event log from the beginning. Deterministic
replay is what makes our multi-device sync conflict-free.

**VAD (Voice Activity Detection)** — Automatically detecting whether speech is present.
Used to reject empty recordings before they consume a contributor's mobile data.

**Walking skeleton** — A minimal implementation that touches every layer of the system end
to end. Proves the architecture before breadth is built on it. Our milestone **M4**.

**YIN** — An algorithm for estimating fundamental frequency from an audio signal. How we
extract pitch for tone feedback.

---

## Project-specific terms

**Anchor stage** — Stage 1 of Sentence Deconstruction: the meaning, in the learner's own
language, before any target-language audio.

**Contributor** — A person who records audio or validates others' recordings. Distinct
from *learner*, though one person may be both.

**Designated linguistic authority** — The person or body recognised by a community as able
to rule on correctness for a variety. Required before content in that variety may be
published — enforced in CI.

**Outbox** — The durable local queue of review events awaiting sync. The client's most
correctness-critical table.

**Reference device** — Android 8.0, 2 GB RAM, quad-core ~1.4 GHz, 720p. All performance
requirements are measured against this, not against a flagship.

**Ubuntu** — Southern African philosophical concept, roughly *"I am because we are"* —
personhood realised through community. The project's name reflects its dependence on
collective contribution.

**-ntu** — The root in many Bantu languages meaning *person* or *human being*, appearing
in *muntu*, *bantu*, *ubuntu*.
