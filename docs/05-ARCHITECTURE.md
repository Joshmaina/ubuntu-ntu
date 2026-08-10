# System Architecture

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers and technical reviewers.
> **Relationship to other docs:** This describes *how*. [04-SRS.md](04-SRS.md) describes
> *what*. Individual irreversible choices are justified in [adr/](adr/).

---

## 1. Architectural drivers

Four constraints shape every decision. Where they conflict, they are resolved in this
order:

1. **Offline correctness.** The app must be fully functional with no network. This is
   not a degraded mode; it is the primary mode.
2. **Multi-device correctness without data loss.** Two devices offline simultaneously
   must converge with no review lost.
3. **Content authenticity.** No content reaches a learner without native-speaker
   validation, and every item is traceable to a human.
4. **Zero operating cost during build.** Everything runs locally on free, open-source
   tooling.

---

## 2. The three decisions that determine everything else

Most architectural choices are reversible. These are not, and they are the reason the
rest of the system looks the way it does.

### 2.1 One shared learning core

`packages/core` contains FSRS scheduling, tone comparison mathematics, and gloss
parsing as **pure TypeScript with zero dependencies and no I/O**. It compiles for both
Node and React Native. Client and server import the identical module.

**Why this matters.** If the phone schedules a card for Tuesday and the server computes
Wednesday, the user's memory model corrupts silently. The bug will be unreproducible and
the damage cumulative. Sharing the module makes divergence *structurally impossible*
rather than merely unlikely — there is no second implementation that could drift.

Enforced by CI: `packages/core` may import nothing. Not `Date`, not `crypto`, not Node
built-ins. Every function that needs the current time receives it as an argument
(NFR-062). This purity is what makes the module portable, deterministic, and exhaustively
testable.

*See [ADR-0002](adr/0002-shared-learning-core.md).*

### 2.2 Progress synchronises as an event log, not as state

The naive design syncs card state and resolves conflicts on collision. **This is wrong
for spaced repetition.** Last-write-wins silently discards a review, and the loss is
invisible — the user simply finds their scheduling has quietly degraded.

Instead, the client appends immutable **review events** to a durable outbox:

```json
{
  "eventId": "0192f3a1-...",   // client-generated UUID — the idempotency key
  "cardId":  "yo.mkt.v017",
  "rating":  3,
  "reviewedAt": "2026-08-10T14:22:31.412Z",
  "durationMs": 4180
}
```

The server is idempotent on `eventId`, sorts all events for a card by `reviewedAt`, and
**replays them through the same `packages/core` FSRS** to derive authoritative state.

**Consequence:** conflict-free multi-device sync with no CRDTs, no vector clocks, and no
merge logic to get wrong. Reviews commute because replay is deterministic. Re-sending an
event is harmless, so the retry strategy can be naive and still correct.

This is only possible *because* of §2.1. The two decisions are one decision.

*See [ADR-0003](adr/0003-event-sourced-sync.md) and
[08-SYNC-PROTOCOL.md](08-SYNC-PROTOCOL.md).*

### 2.3 Content is version-controlled text, not database rows

Lessons live as YAML files in `content/`, validated by Zod, compiled into Postgres by a
seeder. The database is a **derived artefact**, not the source of truth.

**What this buys, at zero cost:**

- Content is diffable, reviewable, and revertible through ordinary pull requests.
- A linguist can propose a correction through the GitHub web interface without us
  building a single screen of authoring UI.
- CI validates every lesson on push — malformed tone data cannot reach production.
- Attribution and change history come free from git.
- **The contributor portal stops being a prerequisite.** It becomes, eventually, a
  friendlier writer of these same files.

*See [ADR-0004](adr/0004-content-as-code.md) and
[07-CONTENT-MODEL.md](07-CONTENT-MODEL.md).*

---

## 3. System overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENT (Expo / Android)                  │
│                                                                        │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────────────────┐  │
│   │  UI Layer    │   │ Audio Engine │   │  Pitch Analysis (on-dev.) │  │
│   │  RN + Skia   │   │ play/record  │   │  YIN → F₀ → semitones     │  │
│   └──────┬───────┘   └──────┬───────┘   └─────────────┬─────────────┘  │
│          │                  │                         │                │
│   ┌──────┴──────────────────┴─────────────────────────┴─────────────┐  │
│   │              packages/core   (SHARED, PURE, NO I/O)             │  │
│   │        FSRS · tone comparison · gloss parsing · validation      │  │
│   └──────────────────────────────┬──────────────────────────────────┘  │
│                                  │                                     │
│   ┌──────────────────────────────┴──────────────────────────────────┐  │
│   │        SQLite (expo-sqlite + Drizzle)                           │  │
│   │        cards · review outbox · bundles · settings               │  │
│   └──────────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │  opportunistic sync — never blocking    │
              │  ▲ push review events (idempotent)      │
              │  ▼ pull bundle manifest + bundles       │
              └────────────────────┬────────────────────┘
                                   │
┌──────────────────────────────────┼─────────────────────────────────────┐
│                        API (Fastify + TypeScript)                      │
│                                  │                                     │
│   ┌──────────┐  ┌────────────┐  ┌┴───────────┐  ┌──────────────────┐   │
│   │  auth    │  │  bundles   │  │   events   │  │  contributions   │   │
│   │ JWT+argon│  │  manifest  │  │  ingest    │  │  submit/validate │   │
│   └────┬─────┘  └─────┬──────┘  └─────┬──────┘  └────────┬─────────┘   │
│        │              │               │                  │             │
│   ┌────┴──────────────┴───────────────┴──────────────────┴─────────┐   │
│   │          packages/core  (SAME MODULE — replay must match)      │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
       ┌──────────────┬──────────────┼──────────────┐
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌─────────────┐
  │Postgres │   │  Redis  │   │  MinIO   │   │  content/   │
  │ derived │   │ cache & │   │  audio   │   │  YAML files │
  │  state  │   │ leaders │   │  objects │   │  ★ SOURCE   │
  └─────────┘   └─────────┘   └──────────┘   └─────────────┘
                                                     │
                                              seeder compiles ──┐
                                                                ▼
                                                          (into Postgres)
```

Note the direction of authority: `content/` → Postgres, never the reverse.

---

## 4. Repository layout

```text
ubuntu-ntu/
├── apps/
│   ├── api/                 Fastify server
│   ├── mobile/              Expo application (Android-first)
│   ├── web/                 React + Vite PWA — learner app (M9)
│   └── studio/              contributor web — Phase 3, scaffold only
├── packages/
│   ├── core/                ★ zero-dependency shared logic
│   ├── schema/              Drizzle tables (pg + sqlite) + Zod contracts
│   └── config/              env parsing, feature flags, adapter selection
├── content/
│   └── <lang>/              lesson YAML — content source of truth
├── docs/                    this documentation set
├── scripts/                 migrate · seed · bundle-build · audio-encode
├── docker-compose.yml
└── turbo.json
```

**Dependency rule, enforced in CI:**

```text
apps/*  ──────►  packages/schema  ──────►  packages/core
   │                                            ▲
   └────────────────────────────────────────────┘
                packages/core imports NOTHING
```

`packages/core` and `packages/schema` are shared by **all four** apps — mobile, web, api,
and studio. The zero-import constraint on core is what makes this possible; it runs
unmodified in Node, React Native, and the browser. See
[12-PLATFORM-STRATEGY.md](12-PLATFORM-STRATEGY.md).

---

## 5. Technology choices

| Layer | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Mobile and server need divergent TS configs and dependency versions; a flat layout breaks immediately |
| Language | TypeScript, strict | One language across mobile, API, scripts, seeders |
| API framework | Fastify | Schema-first validation *generates* the OpenAPI spec rather than a hand-written file that drifts |
| ORM | Drizzle | Single schema definition targeting both Postgres and SQLite — server and device share table types |
| Device DB | expo-sqlite + Drizzle | See ADR-0001; WatermelonDB's sync model conflicts with §2.2 |
| Mobile | Expo, dev builds, Android-first | Local builds are free; iOS requires paid programme and macOS |
| **Web** | **React + Vite, installable PWA** | **Serves the diaspora and zero-friction trial; see ADR-0007** |
| **Web storage** | **SQLite-WASM over OPFS + Drizzle** | **Same Drizzle schema as mobile; one definition, three runtimes** |
| **Web offline** | **Service Worker + Cache Storage** | **Same immutable bundles the mobile client downloads** |
| Rendering (mobile) | React Native Skia + Reanimated | 60 fps contour rendering off the JS thread |
| Rendering (web) | SVG path | Batch contour rendering needs no Skia; avoids ~6–7 MB CanvasKit WASM |
| Validation | Zod | One schema yields TS types, runtime validation, and content linting |
| Testing | Vitest (core/API), Jest (mobile) | Vitest is substantially faster; mobile requires jest-expo |
| Infrastructure | Docker: Postgres 16, Redis 7, MinIO | MinIO speaks S3, so cloud migration is a config change |
| Auth | JWT + argon2id, rotating refresh | Hosted auth costs money; this is ~200 lines |
| CI | GitHub Actions | Free tier |

---

## 6. Data architecture

### 6.1 Three distinct classes of data

They have different lifecycles and must not be conflated:

| Class | Source of truth | Direction | Mutability |
|---|---|---|---|
| **Content** — lessons, audio, glosses | `content/` YAML in git | Server → client | Immutable once bundled |
| **Progress** — reviews, cards, streaks | Client-generated event log | Client → server | Append-only |
| **Contributions** — submissions, votes | Server (Postgres) | Bidirectional | Mutable state machine |

### 6.2 Content pipeline

```text
content/*.yaml ──► Zod validate ──► seed to Postgres ──► build bundle
                        │                                     │
                     CI gate                          content-addressed,
                  (blocks merge)                          immutable
                                                              │
                                                       manifest published
                                                              │
                                                       client downloads
```

Bundles are content-addressed: the identifier is a hash of contents. A given bundle
version is therefore byte-identical forever, which makes client caching trivially safe
and rollback instant.

### 6.3 On-device schema (SQLite)

| Table | Purpose |
|---|---|
| `cards` | FSRS state per vocabulary item |
| `review_outbox` | Pending events awaiting sync — durable, survives force-close |
| `bundles` | Installed content bundles and versions |
| `settings` | User preferences, pitch baseline |

`review_outbox` is the single most important table for correctness. An event is deleted
only after the server acknowledges its UUID.

---

## 7. Offline strategy

**Principle: the network is an optimisation, never a dependency.**

| Operation | Network required |
|---|---|
| Start a lesson | No |
| Check an answer | **No** — hard requirement (FR-031) |
| Play reference audio | No — bundled |
| Record and analyse pitch | No — fully on-device |
| Compute the due queue | No |
| Update streak / XP | No |
| Download new content | Yes |
| Sync progress | Yes, but always deferred and never blocking |

Sync failure is not an error state presented to the user. Events remain queued and
retry with exponential backoff and jitter. The learner is never informed unless they
explicitly inspect sync status.

---

## 8. Audio architecture

| Concern | Approach |
|---|---|
| Format | Ogg Opus, mono, ≤ 24 kbps, speech-optimised |
| Why Opus | Best speech quality per byte at low bitrate; royalty-free; native Android support |
| Storage | MinIO (S3 API) → CDN later without code change |
| Bundling | Audio ships inside the lesson bundle, not streamed |
| Slow playback | **Time-stretch preserving pitch** — never resampling |
| Recording | 16 kHz mono PCM, analysed on-device, never transmitted without explicit consent |

> The slow-playback requirement deserves emphasis. Reducing playback rate by resampling
> lowers pitch proportionally, which for a tonal language corrupts the precise
> information the exercise exists to teach. This must be verified by test, not assumed.

---

## 9. Pitch analysis

```text
mic → 16 kHz PCM → frame (25 ms window, 10 ms hop)
                      │
                      ▼
                 YIN algorithm → F₀ estimate + confidence per frame
                      │
                      ▼
          gate: confidence < threshold OR F₀ outside 50–500 Hz → unvoiced
                      │
                      ▼
       normalise:  semitones = 12 · log₂(F₀ / baseline)
                      │
                      ▼
          smooth (EMA), preserving unvoiced breaks as gaps
                      │
                      ▼
       compare to reference contour → deviation score → feedback band
```

**Normalisation to relative semitones is what makes comparison fair.** A bass voice and
a soprano produce entirely different absolute frequencies for the same tonal pattern.
Comparing raw Hz would tell a low-voiced learner they are permanently wrong. Comparing
the *shape* relative to each speaker's own baseline measures what actually matters.

**Deliberate scope decision:** v1 analyses a *completed* recording, not a live stream.
Real-time streaming requires a custom JSI native module and is our highest technical
risk. Record-then-analyse delivers most of the pedagogical value at a fraction of the
cost and risk, behind an interface that permits upgrading later.
*See [ADR-0005](adr/0005-defer-realtime-pitch.md).*

---

## 10. Ports and adapters

Every capability that will eventually cost money sits behind an interface with a working
free adapter and a dormant paid one.

```text
StoragePort ──┬── MinioAdapter        ✅ live (local Docker)
              └── S3Adapter           💤 written, unwired

ASRPort ──────┬── NullASRAdapter      ✅ live (throws NotConfigured, tested)
              └── HostedASRAdapter    💤 stub

NotificationPort ─┬── LocalNotifs     ✅ live
                  └── FCMAdapter      💤 stub
```

Business logic depends only on the port. Selection happens once, in `packages/config`,
from environment variables. Enabling a paid service is a config change and a deploy —
no logic touched.

**Three rules that keep this from rotting:**

1. **Schema is never gated.** Columns for future features exist from day one. Data
   migrations are expensive; UI gating is free.
2. **Flags are three-state:** `live` | `shadow` | `hidden`. `shadow` executes the path
   and logs what it *would* have done, with no user-visible effect — this is how a
   feature is validated before it can be afforded.
3. **Every stub has a passing test** asserting it fails cleanly with `NotConfiguredError`.
   Code that has never once executed is not "ready"; it is a liability awaiting a
   production incident.

---

## 11. Security

| Concern | Approach |
|---|---|
| Passwords | argon2id, never logged, never stored plainly |
| Sessions | Short-lived JWT access + rotating refresh; reuse of a consumed refresh token invalidates the whole family |
| Transport | TLS everywhere |
| Token storage | Platform secure storage (Keystore), never plaintext preferences |
| Voice data | On-device by default; transmitted only on explicit, separate consent (FR-070) |
| Logging | No PII in logs, crash reports, or analytics |
| Rate limiting | Redis-backed, on auth and ingest endpoints |
| Content integrity | Bundles content-addressed; hash verified after download |

---

## 12. Known risks

| Risk | Impact | Response |
|---|---|---|
| Tone visualisation may not improve pronunciation | Invalidates core differentiation | Test with a small cohort in Phase 1, before building on it |
| YIN accuracy on cheap microphones in noisy conditions | Degrades the flagship feature | Confidence gating; validate on the reference device early |
| Reference device too slow for 60 fps Skia | Fails NFR-005 | Measure at M4; simplify rendering path if needed |
| Event log grows unbounded | Storage and replay cost | Periodic snapshot + compaction, deferred until measured |
| Content YAML unwieldy at scale | Contributor friction | Acceptable to ~1,000 lessons; portal supersedes it, writing the same files |
| Single maintainer | Project continuity | Open source, documented, content in plain text |

---

## 13. Explicitly rejected alternatives

Recorded so they are not silently relitigated later:

| Rejected | Reason |
|---|---|
| React Native Web (one shared UI) | ~6–7 MB CanvasKit WASM for Skia contradicts the data-economy constraint; see [ADR-0007](adr/0007-web-platform.md) |
| Go backend | Workload is I/O-bound; a second language costs more than it saves at this team size |
| GraphQL | Endpoint set is small and stable; REST + OpenAPI is simpler and generates clients free |
| WatermelonDB | Imposes a sync model incompatible with §2.2 |
| Server-side FSRS only | Violates the offline requirement outright |
| Managed auth (Auth0/Clerk) | Recurring cost during a zero-budget phase |
| CRDTs for progress | Unnecessary; deterministic event replay solves it more simply |
| Streaming audio lessons | Data cost makes it unusable for the primary audience |
| Training our own ASR | Far beyond available resources; integrate others' work instead |
