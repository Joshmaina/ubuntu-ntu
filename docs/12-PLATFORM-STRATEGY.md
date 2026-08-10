# Platform Strategy — Web and Mobile

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Developers, and anyone asking "where does this actually run?"
> **Decision record:** [ADR-0007](adr/0007-web-platform.md)

---

## 1. Three surfaces

| Surface | Technology | Primary audience | Offline | Priority |
|---|---|---|---|---|
| **Mobile app** | Expo / React Native, Android-first | Learners on the continent | Full, guaranteed | **1st** |
| **Web app (PWA)** | React + Vite, installable | Diaspora, desktop learners, trial | Full, best-effort* | **2nd** |
| **Contributor studio** | React + Vite | Native speakers, linguists, validators | Online | 3rd |

\* *Best-effort* is a deliberate and honest distinction. See §5.

---

## 2. What is shared, and what is not

```text
                    ┌──────────────────────────────┐
                    │      packages/core           │
                    │  FSRS · tone maths · gloss   │
                    │   ZERO imports · pure TS     │
                    └──────────────┬───────────────┘
                                   │  identical code, three runtimes
              ┌────────────────────┼────────────────────┐
              │                    │                    │
       ┌──────┴──────┐      ┌──────┴──────┐      ┌──────┴──────┐
       │   MOBILE    │      │     WEB     │      │   SERVER    │
       │             │      │             │      │             │
       │ React Native│      │ React + Vite│      │  Fastify    │
       │ Skia        │      │ SVG         │      │             │
       │ expo-sqlite │      │ SQLite-WASM │      │ PostgreSQL  │
       │ expo-av     │      │ Web Audio   │      │             │
       └─────────────┘      └─────────────┘      └─────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │     packages/schema          │
                    │  Drizzle (pg + sqlite) · Zod │
                    └──────────────────────────────┘
```

### Shared — written once

| Package | Contents | Why it transfers |
|---|---|---|
| `packages/core` | FSRS scheduling, pitch/semitone maths, gloss parsing, validation | Pure TypeScript, zero imports ([ADR-0002](adr/0002-shared-learning-core.md)) |
| `packages/schema` | Drizzle tables, Zod contracts, API types | Drizzle's SQLite dialect targets both `expo-sqlite` and SQLite-WASM |
| Sync protocol | Event outbox, ingestion, replay | Device-agnostic by design ([ADR-0003](adr/0003-event-sourced-sync.md)) |

**This is roughly 60% of the difficult logic, and it costs nothing to extend to web.**
Not by luck — the constraints that made `packages/core` portable between phone and server
([ADR-0002](adr/0002-shared-learning-core.md)) are exactly the constraints that make it
run in a browser.

### Not shared — written twice

UI components, navigation, platform storage adapters, audio capture, and rendering. This
is a deliberate cost, justified in [ADR-0007](adr/0007-web-platform.md): React Native Web
would unify them but requires shipping ~6–7 MB of CanvasKit WASM for Skia, which
contradicts the data-economy constraints this project is built around.

---

## 3. Platform capability mapping

The same feature, implemented natively per surface:

| Capability | Mobile | Web |
|---|---|---|
| Local database | `expo-sqlite` + Drizzle | SQLite-WASM over OPFS + Drizzle |
| Offline shell | Native app | Service Worker + Cache Storage |
| Lesson bundles | Filesystem | Cache Storage API |
| Audio playback | `expo-av` | Web Audio API (`<audio>` + AudioContext) |
| Audio recording | `expo-av` recorder | `MediaRecorder` + `getUserMedia` |
| Pitch analysis | YIN over completed buffer | **Identical algorithm**, Web Audio `AudioBuffer` |
| Contour rendering | React Native Skia | SVG path |
| Secure token storage | Platform Keystore | `httpOnly` cookie + in-memory access token |
| Install | Play Store | PWA install prompt |
| Notifications | Local notifications | Notification API (where permitted) |

**Pitch analysis being identical is a direct dividend of
[ADR-0005](adr/0005-defer-realtime-pitch.md).** Because we chose to analyse a *completed
recording* rather than stream in real time, the input is simply a buffer of samples —
available on both platforms through ordinary APIs. Had we chosen real-time streaming, web
would have required an entirely separate AudioWorklet implementation with its own timing
characteristics and its own bugs.

---

## 4. Offline on the web — how it actually works

```text
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  ┌────────────────┐   ┌──────────────────────────────────┐  │
│  │ Service Worker │   │  Origin Private File System      │  │
│  │                │   │  ┌────────────────────────────┐  │  │
│  │ • app shell    │   │  │ SQLite-WASM database       │  │  │
│  │ • intercepts   │   │  │  cards · outbox · settings │  │  │
│  │   fetch        │   │  └────────────────────────────┘  │  │
│  └────────────────┘   └──────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Cache Storage — lesson bundles, audio (Opus)        │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

1. **App shell** is precached by the Service Worker on first visit. Subsequent loads work
   with no network.
2. **Lesson bundles and audio** go into Cache Storage — the same immutable,
   content-addressed bundles the mobile app downloads.
3. **User data** lives in SQLite-WASM persisted to OPFS, using the identical Drizzle
   schema as mobile.
4. **The review outbox** behaves exactly as on mobile: events queue locally and sync
   opportunistically.

Answer checking, FSRS scheduling, audio playback, recording, and pitch analysis all run
with no network — the same guarantees as mobile, through different APIs.

---

## 5. Where web is genuinely weaker

Stated plainly, because a user relying on offline access deserves to know.

| Limitation | Reality | Our response |
|---|---|---|
| **Storage is evictable** | Browsers may clear site data under storage pressure. A native app's data is not touched this way. | Request `navigator.storage.persist()`; sync promptly; **warn the user if persistence is denied** |
| iOS Safari PWA constraints | Historically weaker storage persistence and background behaviour | Test explicitly; treat iOS web as online-leaning until verified |
| Microphone permission | Per-origin, may be re-prompted | Request only when needed, with clear explanation |
| No true background sync | Limited compared to native | Sync on visibility change and on app open |
| Larger initial download | App shell plus WASM SQLite | Aggressive code splitting; budget in NFR-072 |

**We do not claim identical offline guarantees on web.** Mobile offline is *guaranteed*;
web offline is *best-effort*, and the app says so where it matters. Overpromising here
would break trust with exactly the users for whom offline is not a convenience but a
requirement — and those users are on mobile anyway.

---

## 6. Which surface for whom

| User | Surface | Reason |
|---|---|---|
| Urban African youth | **Mobile** | Mobile-dominant market; guaranteed offline; data economy |
| Diaspora parent | **Web** | Desktop, supervising a child, no install friction |
| Diaspora child | **Mobile or web** | Whatever they already use |
| Someone trying it out | **Web** | A link works; an APK download is a decision |
| School / institution | **Web** | Shared and locked-down computers, no install rights |
| Contributor recording audio | **Mobile or studio** | Better microphones on phones; studio for batch work |
| Linguist validating | **Studio** | Keyboard, large screen, batch review |
| Rural learner, poor connectivity | **Mobile** | Guaranteed offline; peer-to-peer bundle sharing (future) |

---

## 7. Sequencing

Web follows the mobile walking skeleton, not in parallel with it. The M4 gate exists to
prove the architecture end to end; proving it twice at once would mean debugging two
unproven surfaces simultaneously.

| Milestone | Surface |
|---|---|
| M0 – M4 | Mobile only — prove the architecture |
| M5 – M7 | Mobile feature breadth |
| **M9** | **Web PWA — learner app** |
| M10 | Contributor studio |

Once M4 passes, web is substantially cheaper than it looks: the sync protocol, FSRS,
schema, and pitch analysis are already written and tested. What remains is UI, storage
adapters, and audio plumbing.

---

## 8. Deliberately not doing

| Not doing | Why |
|---|---|
| React Native Web | ~6–7 MB CanvasKit WASM contradicts the data-economy constraint ([ADR-0007](adr/0007-web-platform.md)) |
| Electron desktop app | The PWA is installable and covers this need |
| iOS native app (for now) | Requires paid developer programme and macOS hardware; web serves iOS users in the interim |
| Separate mobile web layout | The PWA is responsive; one web codebase serves all viewports |
| Server-side rendering | The app is offline-first and behind authentication; SSR adds complexity for no benefit. **The marketing site is separate and static.** |

---

## 9. Testing

| Concern | Approach |
|---|---|
| Shared logic | Tested once in `packages/core` — runtime-independent |
| Sync convergence | **Cross-platform test: review on web, review on mobile, verify convergence** |
| Web offline | Playwright with network disabled |
| Storage eviction | Simulate OPFS clearing; verify graceful recovery and clear messaging |
| Pitch parity | Identical audio input through both pipelines must produce identical contours |

The pitch-parity test matters more than it appears: if web and mobile disagree on a
learner's contour, the same person gets different feedback on different devices for the
same pronunciation. Since both call the same `packages/core` function, any divergence
indicates a fault in audio capture or resampling, not in the algorithm — which makes the
test a precise diagnostic.
