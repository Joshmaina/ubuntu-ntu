# Implementation Reference

> **Document status:** Living reference · Last updated 2026-09-11
> **Audience:** Anyone who needs to know what exists, what it runs on, and why.
> **Scope:** What is actually BUILT and verified — not what is planned. Plans live
> in [06-TECHNICAL-ROADMAP.md](06-TECHNICAL-ROADMAP.md).

---

## 1. Status at a glance

| Milestone | Gate | Status |
|---|---|---|
| **M0** Foundation | CI green on a clean clone; three containers healthy | ✅ **Passed** |
| **M1** Learning core | FSRS TDD, 100% coverage enforced, zero imports verified | ✅ **Passed** |
| **M2** Schema & content pipeline | Clean migrate + seed from an empty container | ✅ **Passed** |
| **M3** API surface | Duplicate event POST proven idempotent; OpenAPI generated | ✅ **Passed** |
| **M4** Walking skeleton | Offline review → sync → converge; **content build → download → verify → install** | ⚠️ **Logic proven, device pending** |
| M5 Sentence Deconstruction | Four stages; slow playback preserves pitch | ⬜ Not started |
| M6 Pitch feedback | Contour ≤ 300 ms on reference device | ⬜ Not started |
| M7 Exercise breadth | Six types, YAML-authorable | ⬜ Not started |
| M8 Engagement | Streak survives timezone change | ⬜ Not started |
| M9 Web PWA | Offline after first visit; web↔mobile converge | ⬜ Not started |
| M10 Contributor studio | External submit + validate end to end | ⬜ Not started |

**M4 qualification.** Every layer is implemented and verified *except the device
shell*. No Android SDK, emulator, or JDK is installed on the development
machine, so the literal aeroplane-mode-on-a-phone gate is unmet. The risky
part — losing a review, or installing corrupt content — is proven by automated
test against a real SQLite and a real Postgres. The remaining work is a thin
Expo UI over already-verified logic.

**Test totals:** 241 unit (100% coverage across four packages) + 65 API
integration = **306 automated tests**, all green in CI.

---

## 2. Repository layout

```text
ubuntu-ntu/
├── apps/
│   └── api/                    Fastify server (auth, bundles, events, contributions)
├── packages/
│   ├── core/                   ★ zero-dependency shared logic
│   ├── schema/                 Drizzle tables + Zod contracts + bundle format
│   ├── sync/                   offline store, sync engine, bundle installer
│   └── config/                 env parsing, feature flags, port selection
├── content/
│   └── ki/                     Gĩkũyũ pilot content (PROVISIONAL)
├── migrations/                 0001–0006, authoritative schema
├── scripts/                    migrate · seed · build-bundles · validate · dump-schema
├── docs/                       this documentation set
├── .github/workflows/ci.yml
├── docker-compose.yml
└── turbo.json
```

**Not yet created:** `apps/mobile`, `apps/web`, `apps/studio`. Deliberate — they
are scheduled at M4-shell, M9, and M10 respectively.

---

## 3. Packages

### `packages/core` — the shared learning engine

**Zero runtime dependencies. Zero imports. No I/O, no clock reads, no randomness.**
Enforced as a CI build failure by `scripts/check-core-purity.mjs`, not by code
review ([ADR-0002](adr/0002-shared-learning-core.md)).

| Module | Contents |
|---|---|
| `fsrs.ts` | FSRS-4.5: retrievability, interval from retention, initial/next stability and difficulty, `review()`, `isDue()`, `dueQueue()` |
| `tone.ts` | Hz → relative semitones, median baseline, EMA smoothing preserving unvoiced gaps, resampling, contour comparison |
| `gloss.ts` | Morpheme concatenation validation, interlinear alignment, seeded deterministic shuffle |
| `geo.ts` | Contribution eligibility rules ([ADR-0009](adr/0009-geographic-locking.md)) |
| `constants.ts` | FSRS-4.5 17-parameter weight vector, DECAY/FACTOR, tone thresholds |

128 tests · 100% statements/branches/functions/lines.

### `packages/schema` — tables and contracts

| Module | Contents |
|---|---|
| `pg.ts` | 16 Postgres tables (Drizzle) |
| `sqlite.ts` | On-device tables, shared by mobile and web |
| `contracts.ts` | Zod content schemas + cross-file validators |
| `bundle.ts` | Bundle payload schema, canonical JSON, content-addressed id |

57 tests · 100% coverage on `contracts.ts`.

### `packages/sync` — the offline engine

Platform-agnostic behind a four-method `SqliteAdapter` interface, so identical
code runs on `expo-sqlite` (mobile), SQLite-WASM (web), and `node:sqlite` (tests).

| Module | Guarantee |
|---|---|
| `store.ts` | A review is never applied to card state without also entering the outbox, and never twice — **one transaction**, proven by crash simulation in both directions |
| `engine.ts` | Sync failure never throws and never loses events; naive retry is safe because ingestion is idempotent; backoff carries jitter |
| `bundle.ts` | A bundle whose hash does not match is refused outright; content operations never touch progress |

60 tests · 100% coverage.

### `packages/config` — environment and ports

Zod-validated env, three-state feature flags (`live` / `shadow` / `hidden`), and
port/adapter selection. Reads `UBUNTU_NTU_DATABASE_URL` and **never** bare
`DATABASE_URL` — with a regression test, because a machine-wide `DATABASE_URL`
silently hijacked migrations once (§8).

16 tests · 100% coverage.

### `apps/api` — Fastify server

| Route | Purpose |
|---|---|
| `GET /health` | Liveness + database connectivity |
| `POST /v1/auth/register` | argon2id; creates a default learner profile |
| `POST /v1/auth/login` | Identical response for unknown email and wrong password |
| `POST /v1/auth/refresh` | Rotating refresh; replay revokes the whole family |
| `POST /v1/auth/logout` | Revokes the family |
| `GET /v1/bundles/manifest` | Bundle list + geographic scope |
| `GET /v1/bundles/:id` | Raw bundle bytes, immutable cache headers |
| `POST /v1/events` | **Idempotent** review ingestion + deterministic replay |
| `GET /v1/cards/due` | Server-side due queue |
| `POST /v1/contributions/audio` | Geographic lock; 403 on mismatch |
| `POST /v1/contributions/:id/vote` | Peer validation; no self-review |
| `GET /v1/contributions/queue` | Scoped to the reviewer's own community |

65 integration tests against a real Postgres.

---

## 4. Technology stack

### Runtime and tooling

| Tool | Version | Role |
|---|---|---|
| Node.js | 24.14.0 (CI: 24) | Runtime |
| pnpm | 11.21.0 | Package manager, workspaces |
| Turborepo | 2.10.9 | Task orchestration |
| TypeScript | 5.9.3 | Strict, ES2022/ESNext, `exactOptionalPropertyTypes` |
| tsx | 4.23.12 | Runs TypeScript scripts |
| Vitest | 2.1.9 | Tests + v8 coverage |
| Docker | 29.6.1 | Local infrastructure |
| GitHub Actions | — | CI |

### Production dependencies

| Package | Version | Used by | Purpose | Licence |
|---|---|---|---|---|
| `fastify` | ^5.2.0 | api | HTTP framework | MIT |
| `@fastify/swagger` | ^9.4.0 | api | Generates OpenAPI from route schemas | MIT |
| `fastify-type-provider-zod` | ^4.0.2 | api | Zod → validation + types + OpenAPI | MIT |
| `drizzle-orm` | ^0.38.3 | api, schema | Postgres + SQLite from one schema language | Apache-2.0 |
| `pg` | ^8.23.0 | api, scripts | Postgres driver | MIT |
| `zod` | ^3.24.1 | schema, config, api | Runtime validation + type inference | MIT |
| `jose` | ^5.9.6 | api | JWT sign/verify, pure JS | MIT |
| `@node-rs/argon2` | ^2.0.2 | api | argon2id hashing, prebuilt binaries (no node-gyp) | MIT |
| `yaml` | ^2.9.0 | scripts, api | Content parsing, spec output | ISC |

**`packages/core` has none of these.** That is the point.

### Infrastructure

| Service | Image | Container | Host port |
|---|---|---|---|
| PostgreSQL 16 | `postgres:16-alpine` | `ubuntuntu_postgres` | **5433** |
| Redis 7 | `redis:7-alpine` | `ubuntuntu_redis` | 6379 |
| MinIO | `minio/minio` | `ubuntuntu_storage` | 9000 / 9001 |

Database `ubuntuntu_dev`, user `ubuntuntu_admin` — the naming convention from
the project brief §3D.

**Postgres runs on host port 5433, not 5432**, and is pinned to `locale=C`. Both
are load-bearing; see §8.

**Current running cost: $0.00.** Everything is local and open source. See
[10-DEPENDENCIES.md](10-DEPENDENCIES.md) for the full ledger including what each
dependency costs at scale and what replaces it if abandoned.

---

## 5. Commands

```bash
# Infrastructure
pnpm docker:up            # start postgres, redis, minio
pnpm docker:health        # assert all three healthy (gates migrations)
pnpm docker:down

# Database and content
pnpm migrate              # apply pending migrations, verify required tables
pnpm migrate:status       # report without applying
pnpm seed                 # compile content/*.yaml into Postgres
pnpm build:bundles        # build + publish content-addressed bundles
pnpm db:reset             # migrate + seed + build

# Verification
pnpm verify               # typecheck + purity + content + coverage
pnpm typecheck
pnpm check:purity         # ADR-0002 enforcement
pnpm validate:content     # NFR-052 content gate
pnpm test:coverage        # packages/* only, 100% threshold
pnpm test:integration     # apps/api, requires the stack

# Generated documentation
pnpm schema:dump                            # docs/SCHEMA.sql
pnpm --filter @ubuntu-ntu/api openapi       # docs/OPENAPI.yaml
```

---

## 6. Database

16 tables across six migrations. `docs/SCHEMA.sql` is **generated** from the
live database (`pnpm schema:dump`) and CI fails if it is stale.

| Migration | Adds |
|---|---|
| `0001_initial` | Languages, dialects, skills, lessons, vocabulary, exercises, users, refresh tokens, FSRS cards + logs, bundles |
| `0002_vocabulary_image` | Image support ([ADR-0008](adr/0008-visual-learning.md)) |
| `0003_fsrs_double_precision` | `REAL` → `DOUBLE PRECISION` — float4 was truncating FSRS values (§8) |
| `0004_geographic_locking` | Country scoping, `verified_dialects`, contributions, votes |
| `0005_content_model_gaps` | Register/honorifics, proverbs, learner profiles, UI locale |
| `0006_bundle_payload` | Bundle payload storage — the content-delivery link |

### Three classes of data, deliberately separate

| Class | Source of truth | Recoverable? |
|---|---|---|
| **Content** | `content/*.yaml` in git | Yes — drop and re-seed freely |
| **Progress** | `fsrs_review_logs` (append-only) | **No** — irreplaceable |
| **Contributions** | Postgres | **No** — community-contributed |

`user_fsrs_cards` is *derived* — recomputed by replaying the log. Deleting it
loses nothing.

---

## 7. Architectural decisions

| ADR | Decision | Status |
|---|---|---|
| [0001](adr/0001-device-database.md) | expo-sqlite + Drizzle over WatermelonDB | Accepted |
| [0002](adr/0002-shared-learning-core.md) | One shared learning core | Accepted |
| [0003](adr/0003-event-sourced-sync.md) | Event-sourced progress sync | Accepted |
| [0004](adr/0004-content-as-code.md) | Content as version-controlled text | Accepted |
| [0005](adr/0005-defer-realtime-pitch.md) | Defer real-time pitch streaming | Accepted |
| [0006](adr/0006-fsrs-formula.md) | Canonical FSRS-4.5 formula | Accepted |
| [0007](adr/0007-web-platform.md) | Web as a first-class surface | Accepted |
| [0008](adr/0008-visual-learning.md) | Image-based visual learning | Accepted |
| [0009](adr/0009-geographic-locking.md) | Country-based geographic locking | Accepted — one flag open |

### The three that shape everything

**One shared core.** FSRS runs identically on device and server because it is
literally the same module. Divergence is structurally impossible rather than
merely unlikely.

**Progress is an event log.** The client sends immutable events; the server
replays them. Two devices offline simultaneously converge with nothing lost — no
CRDTs, no merge logic, because events commute under deterministic replay.

**Content is code.** Lessons are YAML in git, validated in CI, compiled into
Postgres. A linguist corrects a tone through a pull request. The contributor
portal is not a prerequisite for content work.

Each was made for its own reason, and together they made web (ADR-0007) and the
bundle installer nearly free.

---

## 8. Hazards found and fixed

Recorded because most would recur on another machine or another project.

**Native PostgreSQL owned port 5432.** A Windows `postgresql-x64-16` service was
bound to `0.0.0.0:5432` and won over Docker's mapping. Our container now
publishes **5433**.

**A machine-wide `DATABASE_URL` hijacked migrations.** A user-level variable
pointing at an unrelated `inventorydb` was read before `.env`. That database had
its own `users` table, so the symptom was `relation "users" already exists` — a
*schema* error masking a *configuration* error. Tooling now reads
`UBUNTU_NTU_DATABASE_URL` and never the bare name. A wrong-database guard
refuses to proceed when the target holds tables this project does not own.

**`REAL` silently truncated every FSRS value.** Client computed
`44.050762910497404`; Postgres float4 stored `44.050762`. The scheduling impact
was ~0.08 ms — negligible. The *class* of defect was not: client and server were
no longer bit-identical, the exact divergence ADR-0002 exists to prevent. The
tempting fix was loosening the assertion to `toBeCloseTo`, and a weakened
equality test is precisely how a real divergence later goes unnoticed. Schema
fixed instead (migration 0003) and the assertions **tightened** to exact equality.

**The FSRS formula in ADR-0006 was wrong.** The draft wrote the exponent as
`^(-1/DECAY)`, which with `DECAY = -0.5` evaluates to `^2` — a curve that
*increases* without bound. Caught by verifying against the FSRS reference
specification before writing code, which that same ADR had committed to doing.

**Postgres collation.** Pinned to `locale=C`. Event replay sorts by `reviewedAt`
with `eventId` as tiebreaker; locale-dependent collation would make that ordering
differ between machines, so a developer on a different locale would derive
different scheduling from the same log.

**Windows encoding traps.** PowerShell `-Encoding utf8` writes a BOM, which broke
`package.json` parsing, and a `Get-Content`/`Set-Content` round-trip mangled
UTF-8 Gĩkũyũ diacritics into mojibake. File-writing tools are used for content
now, not shell round-trips.

**Backticks in a SQL comment** inside a JavaScript template literal terminated
the string. Cosmetic, instantly fatal, and worth remembering.

---

## 9. What is verified, and how

| Property | Verified by |
|---|---|
| FSRS is correct | 128 unit tests; constants checked against the reference spec; `(1+FACTOR)^DECAY = 0.9` asserted directly |
| Core cannot diverge | CI purity check: zero imports, no clock, no randomness |
| A review is never lost | Crash simulation in both directions across the card/outbox transaction |
| Ingestion is idempotent | Identical batch posted twice and five times → identical state, exact row counts |
| Devices converge | Two users given the same events in **opposite order** → identical stability, difficulty, reps, lapses |
| Client and server agree | Round trip asserts **exact** float equality, not approximate |
| Offline actually works | Aeroplane mode → review → failed sync → reconnect → server matches device |
| Content reaches devices | Build → manifest → download → sha256 verify → install → learn offline |
| Corrupt content is refused | Truncated download over the real transport → `BUNDLE_HASH_MISMATCH`, nothing written |
| Progress survives content ops | Reinstall and remove leave cards and outbox untouched |
| Geographic locking holds | KE user blocked from NG dialect on upload, vote, and queue; nothing written |
| Bad content cannot merge | Broken YAML, misaligned gloss, missing tone label all fail CI |
| Specs cannot drift | CI regenerates `OPENAPI.yaml` and `SCHEMA.sql` and fails on any diff |

---

## 10. Open items

| Item | Type | Blocking |
|---|---|---|
| **`ALLOW_DIASPORA_CONTRIBUTIONS` on or off** | Governance decision | Contribution launch |
| **Android Studio + SDK + emulator** (~8 GB) | Environment | M4 device gate, M5 |
| Pilot language confirmation with a community | Partnership | Real content |
| Designated linguistic authority for `ki-central` | Partnership | **Publishing any lesson** |
| Legal review of [09-DATA-GOVERNANCE.md](09-DATA-GOVERNANCE.md) | Review | Data collection |
| Citable sources for endangerment figures | Research | External publication |
| Profile-keyed progress (phase 2 of migration 0005) | Engineering | Family sharing |
| Audio files — no recordings exist yet | Content | Every audio feature |
| Image assets + exercise types | Engineering | M7 |

**All pilot content is `validated: false` and the dialect authority is `null`.**
Two independent CI gates keep it unpublishable. It exists to exercise the
pipeline, not to teach anyone Gĩkũyũ.

---

## 11. Where to look next

| You want | Read |
|---|---|
| Why something is built this way | [adr/](adr/) |
| What the system is for | [01-VISION.md](01-VISION.md) |
| A plain-language explanation | [03-ECOSYSTEM-OVERVIEW.md](03-ECOSYSTEM-OVERVIEW.md) |
| Numbered requirements | [04-SRS.md](04-SRS.md) |
| System design | [05-ARCHITECTURE.md](05-ARCHITECTURE.md) |
| What happens next | [06-TECHNICAL-ROADMAP.md](06-TECHNICAL-ROADMAP.md) |
| How to author a lesson | [07-CONTENT-MODEL.md](07-CONTENT-MODEL.md) |
| How sync works | [08-SYNC-PROTOCOL.md](08-SYNC-PROTOCOL.md) |
| Rights and consent | [09-DATA-GOVERNANCE.md](09-DATA-GOVERNANCE.md) |
| Costs and licences | [10-DEPENDENCIES.md](10-DEPENDENCIES.md) |
| Mobile vs web | [12-PLATFORM-STRATEGY.md](12-PLATFORM-STRATEGY.md) |
