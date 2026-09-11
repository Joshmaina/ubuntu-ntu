#!/usr/bin/env tsx
/**
 * Build content bundles from content/*.yaml and publish them.
 *
 * This is the missing link in the offline content path: until now the manifest
 * endpoint described bundles that nothing ever created.
 *
 * Bundles are CONTENT-ADDRESSED — the id derives from a hash of the payload —
 * so a given id always means byte-identical content. That makes client caching
 * trivially safe (never re-download an id you already have) and rollback
 * instant (republish the previous manifest).
 *
 * Usage:
 *   pnpm build:bundles              build and publish
 *   pnpm build:bundles --dry-run    report without writing
 */

import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  bundlePayloadSchema,
  canonicalJson,
  bundleId as makeBundleId,
  type BundlePayload,
} from '@ubuntu-ntu/schema';
import { loadContent, reportIssues, type LoadedLanguage } from './lib/content.js';
import { connect } from './lib/db.js';

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Assemble one bundle per dialect.
 *
 * Content authored for a language is scoped to a dialect on publication, so the
 * geographic metadata (ADR-0009) travels with the bytes rather than only with
 * the manifest — a device that has the bundle knows which community it came
 * from even offline.
 */
function buildPayload(language: LoadedLanguage, dialectCode: string): BundlePayload {
  const dialect = language.dialects.find((d) => d.code === dialectCode)!;
  const skills = language.skills.filter((s) => s.dialect === dialectCode);
  const skillIds = new Set(skills.map((s) => s.id));
  const lessons = language.lessons.filter((l) => skillIds.has(l.skill));

  const audioFiles = new Set<string>();
  for (const item of language.vocabulary) {
    if (item.audio !== undefined) audioFiles.add(item.audio);
  }

  for (const lesson of lessons) {
    for (const exercise of lesson.exercises) {
      if (exercise.type === 'sentence_deconstruction') {
        audioFiles.add(exercise.audio.full);
        for (const morpheme of exercise.gloss) {
          if (morpheme.audio !== undefined) audioFiles.add(morpheme.audio);
        }
        for (const path of Object.values(exercise.audio.anchor ?? {})) audioFiles.add(path);
      } else if (exercise.type === 'multiple_choice' || exercise.type === 'audio_match') {
        if (exercise.audio !== undefined) audioFiles.add(exercise.audio);
      }
    }
  }

  return bundlePayloadSchema.parse({
    formatVersion: 1,
    dialectId: dialect.code,
    languageId: language.language.code,
    countryCode: dialect.countryCode,
    communityRegion: dialect.communityRegion,
    isTonal: language.language.isTonal,
    anchorLanguages: language.language.anchorLanguages,

    skills: skills.map((s) => ({
      id: s.id,
      title: s.title,
      icon: s.icon ?? null,
      prerequisites: s.prerequisites,
      position: s.position,
    })),

    lessons: lessons.map((l) => ({
      id: l.id,
      skillId: l.skill,
      title: l.title,
      orderIndex: l.orderIndex,
      xpReward: l.xpReward,
      register: l.register ?? null,
      exercises: l.exercises,
    })),

    vocabulary: language.vocabulary.map((v) => ({
      id: v.id,
      target: v.target,
      anchors: v.anchors,
      ipa: v.ipa ?? null,
      tones: v.tones ?? null,
      partOfSpeech: v.partOfSpeech ?? null,
      register: v.register,
      addressee: v.addressee ?? null,
      audioPath: v.audio ?? null,
    })),

    audioFiles: [...audioFiles].sort(),
  });
}

async function publish(
  client: pg.Client,
  payload: BundlePayload,
  raw: string,
  hash: string,
): Promise<{ id: string; version: number; created: boolean }> {
  const id = makeBundleId(payload.dialectId, hash);

  const existing = await client.query<{ id: string; version: number }>(
    'SELECT id, version FROM bundles WHERE id = $1',
    [id],
  );
  if (existing.rows.length > 0) {
    // Identical content already published. Content addressing makes this a
    // no-op rather than a duplicate — the same id cannot mean two things.
    return { ...existing.rows[0]!, created: false };
  }

  const { rows } = await client.query<{ next: number }>(
    'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM bundles WHERE dialect_id = $1',
    [payload.dialectId],
  );
  const version = rows[0]!.next;

  await client.query(
    `INSERT INTO bundles
       (id, dialect_id, version, size_bytes, sha256, lesson_ids, payload,
        format_version, country_code, community_region)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      payload.dialectId,
      version,
      Buffer.byteLength(raw, 'utf8'),
      hash,
      JSON.stringify(payload.lessons.map((l) => l.id)),
      raw,
      payload.formatVersion,
      payload.countryCode,
      payload.communityRegion,
    ],
  );

  return { id, version, created: true };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const { languages, issues } = loadContent();
  if (issues.length > 0) {
    console.error(`\n✗ Refusing to build — ${issues.length} content issue(s):`);
    reportIssues(issues);
    process.exit(1);
  }

  const built: { id: string; version: number; created: boolean; size: number; lessons: number }[] =
    [];

  const client = dryRun ? null : await connect();

  try {
    for (const language of languages) {
      for (const dialect of language.dialects) {
        const payload = buildPayload(language, dialect.code);

        if (payload.lessons.length === 0) {
          console.log(`  · ${dialect.code}: no lessons, skipped`);
          continue;
        }

        // Canonical serialisation: identical content must always hash the same,
        // or "immutable and content-addressed" is not true.
        const raw = canonicalJson(payload);
        const hash = sha256(raw);

        if (client === null) {
          built.push({
            id: makeBundleId(payload.dialectId, hash),
            version: 0,
            created: false,
            size: Buffer.byteLength(raw, 'utf8'),
            lessons: payload.lessons.length,
          });
          continue;
        }

        const result = await publish(client, payload, raw, hash);
        built.push({
          ...result,
          size: Buffer.byteLength(raw, 'utf8'),
          lessons: payload.lessons.length,
        });
      }
    }
  } finally {
    if (client !== null) await client.end();
  }

  if (built.length === 0) {
    console.log('\nNo bundles built — no dialect has lessons.\n');
    return;
  }

  console.log(dryRun ? '\nBundles (dry run):' : '\n✓ Bundles published:');
  for (const b of built) {
    const kb = (b.size / 1024).toFixed(1);
    const state = dryRun ? '' : b.created ? '  [new]' : '  [unchanged]';
    console.log(`    ${b.id}  v${b.version}  ${b.lessons} lesson(s)  ${kb} KB${state}`);
  }

  // NFR-011: a 10-lesson bundle including audio must stay under 5 MB. Audio is
  // not bundled yet, so this only warns on the JSON — but the budget is checked
  // from the first build rather than discovered when it is already blown.
  const oversized = built.filter((b) => b.size > 5 * 1024 * 1024);
  if (oversized.length > 0) {
    console.error('\n✗ Bundle(s) exceed the 5 MB budget (NFR-011):');
    for (const b of oversized) console.error(`    ${b.id}`);
    process.exit(1);
  }

  console.log('');
}

main().catch((error: unknown) => {
  console.error('\n✗ Bundle build failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
