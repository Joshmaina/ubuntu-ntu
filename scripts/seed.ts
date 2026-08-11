#!/usr/bin/env tsx
/**
 * Compiles content/*.yaml into Postgres.
 *
 * The database is a DERIVED artefact (ADR-0004) — this script can be re-run at
 * any time and the content tables can be dropped without loss. Only `users` and
 * `fsrs_review_logs` hold irreplaceable data, and this script never touches
 * them.
 *
 * Validates before inserting, using the same loader as the CI gate, so the
 * seeder cannot insert something validation would have rejected.
 */

import { loadContent, reportIssues } from './lib/content.js';
import { connect } from './lib/db.js';

async function main(): Promise<void> {
  const { languages, issues } = loadContent();

  if (issues.length > 0) {
    console.error(`\n✗ Refusing to seed — ${issues.length} content issue(s):`);
    reportIssues(issues);
    process.exit(1);
  }

  const client = await connect();

  try {
    // One transaction for the whole seed: a partially loaded language is worse
    // than none, because the app would show a lesson whose vocabulary is absent.
    await client.query('BEGIN');

    let counts = { languages: 0, dialects: 0, vocabulary: 0, skills: 0, lessons: 0, exercises: 0 };

    for (const { language, dialects, vocabulary, skills, lessons } of languages) {
      await client.query(
        `INSERT INTO languages (id, name, native_name, is_tonal, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           native_name = EXCLUDED.native_name,
           is_tonal = EXCLUDED.is_tonal,
           metadata = EXCLUDED.metadata`,
        [
          language.code,
          language.name,
          language.nativeName,
          language.isTonal,
          JSON.stringify({
            toneSystem: language.toneSystem ?? null,
            scripts: language.scripts,
            anchorLanguages: language.anchorLanguages,
          }),
        ],
      );
      counts.languages++;

      for (const dialect of dialects) {
        await client.query(
          `INSERT INTO dialects
             (id, language_id, name, region, description,
              authority_name, authority_affiliation, authority_confirmed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             region = EXCLUDED.region,
             description = EXCLUDED.description,
             authority_name = EXCLUDED.authority_name,
             authority_affiliation = EXCLUDED.authority_affiliation,
             authority_confirmed_at = EXCLUDED.authority_confirmed_at`,
          [
            dialect.code,
            dialect.language,
            dialect.name,
            dialect.region ?? null,
            dialect.description ?? null,
            dialect.authority.name,
            dialect.authority.affiliation,
            dialect.authority.confirmedAt,
          ],
        );
        counts.dialects++;
      }

      const defaultDialect = dialects[0]?.code ?? null;

      for (const item of vocabulary) {
        await client.query(
          `INSERT INTO vocabulary_items
             (id, dialect_id, target, ipa, tones, anchors, part_of_speech, audio_path, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             target = EXCLUDED.target,
             ipa = EXCLUDED.ipa,
             tones = EXCLUDED.tones,
             anchors = EXCLUDED.anchors,
             part_of_speech = EXCLUDED.part_of_speech,
             audio_path = EXCLUDED.audio_path,
             notes = EXCLUDED.notes`,
          [
            item.id,
            defaultDialect,
            item.target,
            item.ipa ?? null,
            item.tones ? JSON.stringify(item.tones) : null,
            JSON.stringify(item.anchors),
            item.partOfSpeech ?? null,
            item.audio ?? null,
            item.notes ?? null,
          ],
        );
        counts.vocabulary++;
      }

      for (const skill of skills) {
        await client.query(
          `INSERT INTO skills (id, dialect_id, title, description, icon, position_x, position_y)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             icon = EXCLUDED.icon,
             position_x = EXCLUDED.position_x,
             position_y = EXCLUDED.position_y`,
          [
            skill.id,
            skill.dialect,
            JSON.stringify(skill.title),
            skill.description ? JSON.stringify(skill.description) : null,
            skill.icon ?? null,
            skill.position.x,
            skill.position.y,
          ],
        );
        counts.skills++;
      }

      // Edges after all nodes exist, so ordering in the YAML does not matter.
      for (const skill of skills) {
        for (const prerequisite of skill.prerequisites) {
          await client.query(
            `INSERT INTO skill_prerequisites (skill_id, prerequisite_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [skill.id, prerequisite],
          );
        }
      }

      for (const lesson of lessons) {
        await client.query(
          `INSERT INTO lessons (id, skill_id, title, order_index, xp_reward, validated)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             order_index = EXCLUDED.order_index,
             xp_reward = EXCLUDED.xp_reward,
             validated = EXCLUDED.validated`,
          [
            lesson.id,
            lesson.skill,
            JSON.stringify(lesson.title),
            lesson.orderIndex,
            lesson.xpReward,
            lesson.validated,
          ],
        );
        counts.lessons++;

        // Replace rather than merge: an exercise removed from the YAML must
        // disappear from the database, or learners keep seeing deleted content.
        await client.query('DELETE FROM exercises WHERE lesson_id = $1', [lesson.id]);

        for (const [index, exercise] of lesson.exercises.entries()) {
          await client.query(
            `INSERT INTO exercises (id, lesson_id, type, order_index, payload, vocab_item_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              exercise.id,
              lesson.id,
              exercise.type,
              index,
              JSON.stringify(exercise),
              exercise.vocabId ?? null,
            ],
          );
          counts.exercises++;
        }
      }
    }

    await client.query('COMMIT');

    console.log('\n✓ Seed complete:');
    for (const [table, n] of Object.entries(counts)) {
      console.log(`    ${String(n).padStart(4)}  ${table}`);
    }
    console.log('');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('\n✗ Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
