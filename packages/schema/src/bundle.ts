/**
 * Content bundle format.
 *
 * A bundle is the unit of offline content delivery: an immutable,
 * content-addressed package of lessons, vocabulary, and audio references that a
 * device downloads once and then uses with no network.
 *
 * Shared by three consumers so they cannot disagree about the format:
 *   - scripts/build-bundles.ts  (builds them)
 *   - apps/api                  (serves them)
 *   - packages/sync             (installs them)
 */

import { z } from 'zod';
import { registerSchema, addresseeSchema, toneSchema, localisedSchema } from './contracts.js';

export const bundleVocabularySchema = z.object({
  id: z.string(),
  target: z.string(),
  anchors: localisedSchema,
  ipa: z.string().nullable(),
  tones: z.array(toneSchema).nullable(),
  partOfSpeech: z.string().nullable(),
  register: registerSchema,
  addressee: addresseeSchema.nullable(),
  audioPath: z.string().nullable(),
});

export const bundleLessonSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  title: localisedSchema,
  orderIndex: z.number().int(),
  xpReward: z.number().int(),
  register: registerSchema.nullable(),
  /** Full exercise payloads, exactly as authored. */
  exercises: z.array(z.unknown()),
});

export const bundleSkillSchema = z.object({
  id: z.string(),
  title: localisedSchema,
  icon: z.string().nullable(),
  prerequisites: z.array(z.string()),
  position: z.object({ x: z.number().int(), y: z.number().int() }),
});

export const bundlePayloadSchema = z.object({
  /** Bumped when the bundle FORMAT changes, not when content changes. */
  formatVersion: z.literal(1),

  dialectId: z.string(),
  languageId: z.string(),
  /** Geographic scope travels with the content itself (ADR-0009). */
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  communityRegion: z.string(),
  isTonal: z.boolean(),
  anchorLanguages: z.array(z.string()),

  skills: z.array(bundleSkillSchema),
  lessons: z.array(bundleLessonSchema),
  vocabulary: z.array(bundleVocabularySchema),

  /** Relative audio paths this bundle references. */
  audioFiles: z.array(z.string()),
});

export type BundlePayload = z.infer<typeof bundlePayloadSchema>;
export type BundleLesson = z.infer<typeof bundleLessonSchema>;

/**
 * Deterministic JSON serialisation.
 *
 * Content addressing requires that identical content always produces an
 * identical hash. `JSON.stringify` preserves insertion order, so two builds of
 * the same content could otherwise differ only in key order and yield different
 * bundle ids — which would silently defeat caching and make "immutable" false.
 * Keys are sorted recursively.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

/** Bundle id derived from the content hash. Same content, same id, forever. */
export function bundleId(dialectId: string, sha256: string): string {
  return `bundle-${dialectId}-${sha256.slice(0, 12)}`;
}
