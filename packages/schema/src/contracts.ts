/**
 * Zod contracts for lesson content.
 *
 * These make the validation rules in docs/07-CONTENT-MODEL.md §6 executable, so
 * malformed content fails CI rather than reaching a learner (NFR-052).
 *
 * Reuses `validateGloss` from @ubuntu-ntu/core — the same function the mobile
 * and web apps call at runtime, so the authoring check and the runtime check
 * cannot disagree.
 */

import { z } from 'zod';
import { validateGloss, type Morpheme } from '@ubuntu-ntu/core';

const ID = /^[a-z0-9]+(\.[a-z0-9-]+)*$/;

/** Localised string keyed by anchor-language code: { en: "...", fr: "..." }. */
export const localisedSchema = z.record(z.string().min(1)).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'at least one anchor-language translation is required' },
);

export const toneSchema = z.enum(['low', 'mid', 'high', 'rising', 'falling']);

// --- Language and variety --------------------------------------------------

/** ISO 3166-1 alpha-2. */
export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'must be ISO 3166-1 alpha-2, e.g. KE');

/**
 * Social register. Mandatory rather than stylistic in many African languages —
 * addressing an elder with a peer form is disrespect, not a grammar slip.
 */
export const registerSchema = z.enum([
  'neutral',
  'familiar',
  'respectful',
  'formal',
  'honorific',
]);

export const addresseeSchema = z.enum([
  'peer',
  'elder',
  'younger',
  'group',
  'stranger',
  'child',
]);

export const languageSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(1),
  nativeName: z.string().min(1),
  isTonal: z.boolean(),
  /** Primary country of origin (ADR-0009). */
  countryCode: countryCodeSchema,
  /**
   * Additional countries where natively spoken. Required (may be empty) so that
   * authors must consciously state that a language is single-country rather
   * than omitting the question — most African languages cross borders.
   */
  alsoSpokenIn: z.array(countryCodeSchema).default([]),
  toneSystem: z
    .object({
      levels: z.array(toneSchema).min(1),
      markedInOrthography: z.boolean(),
    })
    .optional(),
  scripts: z.array(z.string()).min(1),
  anchorLanguages: z.array(z.string()).min(1),
});

export const dialectSchema = z.object({
  code: z.string().min(2).max(32),
  language: z.string().min(2).max(10),
  name: z.string().min(1),
  /** Country this dialect is locked to (ADR-0009). */
  countryCode: countryCodeSchema,
  /**
   * Specific speech community, e.g. "Eldoret, Rift Valley". Required: two
   * varieties within one country may differ in tone and lexicon, which is the
   * ambiguity the locking exists to prevent, so country alone is insufficient.
   */
  communityRegion: z.string().min(1).max(100),
  region: z.string().optional(),
  description: z.string().optional(),
  authority: z.object({
    name: z.string().nullable(),
    affiliation: z.string().nullable(),
    confirmedAt: z.string().nullable(),
  }),
});

// --- Vocabulary ------------------------------------------------------------

/**
 * An image asset (ADR-0008).
 *
 * `alt` is REQUIRED, not optional, for two reasons: screen-reader users need it
 * (NFR-044), and it doubles as the authoring record of what the image is
 * actually meant to depict — which is how a mismatched or culturally wrong
 * image gets caught in review.
 */
export const imageSchema = z.object({
  path: z.string().min(1),
  alt: localisedSchema,
  /** Contributor credit, matching the attribution rule for audio. */
  credit: z.string().optional(),
  license: z.string().optional(),
});

export const vocabularyItemSchema = z.object({
  id: z.string().regex(ID, 'id must be lowercase dot-separated'),
  target: z.string().min(1),
  ipa: z.string().optional(),
  tones: z.array(toneSchema).optional(),
  anchors: localisedSchema,
  partOfSpeech: z.string().optional(),
  register: registerSchema.default('neutral'),
  addressee: addresseeSchema.optional(),
  audio: z.string().optional(),
  /**
   * Present from day one though the image exercise types ship at M7. Schema is
   * never gated — data migrations are expensive, UI gating is free
   * (docs/05-ARCHITECTURE.md §10).
   */
  image: imageSchema.optional(),
  notes: z.string().optional(),
});

// --- Skills ----------------------------------------------------------------

export const skillSchema = z.object({
  id: z.string().regex(ID),
  dialect: z.string().min(2),
  title: localisedSchema,
  description: localisedSchema.optional(),
  icon: z.string().optional(),
  prerequisites: z.array(z.string()).default([]),
  position: z.object({ x: z.number().int(), y: z.number().int() }),
});

// --- Exercises -------------------------------------------------------------

const morphemeSchema = z
  .object({
    morph: z.string().min(1),
    anchor: localisedSchema.optional(),
    category: z.string().optional(),
    tone: toneSchema.optional(),
    audio: z.string().optional(),
    vocabId: z.string().optional(),
  })
  // FR-043: a morpheme with no lexical equivalent carries a category label.
  // A blank cell under a morpheme is never acceptable.
  .refine((m) => m.anchor !== undefined || (m.category !== undefined && m.category.length > 0), {
    message: 'morpheme needs an anchor translation or a grammatical category',
  });

const sentenceDeconstructionSchema = z.object({
  id: z.string().regex(ID),
  type: z.literal('sentence_deconstruction'),
  target: z.string().min(1),
  anchors: localisedSchema,
  gloss: z.array(morphemeSchema).min(1),
  audio: z.object({
    full: z.string().min(1),
    anchor: z.record(z.string()).optional(),
  }),
  pitchContour: z
    .object({
      referenceSemitones: z.array(z.number()),
      sampleRateHz: z.number().positive(),
    })
    .optional(),
  assembly: z.object({ distractors: z.array(z.string()).default([]) }).optional(),
  vocabId: z.string().optional(),
});

const multipleChoiceSchema = z.object({
  id: z.string().regex(ID),
  type: z.literal('multiple_choice'),
  prompt: localisedSchema,
  audio: z.string().optional(),
  options: z
    .array(z.object({ text: z.string().min(1), correct: z.boolean() }))
    .min(2)
    .refine((opts) => opts.filter((o) => o.correct).length === 1, {
      message: 'exactly one option must be correct',
    }),
  vocabId: z.string().optional(),
});

const toneMatchSchema = z.object({
  id: z.string().regex(ID),
  type: z.literal('tone_match'),
  target: z.string().min(1),
  tones: z.array(toneSchema).min(1),
  referenceContour: z.array(z.number()).min(1),
  toleranceSemitones: z.number().positive().default(1.5),
  vocabId: z.string().optional(),
});

const audioMatchSchema = z.object({
  id: z.string().regex(ID),
  type: z.literal('audio_match'),
  audio: z.string().min(1),
  options: z
    .array(z.object({ text: localisedSchema, correct: z.boolean() }))
    .min(2)
    .refine((opts) => opts.filter((o) => o.correct).length === 1, {
      message: 'exactly one option must be correct',
    }),
  vocabId: z.string().optional(),
});

export const exerciseSchema = z.discriminatedUnion('type', [
  sentenceDeconstructionSchema,
  multipleChoiceSchema,
  toneMatchSchema,
  audioMatchSchema,
]);

export type Exercise = z.infer<typeof exerciseSchema>;

// --- Lessons ---------------------------------------------------------------

export const lessonSchema = z.object({
  id: z.string().regex(ID),
  skill: z.string().min(1),
  title: localisedSchema,
  orderIndex: z.number().int().nonnegative(),
  xpReward: z.number().int().positive().default(10),
  /**
   * NFR-050. Provisional content exists during development but must never be
   * published. The bundle builder refuses anything still false.
   */
  validated: z.boolean().default(false),
  /** Lesson-level register, inherited by exercises that do not override it. */
  register: registerSchema.optional(),
  exercises: z.array(exerciseSchema).min(1),
});

/**
 * A proverb or idiom.
 *
 * Structurally unlike a sentence, which is why it needs its own type: the
 * literal gloss usually reads as nonsense, the fluent meaning loses the
 * imagery, and neither tells a learner WHEN to say it. All three are required.
 */
export const proverbSchema = z.object({
  id: z.string().regex(ID),
  dialect: z.string().min(2).max(32),
  target: z.string().min(1),
  literalGloss: localisedSchema,
  meaning: localisedSchema,
  /** The situations in which it is appropriately used. */
  usageContext: localisedSchema,
  tones: z.array(toneSchema).optional(),
  audio: z.string().optional(),
  attribution: z.string().optional(),
  validated: z.boolean().default(false),
});

export type Proverb = z.infer<typeof proverbSchema>;

export type Lesson = z.infer<typeof lessonSchema>;

// --- Cross-field checks that Zod alone cannot express -----------------------

export interface ContentIssue {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

/**
 * Verify that each sentence-deconstruction gloss reassembles into its target.
 *
 * The single most valuable check in the pipeline. A gloss that does not
 * reassemble teaches a structure the language does not have — trivially easy to
 * introduce, invisible on visual inspection, and pedagogically destructive.
 * Delegates to @ubuntu-ntu/core so authoring and runtime agree by construction.
 */
export function checkGlossAlignment(lesson: Lesson, file: string): ContentIssue[] {
  const issues: ContentIssue[] = [];

  lesson.exercises.forEach((exercise, i) => {
    if (exercise.type !== 'sentence_deconstruction') return;

    const morphemes: Morpheme[] = exercise.gloss.map((m) => {
      const anchorValues = m.anchor ? Object.values(m.anchor) : [];
      const first = anchorValues[0];
      return first !== undefined
        ? { morph: m.morph, anchor: first }
        : { morph: m.morph, category: m.category ?? '' };
    });

    const result = validateGloss(exercise.target, morphemes);
    for (const error of result.errors) {
      issues.push({ file, path: `exercises[${i}] (${exercise.id})`, message: error });
    }
  });

  return issues;
}

/** Tonal languages must label the tone of every morpheme (NFR content rules). */
export function checkToneCoverage(lesson: Lesson, isTonal: boolean, file: string): ContentIssue[] {
  if (!isTonal) return [];

  const issues: ContentIssue[] = [];

  lesson.exercises.forEach((exercise, i) => {
    if (exercise.type !== 'sentence_deconstruction') return;
    exercise.gloss.forEach((m, j) => {
      if (m.tone === undefined) {
        issues.push({
          file,
          path: `exercises[${i}].gloss[${j}] ("${m.morph}")`,
          message: 'tonal language: every morpheme needs a tone label',
        });
      }
    });
  });

  return issues;
}

/** Referenced vocabulary IDs must exist. Prevents orphaned FSRS scheduling. */
export function checkVocabReferences(
  lesson: Lesson,
  knownVocabIds: ReadonlySet<string>,
  file: string,
): ContentIssue[] {
  const issues: ContentIssue[] = [];

  const report = (id: string | undefined, path: string): void => {
    if (id !== undefined && !knownVocabIds.has(id)) {
      issues.push({ file, path, message: `unknown vocabulary id "${id}"` });
    }
  };

  lesson.exercises.forEach((exercise, i) => {
    report(exercise.vocabId, `exercises[${i}].vocabId`);
    if (exercise.type === 'sentence_deconstruction') {
      exercise.gloss.forEach((m, j) => report(m.vocabId, `exercises[${i}].gloss[${j}].vocabId`));
    }
  });

  return issues;
}

/**
 * Publication gate (NFR-050, NFR-051). Content may be authored without a named
 * authority; it may not be published without one.
 */
export function checkPublishable(
  lesson: Lesson,
  authorityName: string | null,
  file: string,
): ContentIssue[] {
  const issues: ContentIssue[] = [];

  if (lesson.validated && authorityName === null) {
    issues.push({
      file,
      path: 'validated',
      message: 'lesson is marked validated but its dialect has no designated authority',
    });
  }

  return issues;
}
