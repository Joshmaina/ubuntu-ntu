# ADR-0006: Canonical FSRS-4.5 retrievability formula

**Status:** **Accepted** — implemented and verified at M1
**Date:** 2026-08-10 · *Revised 2026-08-10 (downgraded from blocking)* ·
*Revised 2026-08-11 (formula corrected against the reference spec)*
**Requirements:** FR-080, FR-082

> **Revision note 1.** This ADR previously declared M1 blocked pending a decision. That
> was an overstatement and has been corrected. The choice is isolated to a single exported
> constant and is reversible in roughly two hours including regenerated fixtures. A
> reversible decision does not warrant blocking work — it warrants a documented default
> and a structure that makes reversal cheap.
>
> **Revision note 2 — the exponent in this document was wrong.** An earlier draft wrote
> the exponent as `^(-1/DECAY)`, which with `DECAY = -0.5` evaluates to `^2` — a function
> that *increases* without bound rather than decaying. The correct form is `^DECAY`
> directly. That draft carried an explicit warning not to trust it without checking
> against the reference implementation, and checking is what caught it. **This is the
> external-oracle discipline working exactly as intended**, and it is the reason that
> discipline is mandatory rather than advisory.

## Context

The project's original onboarding brief specified the retrievability formula as:

```text
R(t, S) = (1 + factor · (t / S))^(-1)
```

The canonical FSRS-4.5 formula, verified against the FSRS reference specification
(`open-spaced-repetition/awesome-fsrs` wiki, "The Algorithm", retrieved 2026-08-11):

```text
R(t, S) = (1 + FACTOR · t / S) ^ DECAY

where  DECAY  = -0.5
       FACTOR = 19/81
```

`FACTOR` is not a free parameter — it is derived so that `R(S, S) = 0.9` exactly:

```text
(1 + 19/81) ^ -0.5  =  (100/81) ^ -0.5  =  0.9   ✓
```

This is what makes "stability" mean "the interval at which recall probability is 90%".
Every other formula in the model depends on that identity holding, so it is asserted
directly in the test suite rather than assumed.

The difference from the brief is the exponent: `-1` versus `-0.5`.

These are materially different forgetting curves. The `^-1` form decays faster initially
and has a heavier tail. Using it means the algorithm is not FSRS-4.5 — it is a different
scheduler that happens to share the parameter names. Intervals will differ, and the
published FSRS parameter weights (which were fitted against the canonical curve) will no
longer be optimal for it.

Since scheduling accuracy is the core value of the learning engine, and since the
canonical parameters are the result of fitting against very large review datasets, using
canonical parameters with a non-canonical curve would be the worst combination.

## Decision

**Implement the canonical FSRS-4.5 formula**, including the standard 19-parameter weight
vector, as the adopted default.

Three provisions make this safe to proceed on without further sign-off:

### 1. The uncertainty is isolated to one constant

The curve parameters live in a single exported object, not scattered through the
scheduling code:

```typescript
// packages/core/src/constants.ts
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
```

Switching to the simplified form is an edit to this file plus regenerated fixtures —
roughly two hours, not a rewrite.

**FSRS-4.5 has 17 parameters, not 19.** FSRS-5 introduced two more (w17, w18) for the
same-day / short-term stability path. FSRS-4.5 therefore has no same-day formula, and the
implementation has two stability paths — recall and lapse — not three. An earlier draft
of the roadmap said three; that was FSRS-5's shape.

### 2. Expected values come from an external oracle, not from us

Test vectors are taken from the **reference FSRS implementation**, committed as fixtures.
The constants and curve shape are verified against the published specification during M1
— **not** transcribed from this ADR or from any prior conversation.

This matters more than it may appear. If we derived expected values from our own reading
of the formula, and that reading were wrong, the implementation and the tests would be
wrong *in the same direction* and would agree with each other perfectly. Green suite,
broken scheduler, no signal. An external oracle converts "is this correct?" from a
judgement into a mechanical check.

### 3. Server-side replay makes an error recoverable

Because card state is derived by replaying the event log
([ADR-0003](0003-event-sourced-sync.md)), a corrected formula can be applied
retroactively: replay every user's history through the fixed implementation and their
state becomes correct. No migration, no data loss.

This is the property that makes the decision genuinely low-risk rather than merely
cheap-looking.

## Consequences

### Positive

- Interoperability with the wider FSRS ecosystem: published parameter sets, optimisers,
  and research all apply directly.
- Scheduling quality benefits from large-scale empirical fitting we could not replicate.
- Future per-user parameter optimisation (FR-086) can use existing FSRS optimiser work.
- Correctness is verifiable against reference test vectors rather than only against our
  own reasoning.

### Negative

- Marginally more complex than the simplified form. Immaterial.

### Neutral

- If the simplified form is preferred for a specific reason, changing it is a one-line
  edit in `packages/core` plus updated test vectors — but it should be a deliberate,
  recorded decision, which is why this ADR exists.

## Alternatives considered

**The `^-1` simplification from the brief** — Not adopted pending confirmation. It is a
legitimate choice only if made knowingly. If chosen, we should stop describing the
implementation as FSRS-4.5 and fit our own parameters, since the published ones would no
longer apply.

**SM-2** — Rejected. Older, less accurate, and already superseded in the project design.

**A custom scheduler** — Rejected. No basis to believe we could improve on a
well-validated algorithm, and no data with which to fit one.

## Reversal procedure

If the simplified form is later preferred:

1. Edit `CURVE` in `packages/core/src/fsrs/constants.ts`
2. Regenerate golden fixtures from the chosen reference
3. Run `pnpm test:core` — the 100% coverage threshold catches any path that assumed the
   old curve
4. Optionally replay server-side to correct existing user state
5. Supersede this ADR with a new one recording the reasoning

**Estimated effort: ~2 hours.** This is why it is a default rather than a gate.

## Generalisable lesson

Recorded because more decisions like this will arise:

> A decision blocks work only if being wrong makes the work **useless**. If being wrong
> merely makes it **redoable at known, bounded cost**, adopt a documented default,
> isolate the uncertainty behind one named value, verify against an external oracle, and
> proceed.

Genuinely irreversible decisions in this project — the sync protocol
([ADR-0003](0003-event-sourced-sync.md)), the orthography choice, the content model —
warrant blocking. A constant does not.
