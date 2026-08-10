# ADR-0007: Web as a first-class learner surface

**Status:** Accepted
**Date:** 2026-08-10
**Supersedes:** the "no web learner app" entry in [01-VISION.md §5](../01-VISION.md)
**Requirements:** FR-200 – FR-215, NFR-070 – NFR-076

## Context

The initial documentation scoped UBUNTU-NTU as mobile-only, Android-first, and listed a
web learner application under *explicitly not building*. The stated reason was that
offline-first mobile is the hard requirement and web would dilute it.

That reasoning was wrong in two respects.

**First, it conflated "web" with "online-only."** Modern browsers support Service
Workers, Cache Storage, IndexedDB, and the Origin Private File System. A well-built PWA
is genuinely offline-capable — not as a degraded fallback, but properly. The offline
requirement does not exclude web; it constrains how web is built.

**Second, it mismatched surfaces to audiences.** Our two primary audiences use different
devices:

| Audience | Primary device | Why |
|---|---|---|
| Urban African youth | Mid-range Android | Mobile-dominant market; data-conscious |
| **Global diaspora** | **Laptop / desktop, plus mobile** | Home broadband; parents supervising children; school computers |

The diaspora segment is also the intended monetisation engine
([02-CONCEPT-NOTE.md §8](../02-CONCEPT-NOTE.md)). Serving it only through a Play Store
install adds friction precisely where willingness to pay is highest.

**Third, and practically:** a web surface removes install friction for trial entirely. A
link works; an APK download does not. For a project seeking language-community partners
and institutional interest, being able to send someone a URL matters.

## Decision

**Ship three surfaces, sharing logic but not user interface.**

| Surface | Technology | Audience |
|---|---|---|
| `apps/mobile` | Expo / React Native, Android-first | Primary learners on the continent |
| `apps/web` | React + Vite, installable PWA | Diaspora, desktop learners, zero-friction trial |
| `apps/studio` | React + Vite (may merge into `apps/web`) | Contributors and validators |

**Shared:** `packages/core` (FSRS, tone maths, glossing) and `packages/schema` (Drizzle
definitions, Zod contracts).

**Not shared:** UI components. Written twice, deliberately.

## Consequences

### Positive

- **`packages/core` already works on web with no modification.** It is pure TypeScript
  with zero imports ([ADR-0002](0002-shared-learning-core.md)) — the constraint that made
  it portable between phone and server makes it portable to the browser for free. This is
  the discipline paying off a second time.
- **The sync protocol needs no changes at all.** Event-sourced progress
  ([ADR-0003](0003-event-sourced-sync.md)) is device-agnostic: a third client type is
  just another source of events, and cross-device convergence already works by
  construction. A learner reviewing on a laptop and a phone converges correctly with no
  new logic.
- **`packages/schema` transfers directly.** Drizzle's SQLite dialect targets both
  `expo-sqlite` on device and SQLite-WASM over OPFS in the browser. One schema
  definition, three runtimes.
- **Batch pitch analysis works identically on web.**
  [ADR-0005](0005-defer-realtime-pitch.md) chose record-then-analyse over real-time
  streaming. That decision, made for risk reasons, means the analysis runs on a finished
  buffer — which the Web Audio API provides as readily as the native layer. Had we chosen
  real-time streaming, web would have required a second custom implementation.
- Web reaches users on locked-down devices, school computers, and anywhere an install is
  not possible.
- The contributor studio gains a natural home.

Three prior decisions — pure core, event sourcing, batch pitch — each made for unrelated
reasons, together make web nearly free. That is not luck; it is what architectural
discipline is for.

### Negative

- **UI is implemented twice.** This is the real cost, and it is significant — perhaps
  30–40% additional front-end effort. Accepted for the reasons in *Alternatives* below.
- Two build pipelines, two test setups, two release processes.
- Browser storage is evictable. Unlike a native app, a browser may clear site data under
  storage pressure. Mitigated by requesting persistent storage and by syncing promptly,
  but not eliminated — and this must be disclosed honestly to users
  (see [12-PLATFORM-STRATEGY.md](../12-PLATFORM-STRATEGY.md)).
- Microphone permission on web is per-origin and less persistent than native.
- iOS Safari PWA support has historically lagged, particularly around storage persistence
  and background behaviour.

### Neutral

- Web is not the priority surface. Mobile remains first for the primary audience; web
  follows.

## Alternatives considered

**React Native Web — one codebase for both** — Rejected, and this was the closest call.

It would eliminate the duplicated UI, which is the whole cost of this decision. Rejected
because our pitch contour rendering uses React Native Skia, and Skia on web means
shipping CanvasKit: roughly 6–7 MB of WebAssembly before any application code. That
directly contradicts the data-economy principle that governs this entire project
([NFR-010 – NFR-014](../04-SRS.md)). Asking a diaspora user on good broadband to accept
that is defensible; making it the architecture is not.

Additionally, the two surfaces genuinely want different interfaces. Web has a keyboard, a
large viewport, no install step, and a user likely sitting down for a longer session.
Forcing a shared component tree would compromise both.

On web, contour rendering uses plain SVG — sufficient because
[ADR-0005](0005-defer-realtime-pitch.md) already committed to batch rendering rather than
60 fps streaming. A static path needs no Skia.

**Web-only, drop mobile** — Rejected. The primary audience is mobile-dominant, and PWA
storage on Android is evictable in ways that undermine the offline guarantee for users
who need it most.

**Web as an online-only companion** — Rejected. Offline is a project principle, not a
platform-specific feature. A surface that abandons it teaches users the app is
unreliable.

**Defer web entirely to post-pilot** — Rejected, but it was reasonable. The deciding
factor is that web unlocks the paying segment and zero-friction trial, and the marginal
cost is low because the shared packages already exist. Web is nevertheless sequenced
*after* the mobile walking skeleton (M4) — see
[06-TECHNICAL-ROADMAP.md](../06-TECHNICAL-ROADMAP.md).

## Revisit when

- If UI duplication proves more costly than estimated, reconsider a shared headless
  component layer (shared hooks and state, separate rendering).
- If browser storage eviction proves to affect real users materially, reposition web as
  online-first with offline as a bonus, and say so plainly.
