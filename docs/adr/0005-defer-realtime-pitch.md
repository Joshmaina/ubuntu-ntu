# ADR-0005: Defer real-time pitch streaming

**Status:** Accepted
**Date:** 2026-08-10
**Requirements:** FR-060 – FR-069, NFR-004, NFR-005

## Context

Tone feedback is the project's principal differentiator. The original blueprint specified
a **live** pitch contour: as the learner speaks, their pitch curve draws in real time
against the native reference.

Implementing that properly requires:

- A custom C++/JSI TurboModule — JavaScript cannot process 16 kHz PCM frames at the
  required rate without dropping frames
- Continuous YIN estimation on a background thread
- Lock-free hand-off from the audio thread to the render thread
- Sustained 60 fps Skia rendering on a 2 GB Android device (NFR-005)

This is our highest-risk technical work. It involves native code on both platforms,
real-time audio constraints, and performance targets on low-end hardware — with debugging
difficulty to match.

Meanwhile the underlying product hypothesis is **unvalidated**. We believe seeing your
pitch contour improves tonal pronunciation. We have not demonstrated it (Q6 in
[01-VISION.md](../01-VISION.md)).

Building the hardest version of a feature before establishing that the feature works is
the wrong order.

## Decision

**Version 1 analyses a completed recording, not a live stream.**

```
tap record → speak → tap stop → analyse (~200 ms) → render contour vs. reference
```

Requirement: contour renders within 300 ms of recording ending (NFR-004).

The analysis pipeline is identical — YIN, confidence gating, semitone normalisation,
smoothing. Only the *timing* differs: batch rather than streaming.

Real-time streaming is preserved as FR-069 at priority P2, behind the same interface,
implementable later without disturbing the surrounding design.

## Consequences

### Positive

- **No native module required for v1.** Analysis runs in JavaScript or WASM on a
  finished buffer, where there is no real-time deadline.
- Dramatically lower risk. A batch computation that takes 250 ms instead of 200 ms is a
  minor issue; a streaming pipeline that drops frames is a broken feature.
- **The core hypothesis gets tested sooner and more cheaply.** We learn whether contour
  feedback works before investing weeks in the sophisticated version.
- Batch analysis can be more accurate — the full utterance is available, permitting
  smoothing and octave-error correction that a causal streaming algorithm cannot do.
- The learner's attention is arguably better placed on speaking than on watching a line
  draw itself. **This may prove to be pedagogically superior, not merely cheaper** — we
  do not know, and that is a reason to test rather than assume.

### Negative

- Less immediately impressive. A live drawing curve demonstrates well.
- No mid-utterance correction — the learner completes the phrase before seeing feedback.
- The eventual streaming implementation is not free work saved; it is deferred work.

### Neutral

- The analysis code is shared between both modes, so the deferred work is confined to the
  audio transport and rendering path.

## Alternatives considered

**Build real-time from the start** — Rejected. Highest-risk component, built before its
value is demonstrated, on the critical path to launch.

**Third-party pitch libraries (e.g. `react-native-pitchy`)** — Considered. Small
libraries with limited maintenance history and unclear behaviour on low-end Android.
Adopting one for a flagship feature creates a dependency we cannot debug. **Reconsider
for the streaming upgrade** if a well-maintained option exists at that point.

**Server-side pitch analysis** — Rejected outright. Violates offline operation (FR-068),
requires uploading learner voice recordings (contradicting FR-070 and our privacy
commitment in [09-DATA-GOVERNANCE.md §9](../09-DATA-GOVERNANCE.md)), and adds latency and
cost.

**Skip pitch feedback entirely for v1** — Rejected. It is the differentiator. Deferring
the *implementation sophistication* is prudent; deferring the *feature* would leave us
building a conventional language app.

## Revisit when

- M6 validates that contour feedback measurably improves pronunciation, **and**
- User research indicates the delay between speaking and seeing feedback is a real
  impediment
