# Dependency & Cost Ledger

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers, and anyone asking "what does this cost to run?"
> **Standing rule:** **Phases 0–2 incur zero cost.** Nothing requiring a payment card
> may be introduced without an explicit decision recorded here.

Every dependency records: what it does, its licence, cost now, cost at scale, and **what
replaces it if it disappears.** That final column is the discipline — it forces us to
notice which choices are genuinely load-bearing.

---

## 1. Current total cost

| Phase | Monthly cost | Notes |
|---|---|---|
| **Phase 0–2 (now)** | **$0.00** | Everything local and open source |
| Phase 3 (contribution) | ~$0–15 | Storage and hosting begin; largely within free tiers |
| Phase 4 (public pilot) | ~$25–70 | Depends on adoption; see §6 |

The zero figure is not aspirational — it is architecturally enforced. Every capability
that will eventually cost money sits behind a port with a working free adapter (see
[05-ARCHITECTURE.md §10](05-ARCHITECTURE.md)).

---

## 2. Development toolchain — all free

| Tool | Purpose | Licence | Cost | Replacement if it dies |
|---|---|---|---|---|
| Node.js ≥ 20 | Runtime | MIT | $0 | Bun, Deno |
| pnpm | Package manager | MIT | $0 | npm (slower, workable) |
| Turborepo | Monorepo orchestration | MPL-2.0 | $0 | Nx, or plain pnpm scripts |
| TypeScript | Language | Apache-2.0 | $0 | None — foundational, accepted risk |
| Vitest | Testing (core, API) | MIT | $0 | Jest |
| ESLint + Prettier | Lint, format | MIT | $0 | Biome |
| Docker Desktop | Local infrastructure | Free for individuals & small business* | $0 | Podman, Rancher Desktop |
| Git + GitHub | VCS, CI, review | — | $0 (free tier) | GitLab, Codeberg |

\* Docker Desktop is free for personal use, education, and organisations under 250
employees **and** under $10M annual revenue. We currently qualify. **If the project
incorporates and grows past those thresholds, a licence becomes required** — hence
Podman as the recorded escape route.

---

## 3. Backend — all free

| Package | Purpose | Licence | Cost | Replacement |
|---|---|---|---|---|
| Fastify | HTTP framework | MIT | $0 | Express, Hono |
| Drizzle ORM | DB access, both PG and SQLite | Apache-2.0 | $0 | Kysely + hand-written SQL |
| Zod | Schema validation | MIT | $0 | Valibot, ArkType |
| argon2 | Password hashing | MIT | $0 | scrypt (Node built-in) |
| jose | JWT | MIT | $0 | Hand-rolled with node:crypto |
| pino | Logging | MIT | $0 | Any |

---

## 4. Infrastructure — free locally

| Service | Image | Licence | Local | At scale |
|---|---|---|---|---|
| PostgreSQL 16 | `postgres:16-alpine` | PostgreSQL Licence | $0 | Managed: ~$7–25/mo |
| Redis 7 | `redis:7-alpine` | RSALv2/SSPL* | $0 | Managed: ~$0–10/mo |
| MinIO | `minio/minio` | AGPL-3.0 | $0 | Replaced by R2/S3 |

\* Redis relicensed away from BSD in 2024. For our usage (caching, rate limiting,
leaderboards) this is immaterial, but **Valkey** — the BSD-licensed fork — is a drop-in
replacement and is the recorded escape route if licensing becomes a concern.

---

## 5. Mobile — free

| Package | Purpose | Licence | Cost | Notes |
|---|---|---|---|---|
| Expo SDK | RN framework | MIT | $0 | **Local builds only.** EAS cloud builds have a limited free tier we deliberately avoid depending on |
| React Native | Framework | MIT | $0 | |
| `@shopify/react-native-skia` | 2D rendering | MIT | $0 | Pitch contour rendering |
| `react-native-reanimated` | Animation | MIT | $0 | Off-thread animation |
| `expo-sqlite` | On-device DB | MIT | $0 | |
| `expo-av` / `expo-audio` | Playback, recording | MIT | $0 | |
| Android Studio | Build, emulator | Free | $0 | Large download; free |

**Critical constraint:** we build locally with `expo run:android`. Depending on EAS cloud
builds would introduce a cost and a queue we cannot control.

---

## 6. Deferred paid services

Each has a **working free adapter today** and a **dormant paid adapter** written but
unwired.

| Capability | Free adapter (live) | Paid adapter (dormant) | Cost when enabled |
|---|---|---|---|
| Object storage | MinIO, local | Cloudflare R2 | **$0 within free tier** — 10 GB storage, zero egress fees. May never cost anything at our scale |
| Database hosting | Docker Postgres | Neon / Supabase / managed PG | $0 free tier → ~$25/mo |
| CDN | None needed locally | Cloudflare | $0 free tier |
| Domain | — | Registrar | ~$10–15/yr |
| Speech recognition | **None — stubbed** | Hosted fine-tuned Whisper | ~$50+/mo — deferred indefinitely |
| Push notifications | Local scheduled notifications | FCM | $0 |
| SMS / OTP | Not built | Africa's Talking, Twilio | Per-message — avoided entirely |
| Error tracking | Console + logs | Sentry | $0 free tier |
| Play Store listing | — | Google Play Console | **$25 one-time** |
| App Store listing | — | Apple Developer | **$99/year** — the reason iOS is deferred |

### Realistic first paid expense

**Google Play Console — $25, one time, at public release.** Everything before that point
is genuinely free. Cloudflare R2's free tier (no egress charges) may carry us through the
pilot at zero cost.

---

## 7. Not adopted, and why

| Rejected | Reason |
|---|---|
| Auth0 / Clerk / Firebase Auth | Recurring cost; ~200 lines of code replaces it |
| Vercel / Netlify hosting | Free tiers are generous but create lock-in; a plain container is portable |
| Supabase as full backend | Convenient, but couples us to one vendor's model of the world |
| PowerSync / ElectricSQL | Excellent products, but paid, and our sync design (event-sourced) is deliberately simple |
| Algolia / hosted search | Not needed; Postgres full-text search is sufficient |
| Third-party analytics | Privacy commitment ([09-DATA-GOVERNANCE.md §9](09-DATA-GOVERNANCE.md)) |
| Any advertising SDK | Explicitly forbidden by governance policy |

---

## 8. Licence compliance

| Licence | Present in | Obligation | Status |
|---|---|---|---|
| MIT / Apache-2.0 / BSD | Most dependencies | Attribution | ✅ Compatible |
| AGPL-3.0 | MinIO | Network-use copyleft | ⚠️ **See below** |
| MPL-2.0 | Turborepo | File-level copyleft | ✅ Build tool only |
| RSALv2 | Redis | Restricts offering Redis-as-a-service | ✅ Not applicable; Valkey available |

> **AGPL note on MinIO.** MinIO is used as a *local development service*, unmodified,
> and is not distributed as part of our application. This is standard usage and does not
> impose copyleft on our code. Were we ever to modify MinIO or offer it as a network
> service, obligations would apply. **The production path replaces MinIO with R2/S3
> entirely**, so this is a development-only consideration. Flagged here so it is not
> discovered late.

---

## 9. Adding a dependency

Required before any new dependency is introduced:

- [ ] Is it genuinely necessary, or is this ~50 lines of our own code?
- [ ] Licence compatible with Apache-2.0 distribution?
- [ ] Maintained — commits within the last 12 months?
- [ ] Cost at zero users and at 10,000 users?
- [ ] What replaces it if it is abandoned?
- [ ] Added to this ledger?

**`packages/core` accepts no dependencies at all.** This is enforced in CI, not merely
requested (NFR-060).

---

## 10. Escape-hatch summary

If everything went wrong simultaneously, the migration path:

| Loss | Response | Difficulty |
|---|---|---|
| Docker Desktop licence change | Podman | Low |
| Expo direction change | Bare React Native | Medium |
| Redis licence concerns | Valkey | Trivial |
| GitHub | Codeberg / GitLab | Low |
| Cloudflare | Any S3-compatible provider | Low — port abstraction exists |
| Turborepo | Plain pnpm scripts | Low |

No dependency is load-bearing in a way we cannot recover from within a sprint. That is
the point of maintaining this column.
