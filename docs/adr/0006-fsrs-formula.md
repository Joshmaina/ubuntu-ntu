# ADR-0006: Canonical FSRS-4.5 retrievability formula

**Status:** **Proposed** — awaiting decision
**Date:** 2026-08-10
**Requirements:** FR-080, FR-082

## Context

The project's original onboarding brief specified the retrievability formula as:

```
R(t, S) = (1 + factor · (t / S))^(-1)
```

The canonical FSRS-4.5 formula is:

```
R(t, S) = (1 + FACTOR · t / S)^(-1 / DECAY)

where  DECAY  = -0.5
       FACTOR = 19/81
```

The difference is the exponent: `-1` versus `-1/DECAY` (which evaluates to `-0.5`, since
`-1 / -0.5 = 2`… **note:** the sign and reciprocal handling here must be confirmed
against the reference implementation during M1, not taken from this document).

These are materially different forgetting curves. The `^-1` form decays faster initially
and has a heavier tail. Using it means the algorithm is not FSRS-4.5 — it is a different
scheduler that happens to share the parameter names. Intervals will differ, and the
published FSRS parameter weights (which were fitted against the canonical curve) will no
longer be optimal for it.

Since scheduling accuracy is the core value of the learning engine, and since the
canonical parameters are the result of fitting against very large review datasets, using
canonical parameters with a non-canonical curve would be the worst combination.

## Decision (proposed)

**Implement the canonical FSRS-4.5 formula**, including the standard 19-parameter weight
vector, unless explicitly directed otherwise.

The exact constants and the curve shape will be verified against the reference FSRS
implementation and its published specification during M1 — **not** transcribed from this
ADR or from any prior conversation. Test vectors will be taken from the reference
implementation so that our output can be checked against known-good values.

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

## Decision required

@project-lead — confirm canonical, or direct otherwise. This ADR moves to **Accepted**
once confirmed. **M1 is blocked on this**, because the test vectors depend on it and
writing tests against the wrong curve would waste the milestone.
