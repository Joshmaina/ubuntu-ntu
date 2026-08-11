#!/usr/bin/env tsx
/**
 * CI gate for content/*.yaml (NFR-052).
 *
 * Runs on every push. Malformed content cannot merge, which is what makes the
 * "linguists edit through GitHub PRs" workflow in ADR-0004 safe: a contributor
 * with no local tooling still gets immediate, specific feedback.
 */

import { loadContent, reportIssues } from './lib/content.js';

const { languages, issues } = loadContent();

const lessonCount = languages.reduce((n, l) => n + l.lessons.length, 0);
const vocabCount = languages.reduce((n, l) => n + l.vocabulary.length, 0);
const exerciseCount = languages.reduce(
  (n, l) => n + l.lessons.reduce((m, lesson) => m + lesson.exercises.length, 0),
  0,
);

console.log(
  `\nContent: ${languages.length} language(s), ${vocabCount} vocabulary item(s), ` +
    `${lessonCount} lesson(s), ${exerciseCount} exercise(s)`,
);

if (issues.length > 0) {
  console.error(`\n✗ Content validation FAILED — ${issues.length} issue(s):`);
  reportIssues(issues);
  console.error('\nSee docs/07-CONTENT-MODEL.md §6 for the rules.\n');
  process.exit(1);
}

// Report the publication gate without failing on it. Unvalidated content is
// expected during development; it is the BUNDLE BUILDER that refuses to ship
// it, not the validator.
const unvalidated = languages.flatMap((l) => l.lessons.filter((lesson) => !lesson.validated));

console.log('✓ Content validation passed.');

if (unvalidated.length > 0) {
  console.log(
    `\n  ⚠ ${unvalidated.length} lesson(s) are PROVISIONAL (validated: false) and ` +
      `cannot be published:`,
  );
  for (const lesson of unvalidated) console.log(`      · ${lesson.id}`);
  console.log('\n  A native speaker must validate these before public release');
  console.log('  (NFR-050, docs/09-DATA-GOVERNANCE.md).\n');
}
