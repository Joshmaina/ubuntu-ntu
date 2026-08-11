/**
 * Morpheme gloss parsing and validation.
 *
 * Supports Scaffolded Sentence Deconstruction stage 2 (FR-042, FR-043) and the
 * content validation rules in docs/07-CONTENT-MODEL.md §6.
 */

import type { Morpheme } from './types.js';

export interface GlossValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Whitespace-insensitive concatenation of the morpheme surface forms. */
export function joinMorphemes(morphemes: readonly Morpheme[]): string {
  return morphemes.map((m) => m.morph).join('');
}

const stripWhitespace = (value: string): string => value.replace(/\s+/g, '');

/**
 * Validate a gloss against its target sentence.
 *
 * The concatenation check is the important one. If the morphemes do not
 * reassemble into the target sentence, the exercise teaches a structure the
 * language does not have. That error is easy to introduce, invisible on visual
 * inspection, and pedagogically destructive — so it is checked mechanically on
 * every push rather than left to review.
 */
export function validateGloss(target: string, morphemes: readonly Morpheme[]): GlossValidation {
  const errors: string[] = [];

  if (morphemes.length === 0) {
    errors.push('gloss is empty');
  }

  morphemes.forEach((m, i) => {
    if (m.morph.length === 0) {
      errors.push(`morpheme ${i}: surface form is empty`);
    }
    // FR-043: a grammatical morpheme with no lexical equivalent gets a category
    // label (PRESENT, PLURAL, …). It is never left blank.
    if (
      (m.anchor === undefined || m.anchor.length === 0) &&
      (m.category === undefined || m.category.length === 0)
    ) {
      errors.push(`morpheme ${i} ("${m.morph}"): needs an anchor or a category`);
    }
  });

  const joined = stripWhitespace(joinMorphemes(morphemes));
  const expected = stripWhitespace(target);

  if (joined !== expected) {
    errors.push(
      `morphemes do not reassemble into the target: got "${joined}", expected "${expected}"`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * The literal gloss line shown beneath the target sentence.
 * Grammatical categories are rendered in the conventional uppercase form.
 */
export function glossLine(morphemes: readonly Morpheme[]): string[] {
  return morphemes.map((m) =>
    m.anchor !== undefined && m.anchor.length > 0 ? m.anchor : (m.category ?? '?').toUpperCase(),
  );
}

/**
 * Column widths for interlinear alignment, so each morpheme sits directly above
 * its meaning regardless of which string is longer.
 */
export function alignColumns(morphemes: readonly Morpheme[]): number[] {
  const glosses = glossLine(morphemes);
  return morphemes.map((m, i) => Math.max(m.morph.length, glosses[i]!.length));
}

/**
 * Deterministic shuffle for the sentence-assembly exercise (FR-049).
 *
 * ADR-0002 forbids Math.random in core, so the caller supplies a seed. That is
 * not merely a constraint worked around — it means a given exercise presents
 * the same tile order every time, which makes the UI testable and the learner's
 * experience reproducible.
 */
export function shuffleForAssembly<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  // Mulberry32 — small, fast, adequate for shuffling display order.
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
