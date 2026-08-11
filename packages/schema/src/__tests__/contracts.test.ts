import { describe, it, expect } from 'vitest';
import {
  localisedSchema,
  languageSchema,
  dialectSchema,
  vocabularyItemSchema,
  skillSchema,
  lessonSchema,
  exerciseSchema,
  checkGlossAlignment,
  checkToneCoverage,
  checkVocabReferences,
  checkPublishable,
  type Lesson,
} from '../contracts.js';

const deconstruction = {
  id: 'ki.greetings.l1.ex1',
  type: 'sentence_deconstruction' as const,
  target: 'Wĩ mwega',
  anchors: { en: 'Are you well?' },
  gloss: [
    { morph: 'Wĩ', anchor: { en: 'you are' }, tone: 'high' as const },
    { morph: ' mwega', anchor: { en: 'well' }, tone: 'low' as const },
  ],
  audio: { full: 'greetings/l1.opus' },
};

const lesson = (overrides: Partial<Lesson> = {}): Lesson =>
  lessonSchema.parse({
    id: 'ki.greetings.l1',
    skill: 'ki.greetings',
    title: { en: 'Greetings' },
    orderIndex: 0,
    exercises: [deconstruction],
    ...overrides,
  });

describe('localisedSchema', () => {
  it('accepts at least one translation', () => {
    expect(localisedSchema.safeParse({ en: 'hello' }).success).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(localisedSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty translation string', () => {
    expect(localisedSchema.safeParse({ en: '' }).success).toBe(false);
  });
});

describe('languageSchema', () => {
  const valid = {
    code: 'ki',
    name: 'Gikuyu',
    nativeName: 'Gĩkũyũ',
    isTonal: true,
    toneSystem: { levels: ['low', 'high'], markedInOrthography: false },
    scripts: ['latin'],
    anchorLanguages: ['en'],
  };

  it('accepts a well-formed language', () => {
    expect(languageSchema.safeParse(valid).success).toBe(true);
  });

  it('makes toneSystem optional', () => {
    const { toneSystem: _omitted, ...rest } = valid;
    expect(languageSchema.safeParse(rest).success).toBe(true);
  });

  it('requires at least one anchor language', () => {
    expect(languageSchema.safeParse({ ...valid, anchorLanguages: [] }).success).toBe(false);
  });

  it('requires at least one script', () => {
    expect(languageSchema.safeParse({ ...valid, scripts: [] }).success).toBe(false);
  });

  it('rejects an unknown tone level', () => {
    const bad = { ...valid, toneSystem: { levels: ['sideways'], markedInOrthography: false } };
    expect(languageSchema.safeParse(bad).success).toBe(false);
  });
});

describe('dialectSchema', () => {
  const valid = {
    code: 'ki-central',
    language: 'ki',
    name: 'Gĩkũyũ (Central)',
    authority: { name: null, affiliation: null, confirmedAt: null },
  };

  it('accepts a dialect with no designated authority', () => {
    // Provisional content must be authorable; publication is what is gated.
    expect(dialectSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a named authority', () => {
    const named = {
      ...valid,
      authority: { name: 'A Speaker', affiliation: 'Somewhere', confirmedAt: '2026-01-01' },
    };
    expect(dialectSchema.safeParse(named).success).toBe(true);
  });

  it('requires the authority block to be present', () => {
    const { authority: _omitted, ...rest } = valid;
    expect(dialectSchema.safeParse(rest).success).toBe(false);
  });
});

describe('vocabularyItemSchema', () => {
  const valid = { id: 'ki.greetings.v001', target: 'wĩ', anchors: { en: 'you are' } };

  it('accepts a minimal item', () => {
    expect(vocabularyItemSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an id that is not lowercase dot-separated', () => {
    expect(vocabularyItemSchema.safeParse({ ...valid, id: 'Ki.Greetings' }).success).toBe(false);
    expect(vocabularyItemSchema.safeParse({ ...valid, id: 'ki greetings' }).success).toBe(false);
  });

  it('rejects an empty target', () => {
    expect(vocabularyItemSchema.safeParse({ ...valid, target: '' }).success).toBe(false);
  });
});

describe('skillSchema', () => {
  const valid = {
    id: 'ki.greetings',
    dialect: 'ki-central',
    title: { en: 'Greetings' },
    position: { x: 0, y: 0 },
  };

  it('defaults prerequisites to an empty array', () => {
    expect(skillSchema.parse(valid).prerequisites).toEqual([]);
  });

  it('requires a position', () => {
    const { position: _omitted, ...rest } = valid;
    expect(skillSchema.safeParse(rest).success).toBe(false);
  });
});

describe('exerciseSchema', () => {
  it('accepts sentence_deconstruction', () => {
    expect(exerciseSchema.safeParse(deconstruction).success).toBe(true);
  });

  /** FR-043: a blank cell under a morpheme is never acceptable. */
  it('rejects a morpheme with neither anchor nor category', () => {
    const bad = { ...deconstruction, gloss: [{ morph: 'Wĩ', tone: 'high' }] };
    expect(exerciseSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a morpheme carrying only a grammatical category', () => {
    const ok = { ...deconstruction, gloss: [{ morph: 'Wĩ mwega', category: 'AFFIRM' }] };
    expect(exerciseSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects an empty gloss', () => {
    expect(exerciseSchema.safeParse({ ...deconstruction, gloss: [] }).success).toBe(false);
  });

  it('accepts multiple_choice with exactly one correct option', () => {
    const mc = {
      id: 'ki.a.b',
      type: 'multiple_choice',
      prompt: { en: 'Which?' },
      options: [
        { text: 'a', correct: true },
        { text: 'b', correct: false },
      ],
    };
    expect(exerciseSchema.safeParse(mc).success).toBe(true);
  });

  it('rejects multiple_choice with no correct option', () => {
    const mc = {
      id: 'ki.a.b',
      type: 'multiple_choice',
      prompt: { en: 'Which?' },
      options: [
        { text: 'a', correct: false },
        { text: 'b', correct: false },
      ],
    };
    expect(exerciseSchema.safeParse(mc).success).toBe(false);
  });

  it('rejects multiple_choice with two correct options', () => {
    const mc = {
      id: 'ki.a.b',
      type: 'multiple_choice',
      prompt: { en: 'Which?' },
      options: [
        { text: 'a', correct: true },
        { text: 'b', correct: true },
      ],
    };
    expect(exerciseSchema.safeParse(mc).success).toBe(false);
  });

  it('accepts tone_match and defaults its tolerance', () => {
    const tone = {
      id: 'ki.a.c',
      type: 'tone_match',
      target: 'mwega',
      tones: ['low', 'high'],
      referenceContour: [-2, 1.5],
    };
    const parsed = exerciseSchema.parse(tone);
    expect(parsed.type).toBe('tone_match');
    if (parsed.type === 'tone_match') expect(parsed.toleranceSemitones).toBe(1.5);
  });

  it('rejects tone_match with an empty reference contour', () => {
    const tone = {
      id: 'ki.a.c',
      type: 'tone_match',
      target: 'x',
      tones: ['low'],
      referenceContour: [],
    };
    expect(exerciseSchema.safeParse(tone).success).toBe(false);
  });

  it('accepts audio_match with exactly one correct option', () => {
    const am = {
      id: 'ki.a.d',
      type: 'audio_match',
      audio: 'x.opus',
      options: [
        { text: { en: 'go' }, correct: true },
        { text: { en: 'come' }, correct: false },
      ],
    };
    expect(exerciseSchema.safeParse(am).success).toBe(true);
  });

  it('rejects audio_match with no correct option', () => {
    const am = {
      id: 'ki.a.d',
      type: 'audio_match',
      audio: 'x.opus',
      options: [
        { text: { en: 'go' }, correct: false },
        { text: { en: 'come' }, correct: false },
      ],
    };
    expect(exerciseSchema.safeParse(am).success).toBe(false);
  });

  it('rejects an unknown exercise type', () => {
    expect(exerciseSchema.safeParse({ id: 'ki.a.e', type: 'telepathy' }).success).toBe(false);
  });
});

describe('lessonSchema', () => {
  it('defaults validated to false', () => {
    // Provisional by default is the safe direction: a lesson is unpublishable
    // until someone deliberately says otherwise.
    expect(lesson().validated).toBe(false);
  });

  it('defaults xpReward', () => {
    expect(lesson().xpReward).toBe(10);
  });

  it('requires at least one exercise', () => {
    expect(lessonSchema.safeParse({ ...lesson(), exercises: [] }).success).toBe(false);
  });

  it('rejects a negative orderIndex', () => {
    expect(lessonSchema.safeParse({ ...lesson(), orderIndex: -1 }).success).toBe(false);
  });
});

describe('checkGlossAlignment', () => {
  it('passes when the gloss reassembles into the target', () => {
    expect(checkGlossAlignment(lesson(), 'f.yaml')).toEqual([]);
  });

  /**
   * The check that matters most: a gloss that does not reassemble teaches a
   * structure the language does not have.
   */
  it('reports a gloss that does not reassemble', () => {
    const broken = lesson({
      exercises: [{ ...deconstruction, target: 'Wĩ mũgũnda' }],
    });
    const issues = checkGlossAlignment(broken, 'f.yaml');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('do not reassemble');
  });

  it('ignores non-deconstruction exercises', () => {
    const mc = lesson({
      exercises: [
        {
          id: 'ki.a.b',
          type: 'multiple_choice',
          prompt: { en: 'Which?' },
          options: [
            { text: 'a', correct: true },
            { text: 'b', correct: false },
          ],
        },
      ],
    });
    expect(checkGlossAlignment(mc, 'f.yaml')).toEqual([]);
  });

  it('uses the category when a morpheme has no anchor', () => {
    const withCategory = lesson({
      exercises: [{ ...deconstruction, target: 'Wĩ', gloss: [{ morph: 'Wĩ', category: 'AFFIRM' }] }],
    });
    expect(checkGlossAlignment(withCategory, 'f.yaml')).toEqual([]);
  });

  /**
   * Unreachable through lessonSchema.parse — Zod's refine guarantees
   * anchor-or-category. But this function is exported and its TypeScript type
   * permits the shape, so a caller who skips parsing can reach it. Rather than
   * producing a blank gloss cell (which FR-043 forbids), the missing label must
   * surface as a validation error.
   */
  it('reports a morpheme with neither anchor nor category when parsing was skipped', () => {
    const unparsed = {
      ...lesson(),
      exercises: [{ ...deconstruction, target: 'Wĩ', gloss: [{ morph: 'Wĩ' }] }],
    } as unknown as Lesson;

    const issues = checkGlossAlignment(unparsed, 'f.yaml');
    expect(issues.some((i) => i.message.includes('needs an anchor or a category'))).toBe(true);
  });
});

describe('checkToneCoverage', () => {
  it('passes when every morpheme has a tone', () => {
    expect(checkToneCoverage(lesson(), true, 'f.yaml')).toEqual([]);
  });

  it('reports a missing tone in a tonal language', () => {
    const missing = lesson({
      exercises: [
        {
          ...deconstruction,
          gloss: [
            { morph: 'Wĩ', anchor: { en: 'you are' } },
            { morph: ' mwega', anchor: { en: 'well' }, tone: 'low' as const },
          ],
        },
      ],
    });
    const issues = checkToneCoverage(missing, true, 'f.yaml');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('needs a tone label');
  });

  it('skips the check entirely for non-tonal languages', () => {
    const missing = lesson({
      exercises: [{ ...deconstruction, gloss: [{ morph: 'Wĩ mwega', anchor: { en: 'ok' } }] }],
    });
    expect(checkToneCoverage(missing, false, 'f.yaml')).toEqual([]);
  });

  it('ignores non-deconstruction exercises', () => {
    const tone = lesson({
      exercises: [
        {
          id: 'ki.a.c',
          type: 'tone_match',
          target: 'x',
          tones: ['low'],
          referenceContour: [1],
        },
      ],
    });
    expect(checkToneCoverage(tone, true, 'f.yaml')).toEqual([]);
  });
});

describe('checkVocabReferences', () => {
  it('passes when all references resolve', () => {
    const withRefs = lesson({
      exercises: [{ ...deconstruction, vocabId: 'ki.greetings.v001' }],
    });
    expect(checkVocabReferences(withRefs, new Set(['ki.greetings.v001']), 'f.yaml')).toEqual([]);
  });

  it('reports an unknown exercise-level reference', () => {
    const withRefs = lesson({ exercises: [{ ...deconstruction, vocabId: 'ki.missing' }] });
    const issues = checkVocabReferences(withRefs, new Set(), 'f.yaml');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('ki.missing');
  });

  it('reports an unknown morpheme-level reference', () => {
    const withRefs = lesson({
      exercises: [
        {
          ...deconstruction,
          gloss: [
            { morph: 'Wĩ', anchor: { en: 'you are' }, tone: 'high' as const, vocabId: 'ki.nope' },
            { morph: ' mwega', anchor: { en: 'well' }, tone: 'low' as const },
          ],
        },
      ],
    });
    const issues = checkVocabReferences(withRefs, new Set(), 'f.yaml');
    expect(issues.some((i) => i.message.includes('ki.nope'))).toBe(true);
  });

  it('ignores morpheme references on non-deconstruction exercises', () => {
    const tone = lesson({
      exercises: [
        { id: 'ki.a.c', type: 'tone_match', target: 'x', tones: ['low'], referenceContour: [1] },
      ],
    });
    expect(checkVocabReferences(tone, new Set(), 'f.yaml')).toEqual([]);
  });
});

describe('checkPublishable', () => {
  it('allows provisional content with no authority', () => {
    expect(checkPublishable(lesson({ validated: false }), null, 'f.yaml')).toEqual([]);
  });

  it('allows validated content when an authority is named', () => {
    expect(checkPublishable(lesson({ validated: true }), 'A Speaker', 'f.yaml')).toEqual([]);
  });

  /** NFR-050/051: the gate that stops unvalidated content reaching learners. */
  it('rejects content marked validated when no authority is designated', () => {
    const issues = checkPublishable(lesson({ validated: true }), null, 'f.yaml');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('no designated authority');
  });
});
