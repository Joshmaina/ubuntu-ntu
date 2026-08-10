# Technical Roadmap & Developer Workflow

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers building the system.
> **Companion docs:** [05-ARCHITECTURE.md](05-ARCHITECTURE.md) (design),
> [04-SRS.md](04-SRS.md) (requirements).

---

## 1. Build philosophy

**Build vertically, not horizontally.**

The common instinct is to complete each layer in turn: the whole database, then the
whole API, then the whole UI. That approach fails here, because you will not discover
that the sync protocol is broken until month five, by which point everything sits on top
of it.

Instead: a **walking skeleton**. One single exercise implemented end to end through
*every* layer — Postgres row → API → bundle → SQLite → FSRS → Skia render → offline
review → sync back. Ugly, unstyled, one card. When that card survives an aeroplane-mode
round trip, the architecture is *proven* and everything afterwards is filling in breadth
against a spine known to hold.

That is milestone **M4**, and it is the milestone that matters.

---

## 2. Milestones

Each gate is **binary**. Not "looks good" — it passes or the milestone is not complete.

| # | Milestone | Exit gate |
|---|---|---|
| **M0** | Foundation | `pnpm build` + `pnpm test` green in CI; three containers healthy; repo pushed |
| **M1** | Learning core | FSRS implemented TDD; 100% coverage enforced; zero imports verified |
| **M2** | Schema & content pipeline | Migrates clean from empty container; one YAML lesson lands in Postgres |
| **M3** | API surface | OpenAPI generated; duplicate event POST proven idempotent by test |
| **M4** | **Walking skeleton** | **Aeroplane mode: review 5 cards, force-close, reconnect → server state correct** |
| **M5** | Sentence Deconstruction | Four stages working with per-morpheme audio; pitch preserved in slow playback |
| **M6** | Pitch feedback | Contour renders ≤ 300 ms after recording stops, on reference device |
| **M7** | Exercise breadth | Six exercise types, all authorable in YAML, all CI-validated |
| **M8** | Engagement & hardening | Streak survives timezone change and offline gap |

---

## 3. Milestone detail

### M0 — Foundation

**Goal:** a repository that builds, tests, and runs its infrastructure. No features.

- `git init`, push to GitHub, branch protection on `main`
- pnpm workspaces + Turborepo; strict TypeScript base config
- `docker-compose.yml`: Postgres 16, Redis 7, MinIO — with health checks
- GitHub Actions: install → typecheck → lint → test → build
- Placeholder packages so the dependency graph is real from day one

**Gate:** CI green on a clean clone. `docker compose up` reports all three healthy.

**Why first:** a red build on day one is a nuisance; on day ninety it is a crisis. The
pipeline must exist before there is anything to break it.

---

### M1 — Learning core (`packages/core`)

**Goal:** the FSRS engine, exhaustively tested, dependency-free.

Strict TDD. Tests precede implementation — not as ceremony, but because FSRS is pure
mathematics with no I/O, making it the single most testable and most silently
error-prone component in the system.

- `types.ts` — `Card`, `Rating`, `State`, `ReviewLog`, `Parameters`
- `fsrs.ts` — initial stability/difficulty; difficulty update with mean reversion;
  three stability paths (recall / forget / same-day); retrievability; interval from
  desired retention
- `tone.ts` — Hz → relative semitones; EMA smoothing; contour deviation
- `gloss.ts` — morpheme alignment parsing

**Gate:** 100% line and branch coverage, enforced by threshold — not merely reported. CI
check confirms zero imports. All time-dependent functions take an explicit `now`.

**Note on the formula.** Canonical FSRS-4.5 retrievability is
`R(t,S) = (1 + FACTOR · t/S)^(-1/DECAY)` with `DECAY = -0.5`, `FACTOR = 19/81`. An
earlier brief specified exponent `-1`, which is a different and flatter forgetting curve
producing incorrect intervals. **We implement canonical unless explicitly overridden**,
and the chosen constant is recorded in an ADR.

---

### M2 — Schema and content pipeline

**Goal:** content flows from a text file into a queryable database.

- `packages/schema` — Drizzle definitions targeting Postgres *and* SQLite
- `scripts/migrate.ts` — ledger table, ordered execution, per-file transaction,
  checksum guard against files edited after application
- Zod schemas for lesson YAML
- `scripts/seed.ts` — YAML → validate → Postgres
- CI job validating every file under `content/`

**Gate:** from an empty container, `migrate` then `seed` completes, and a hand-authored
lesson is queryable. Deliberately malformed YAML fails CI.

---

### M3 — API surface

**Goal:** the minimum endpoints the skeleton requires.

- Auth: register, login, refresh with rotation, logout
- `GET /bundles/manifest`, `GET /bundles/:id`
- `POST /events` — idempotent batch ingestion
- OpenAPI generated from Fastify schemas
- Ports and adapters wired in `packages/config`

**Gate:** posting an identical event batch twice produces identical state — proven by an
automated test, not by inspection. OpenAPI generates and validates.

---

### M4 — Walking skeleton ★

**Goal:** prove the architecture end to end.

One exercise type. No styling. The full path: Postgres → bundle → download → SQLite →
FSRS → render → review offline → outbox → sync → server replay → convergence.

**Gate — the defining test of the project:**

1. Sign in, download a bundle
2. Enable aeroplane mode
3. Review five cards
4. Force-close the app
5. Reopen — state intact, still offline
6. Restore connectivity
7. Server state matches device state exactly; no event lost, none duplicated

**If this passes, the hard part is done.** Everything after M4 is breadth, and breadth is
predictable. Do not proceed past M4 until it passes cleanly and repeatably.

---

### M5 — Scaffolded Sentence Deconstruction

Four stages (FR-040 – FR-050), morpheme tap-to-hear, sentence assembly.

**Gate:** all four stages functional; slow playback verified to preserve pitch —
tested, not assumed, because getting this wrong invisibly destroys tonal information.

---

### M6 — Pitch feedback

Record → YIN → normalise → render against reference.

**Gate:** contour renders ≤ 300 ms after recording ends on the reference device (Android
8, 2 GB RAM), with unvoiced segments shown as breaks rather than zeroes.

**Also at M6:** the first honest test of the core product hypothesis (Q6 in
[01-VISION.md](01-VISION.md)). Does seeing the contour actually improve pronunciation?
Small cohort, before further investment. Be prepared for a negative result.

---

### M7 — Exercise breadth

Two types become six: multiple choice, sentence builder, audio match, tone match, spoken
pronunciation, flashcard.

**Gate:** every type authorable in YAML and validated in CI.

---

### M8 — Engagement and hardening

Streaks, XP, offline reconciliation, performance passes against NFR targets.

**Gate:** streak survives a timezone change and an offline gap without penalising the
user.

---

## 4. Working conventions

### Branching

```
main            protected; always green; always deployable
  └── feat/<milestone>-<short-description>
  └── fix/<short-description>
  └── content/<language>-<scope>
```

Content branches are deliberately separate so non-developers can contribute through
GitHub's web interface without touching code paths.

### Commits

Conventional Commits, citing requirement IDs where applicable:

```
feat(core): implement FSRS stability on recall  [FR-080]
fix(sync): dedupe events by client UUID          [FR-091]
docs(adr): record decision to defer realtime pitch
content(yo): add 12 market-vocabulary phrases
```

### Definition of done

A task is complete when **all** hold:

- [ ] Tests written and passing
- [ ] Typecheck and lint clean
- [ ] CI green
- [ ] Requirement IDs referenced
- [ ] Docs updated if behaviour changed
- [ ] `git diff` summary reported

### Testing strategy

| Layer | Tool | Standard |
|---|---|---|
| `packages/core` | Vitest | 100%, enforced by threshold |
| API | Vitest + supertest | All endpoints; idempotency explicitly tested |
| Content | Zod in CI | Every file, every push |
| Mobile logic | Jest (jest-expo) | Reducers, hooks, sync outbox |
| Mobile E2E | Manual until M8 | Aeroplane-mode scenario is mandatory |

Deliberately no visual-regression tooling before M8. It is high maintenance and low value
while the UI is still moving.

---

## 5. Local setup

**Prerequisites:** Node ≥ 20, pnpm ≥ 9, Docker Desktop, Android Studio + emulator
(from M4). All free.

```bash
git clone <repo> && cd ubuntu-ntu
pnpm install
docker compose up -d          # postgres, redis, minio
pnpm migrate                  # apply schema
pnpm seed                     # load content/
pnpm dev                      # api + mobile
```

```bash
pnpm test            # everything
pnpm test:core       # core only, watch mode
pnpm typecheck
pnpm validate:content
pnpm build:bundles
```

---

## 6. Sequencing rationale

**Why FSRS before the API.** It is pure, dependency-free, and the component most likely
to be silently wrong. Getting it exhaustively correct early means every later bug is
somewhere else.

**Why the skeleton before breadth.** It is the only way to discover architectural
mistakes while they are still cheap to fix.

**Why content tooling early (M2).** Content is the long pole. If authoring cannot begin
until month ten, launch slips by a year. Text files under version control mean content
work can proceed in parallel with all subsequent engineering.

**Why the contributor portal is absent from this roadmap.** Because
[ADR-0004](adr/0004-content-as-code.md) makes GitHub the portal for the first phase.
Building an authoring UI before the content model has settled guarantees rebuilding it.

**Why gamification is last.** Polish on a learning loop that does not yet work is wasted
effort. It is also the most tempting thing to build early, which is precisely why it is
scheduled last.

---

## 7. Dependencies between milestones

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──┬──► M5 ──┐
                                  │         ├──► M8
                                  ├──► M6 ──┤
                                  └──► M7 ──┘
```

M5, M6, and M7 are independent after M4 and may proceed in any order or in parallel.
Everything before M4 is strictly sequential.

---

## 8. What is deliberately not in this roadmap

| Deferred | Reason | Revisit |
|---|---|---|
| Contributor web studio | GitHub serves the purpose initially | After ~500 lessons exist |
| Speech recognition / ASR | Costs money; pitch comparison is the differentiator | When funded |
| Real-time streaming pitch | Highest technical risk, marginal added value | After M6 validates the hypothesis |
| iOS | Requires paid programme and macOS hardware | When funded |
| Leaderboards / social | Not learning-critical | Post-pilot |
| Peer-to-peer bundle sharing | High value, non-trivial; not blocking | Post-pilot |
| Monetisation | Premature before retention is demonstrated | Post-pilot |
