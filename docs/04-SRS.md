# Software Requirements Specification

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers, testers, technical reviewers.
> **Convention:** Every requirement has a stable ID. Tests and commit messages cite
> these IDs. Requirement text may be refined; **IDs are never reused or renumbered.**

**Priority levels**
`P0` must exist for pilot release · `P1` important, may slip one milestone ·
`P2` desirable · `P3` deferred beyond pilot

---

## 1. Scope

This specifies the UBUNTU-NTU learner application, its backend services, the content
pipeline, and the contribution pathway. Out of scope for this revision: contributor web
studio UI (Phase 3), monetisation, iOS.

---

## 2. Definitions

See [11-GLOSSARY.md](11-GLOSSARY.md). Key terms used below: **anchor language**,
**gloss**, **morpheme**, **card**, **bundle**, **review event**, **semitone**.

---

## 3. Functional requirements

### 3.1 Accounts and identity

| ID | Priority | Requirement |
|---|---|---|
| FR-001 | P0 | A user can create an account with email and password. |
| FR-002 | P0 | Passwords are hashed with argon2id. Plaintext passwords are never stored or logged. |
| FR-003 | P0 | A user can use the app **fully offline** after first sign-in, with no re-authentication required while a valid refresh token exists. |
| FR-004 | P1 | A user can practise anonymously before creating an account; local progress migrates to the account on sign-up without loss. |
| FR-005 | P0 | A user can delete their account. Deletion removes personal data but retains anonymised review events for aggregate analytics. |
| FR-006 | P1 | A user can export their own data in a machine-readable format. |

### 3.2 Language and dialect selection

| ID | Priority | Requirement |
|---|---|---|
| FR-010 | P0 | A user selects a target language and a specific **dialect variant** within it. |
| FR-011 | P0 | A user selects an **anchor language** (the language they already know) from those available for the chosen target. |
| FR-012 | P1 | A user may change dialect variant without losing learning progress on shared vocabulary items. |
| FR-013 | P2 | The app suggests a dialect based on device locale, always overridable. |

### 3.3 Content delivery and offline operation

| ID | Priority | Requirement |
|---|---|---|
| FR-020 | P0 | Lesson content downloads as a versioned **bundle** containing text, gloss, and audio. |
| FR-021 | P0 | A downloaded bundle is fully usable with **no network connection whatsoever**. |
| FR-022 | P0 | Bundles are immutable and content-addressed; a given bundle version always has identical content. |
| FR-023 | P0 | The client detects available bundle updates and downloads them only on user consent or unmetered connection. |
| FR-024 | P1 | The user sees bundle size before downloading. |
| FR-025 | P1 | The user can delete downloaded bundles to reclaim storage without losing progress. |
| FR-026 | P2 | A user can transfer a bundle to a nearby device over local peer-to-peer transport, consuming no mobile data. |

### 3.4 Learning session

| ID | Priority | Requirement |
|---|---|---|
| FR-030 | P0 | A session presents 5–8 exercises and completes in 2–5 minutes of typical use. |
| FR-031 | P0 | Answer evaluation happens **entirely on-device**. No network call is on the answer-check path. |
| FR-032 | P0 | The user receives visual and audible feedback within 100 ms of submitting an answer. |
| FR-033 | P0 | Session progress survives app termination; resuming restores exact position. |
| FR-034 | P1 | The user may replay any audio in an exercise unlimited times at no cost. |

### 3.5 Scaffolded Sentence Deconstruction — the signature feature

| ID | Priority | Requirement |
|---|---|---|
| FR-040 | P0 | Presents a sentence in four ordered stages: Anchor → Literal Gloss → Slow Native → Full Native. |
| FR-041 | P0 | **Stage 1 (Anchor):** displays and plays the sentence meaning in the user's anchor language. |
| FR-042 | P0 | **Stage 2 (Literal):** displays a morpheme-aligned gloss where each target morpheme is vertically aligned with its literal anchor-language meaning. |
| FR-043 | P0 | Grammatical morphemes with no lexical equivalent are glossed with a labelled category (e.g. `PRESENT`, `PLURAL`), not left blank. |
| FR-044 | P0 | **Stage 2:** tapping any individual morpheme plays that morpheme's isolated audio. |
| FR-045 | P0 | **Stage 3 (Slow):** plays audio at reduced tempo with inter-morpheme pauses, highlighting each morpheme as it sounds. |
| FR-046 | P1 | Slowed audio preserves pitch (time-stretch, not resampling) so tonal information is not corrupted. |
| FR-047 | P0 | **Stage 4 (Native):** plays the full sentence at natural native tempo. |
| FR-048 | P0 | The user may move backwards to any earlier stage at any time. |
| FR-049 | P0 | After stage 4, the user reassembles the sentence from shuffled morpheme tiles. |
| FR-050 | P1 | Distractor tiles are drawn from plausible confusions, not random vocabulary. |

> **FR-046 is easy to get wrong.** Naïve playback-rate reduction lowers pitch
> proportionally, which for a tonal language destroys the exact information the exercise
> teaches. This must be verified explicitly in test.

### 3.6 Tone and pitch feedback

| ID | Priority | Requirement |
|---|---|---|
| FR-060 | P0 | For tonal languages, the user can record their pronunciation of a target phrase. |
| FR-061 | P0 | The app extracts the fundamental frequency (F₀) contour from the recording on-device. |
| FR-062 | P0 | Pitch is normalised to **relative semitones** against the user's own measured baseline, so users of differing natural pitch are compared fairly. |
| FR-063 | P0 | The learner's contour renders overlaid on the native reference contour on a shared axis. |
| FR-064 | P0 | Contour renders within 300 ms of recording ending. |
| FR-065 | P0 | Unvoiced segments (silence, voiceless consonants) render as breaks, not as zero-pitch. |
| FR-066 | P1 | A similarity score is computed and mapped to plain-language feedback bands. |
| FR-067 | P1 | The user establishes a pitch baseline during onboarding via a short calibration. |
| FR-068 | P1 | Recording, analysis, and feedback function with **no network connection**. |
| FR-069 | P2 | Real-time streaming contour during recording (deferred; see ADR-0005). |
| FR-070 | P0 | Raw voice recordings are not transmitted off-device without explicit, separate user consent. |

### 3.7 Spaced repetition

| ID | Priority | Requirement |
|---|---|---|
| FR-080 | P0 | Each vocabulary item is scheduled per-user by the FSRS algorithm. |
| FR-081 | P0 | Scheduling computes on-device with no network dependency. |
| FR-082 | P0 | The identical FSRS implementation runs on client and server (see ADR-0002). |
| FR-083 | P0 | Every review emits an immutable **review event** with a client-generated UUID. |
| FR-084 | P0 | Ratings are Again(1), Hard(2), Good(3), Easy(4). |
| FR-085 | P1 | The due queue is computable for an arbitrary future timestamp (for testing and forecasting). |
| FR-086 | P2 | FSRS parameters are optimisable per-user from accumulated review history. |

### 3.8 Synchronisation

| ID | Priority | Requirement |
|---|---|---|
| FR-090 | P0 | Review events queue locally in a durable outbox and transmit when connectivity permits. |
| FR-091 | P0 | Event ingestion is **idempotent**: submitting the same event UUID repeatedly has identical effect to submitting it once. |
| FR-092 | P0 | Server card state derives by deterministic replay of the ordered event log — never by accepting client-computed state. |
| FR-093 | P0 | Two devices reviewing offline and syncing later converge to identical state with no review lost. |
| FR-094 | P0 | Sync failure never blocks, degrades, or interrupts learning. |
| FR-095 | P1 | Sync is incremental; only events not yet acknowledged are transmitted. |
| FR-096 | P1 | Outbox survives app termination, device restart, and force-close. |

### 3.9 Contribution

| ID | Priority | Requirement |
|---|---|---|
| FR-100 | P1 | A contributor can record audio for a displayed target phrase. |
| FR-101 | P1 | Recordings encode to Ogg Opus before upload. |
| FR-102 | P1 | On-device voice-activity detection rejects recordings containing no speech before upload. |
| FR-103 | P1 | The contributor sees immediate quality warnings (too quiet, clipping, excessive noise). |
| FR-104 | P1 | Submissions enter `pending` and are not served to learners until validated. |
| FR-105 | P1 | A validator can review a submission and vote approve / reject / wrong-dialect. |
| FR-106 | P1 | A contributor cannot validate their own submission. |
| FR-107 | P1 | Promotion to `approved` requires a configurable consensus threshold across distinct validators. |
| FR-108 | P0 | Explicit informed consent is captured before first upload, presented in the contributor's own language. |
| FR-109 | P0 | A contributor can withdraw a submission, removing it from serving and from future archive releases. |
| FR-110 | P1 | Approved recordings display attribution to the contributor unless anonymity was chosen. |

### 3.10 Engagement

| ID | Priority | Requirement |
|---|---|---|
| FR-120 | P1 | Daily streak, computed in the user's local timezone. |
| FR-121 | P1 | Streak survives timezone change and does not break due to travel. |
| FR-122 | P1 | Streak computes offline and reconciles on sync without penalising the user. |
| FR-123 | P2 | XP awarded per completed lesson. |
| FR-124 | P2 | Leaderboards scoped to language community. |
| FR-125 | P0 | No mechanic may use loss-framing, false urgency, or manipulative notification patterns (see Principle 5, [01-VISION.md](01-VISION.md)). |

---

## 4. Non-functional requirements

Stated numerically. An adjective is not a requirement.

### 4.1 Performance — measured on the reference device

**Reference device:** Android 8.0, 2 GB RAM, quad-core ~1.4 GHz, 720p. All figures are
p95 unless stated.

| ID | Priority | Requirement |
|---|---|---|
| NFR-001 | P0 | Cold start to interactive: ≤ 3.0 s |
| NFR-002 | P0 | Answer submitted → visual feedback: ≤ 100 ms |
| NFR-003 | P0 | Audio play tap → first sample: ≤ 150 ms |
| NFR-004 | P0 | Pitch contour render after recording stops: ≤ 300 ms |
| NFR-005 | P0 | Skia animation: sustained 60 fps, no frame exceeding 32 ms during contour render |
| NFR-006 | P1 | Session start → first exercise visible: ≤ 500 ms |
| NFR-007 | P1 | Memory: ≤ 250 MB resident during a session |

### 4.2 Size and data economy

| ID | Priority | Requirement |
|---|---|---|
| NFR-010 | P0 | Installed APK ≤ 40 MB |
| NFR-011 | P0 | A 10-lesson bundle including audio ≤ 5 MB |
| NFR-012 | P0 | Audio encoded Ogg Opus, ≤ 24 kbps, mono, speech-optimised |
| NFR-013 | P0 | A complete offline learning session transfers **0 bytes** |
| NFR-014 | P1 | A full sync of one day's review events ≤ 20 KB |

### 4.3 Reliability

| ID | Priority | Requirement |
|---|---|---|
| NFR-020 | P0 | No learning progress is lost on crash, force-close, or battery death |
| NFR-021 | P0 | Local database survives interrupted writes without corruption |
| NFR-022 | P0 | Server unavailability is invisible to a learner working offline |
| NFR-023 | P1 | Failed sync retries with exponential backoff and jitter |

### 4.4 Security and privacy

| ID | Priority | Requirement |
|---|---|---|
| NFR-030 | P0 | All network traffic over TLS |
| NFR-031 | P0 | Tokens stored in platform secure storage, never in plaintext preferences |
| NFR-032 | P0 | No PII in logs, crash reports, or analytics |
| NFR-033 | P0 | Voice recordings remain on-device unless explicitly submitted as a contribution |
| NFR-034 | P0 | Refresh tokens rotate on use; reuse of a consumed token invalidates the session family |
| NFR-035 | P1 | Rate limiting on authentication and ingestion endpoints |

### 4.5 Accessibility

| ID | Priority | Requirement |
|---|---|---|
| NFR-040 | P1 | Text contrast meets WCAG 2.1 AA |
| NFR-041 | P1 | Tone information is never conveyed by colour alone; shape and position carry it |
| NFR-042 | P1 | Interactive targets ≥ 44 × 44 dp |
| NFR-043 | P1 | Full support for OS-level text scaling without layout breakage |
| NFR-044 | P2 | Screen-reader labels on all interactive elements |

> **NFR-041 matters more than usual here.** A tone visualiser that distinguishes correct
> from incorrect purely by red/green is unusable for a substantial minority of users, on
> the exact feature the product is differentiated by.

### 4.6 Correctness of language data

| ID | Priority | Requirement |
|---|---|---|
| NFR-050 | P0 | No content reaches learners without native-speaker validation |
| NFR-051 | P0 | Every published lesson records its validating authority and date |
| NFR-052 | P0 | Content files are schema-validated in CI; malformed content cannot merge |
| NFR-053 | P1 | Every phrase is traceable to its source and contributor |

### 4.7 Maintainability

| ID | Priority | Requirement |
|---|---|---|
| NFR-060 | P0 | `packages/core` has **zero runtime dependencies** and no I/O, enforced in CI |
| NFR-061 | P0 | `packages/core` maintains 100% line and branch coverage, enforced by threshold |
| NFR-062 | P0 | All time-dependent functions accept an explicit timestamp; no implicit clock reads in core logic |
| NFR-063 | P1 | Paid third-party services sit behind a port interface with a working free adapter |
| NFR-064 | P1 | API responses validate against the generated OpenAPI schema in CI |

---

## 5. Constraints

| ID | Constraint |
|---|---|
| C-001 | Zero paid services during Phases 0–2. All tooling free and open source. |
| C-002 | Android first. iOS deferred (requires paid developer programme and macOS hardware). |
| C-003 | TypeScript across mobile, backend, and tooling. |
| C-004 | Content authored as plain-text files under version control — not exclusively via a database or GUI. |
| C-005 | No feature may require connectivity on the answer-checking path. |

---

## 6. Traceability

Each requirement must be traceable to a test. CI reports coverage of P0 requirements by
automated test. **A P0 requirement with no corresponding test is treated as unimplemented,
regardless of whether code exists for it.**

---

## 7. Revision policy

Requirements may be added, deprecated, or reworded. IDs are permanent. A deprecated
requirement is marked `[DEPRECATED — reason]` and retained, never deleted, so historical
commits remain interpretable.
