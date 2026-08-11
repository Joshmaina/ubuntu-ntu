# ADR-0008: Image-based visual learning

**Status:** **Accepted** — schema and contracts now; exercise types at M7
**Date:** 2026-08-11
**Requirements:** FR-220 – FR-228, NFR-080 – NFR-083

## Context

Every exercise type so far routes meaning through an **anchor language**: the
learner is told what a phrase means in English or Swahili, then works toward the
target. That works for a literate adult who already reads the anchor language.

It fails two audiences we explicitly care about:

**Young children.** A six-year-old in a diaspora household — the exact learner
the diaspora segment is buying this for — may not read fluently in *any*
language. Every current exercise assumes reading.

**Learners whose strongest language is the target's neighbour.** A Gĩkũyũ
learner in Nairobi may be more comfortable in Swahili than English, and a
learner in a rural area may read neither well.

There is also a subtler pedagogical cost that affects everyone. Routing through
an anchor language trains *translation* — the learner builds
`ndũnyũ → "market" → concept`. Direct image association builds
`ndũnyũ → concept`, skipping the intermediate hop. That is closer to how a first
language is acquired and is the mechanism behind most immersion methods.

**An image-based exercise is the only exercise type that needs no anchor
language at all.** That is its strategic value, not merely its appeal to
children.

## Decision

Add images as a first-class asset class alongside audio, with four consequences:

**1. Content model gains an `images/` asset directory and image references on
vocabulary items and exercises.** Added to the schema and Zod contracts *now*,
even though the exercise types ship at M7 — consistent with the rule in
[05-ARCHITECTURE.md §10](../05-ARCHITECTURE.md) that schema is never gated,
because data migrations are expensive and UI gating is free.

**2. Three new exercise types at M7:**

| Type | Mechanic | Anchor language needed |
|---|---|---|
| `image_match` | See image, choose the word | **None** |
| `image_label` | See image, say or assemble the word | **None** |
| `image_audio_match` | Hear the word, choose the image | **None** |

**3. A hard per-image size budget, enforced in CI.** ≤ 40 KB, ≤ 800 px on the
long edge, WebP. See *Consequences* — this is the binding constraint.

**4. Images are governed exactly as audio is**, with additional protections for
images of people and a prohibition on images of identifiable children. See
[09-DATA-GOVERNANCE.md](../09-DATA-GOVERNANCE.md).

### Culturally specific imagery, not stock photography

A generic stock photo of a supermarket is not a `ndũnyũ`. Using one would teach
the wrong referent while also enacting exactly the flattening this project
exists to resist — an African language illustrated with imagery from somewhere
else.

Preference order: **community-photographed** > openly licensed and regionally
appropriate > simple illustration > *nothing*. An exercise with no image is
better than an exercise with a misleading one.

## Consequences

### Positive

- Pre-literate learners can use the app at all.
- Removes the anchor-language dependency for a meaningful subset of vocabulary.
- Builds direct concept association rather than translation habits.
- Concrete nouns become far easier to teach than they are through text.
- Photographing local objects is a *much* lower barrier to contribution than
  recording audio — no quiet room, no microphone anxiety. This may recruit
  contributors who would never record their voice.

### Negative

- **Data economy is the binding constraint, and it is severe.** A 3-second Opus
  clip is ~10 KB. An unoptimised photo is 200 KB — twenty times the cost of the
  audio it accompanies. NFR-011 caps a 10-lesson bundle at 5 MB *including*
  audio, so images could consume the entire budget on their own.

  Mitigation, enforced mechanically rather than by good intentions: WebP, ≤ 800 px
  long edge, ≤ 40 KB per image, checked in CI. At that budget, 20 images cost
  ~800 KB — affordable. Without the check, this feature quietly breaks the
  offline promise for the users who most depend on it.

- **Rights are harder than for audio.** A recording is made by the contributor.
  A photograph may contain other people, private property, or copyrighted work.
- Images of people are identifying in a way a short voice clip often is not.
- Alt text is required for every image, which is real authoring effort.
- Abstract vocabulary (grammatical particles, `AFFIRM`) cannot be illustrated at
  all — images supplement the existing types, they do not replace them.

### Neutral

- Bundles gain an image directory; the content-addressed bundle mechanism is
  unchanged.

## Rejected alternatives

**Stock photography libraries** — Rejected. Licensing costs money (violating
C-001), and the imagery is culturally wrong in a way that undermines the
project's premise.

**AI-generated images** — Rejected, and worth stating explicitly because it is
the cheap option. Generative models reproduce the same training-data biases that
make African subjects poorly represented, the provenance is unclear, and a
project whose entire claim is *authentic, community-sourced language* cannot
illustrate itself with synthetic imagery. This would be the single fastest way
to lose community trust.

**Emoji or icon sets** — Rejected as a primary mechanism. Culturally generic and
unable to express most concrete vocabulary. May be acceptable as a fallback for
UI affordances, not for teaching meaning.

**Video** — Deferred. Genuinely valuable for verbs and processes, but the data
cost is incompatible with the offline promise. Revisit only if zero-rating
partnerships materialise.

**Ship images at M7 without schema support now** — Rejected. Retrofitting an
asset class into the content model, bundle format, and database later is
expensive; adding nullable fields today is nearly free.

## Revisit when

- Bundle size measurements show the image budget is either too tight (learners
  want more) or too loose (offline downloads become painful on 2G).
- A community asks to contribute images before M7, at which point the exercise
  types move earlier.
