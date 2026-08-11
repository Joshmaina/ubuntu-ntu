/**
 * Loads and validates content/*.yaml.
 *
 * Shared by validate-content.ts (CI gate) and seed.ts, so the seeder can never
 * insert something the validator would have rejected.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  languageSchema,
  dialectSchema,
  vocabularyItemSchema,
  skillSchema,
  lessonSchema,
  checkGlossAlignment,
  checkToneCoverage,
  checkVocabReferences,
  checkPublishable,
  type ContentIssue,
  type Lesson,
} from '@ubuntu-ntu/schema';
import { z } from 'zod';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT_DIR = join(ROOT, 'content');

export interface LoadedLanguage {
  language: z.infer<typeof languageSchema>;
  dialects: z.infer<typeof dialectSchema>[];
  vocabulary: z.infer<typeof vocabularyItemSchema>[];
  skills: z.infer<typeof skillSchema>[];
  lessons: Lesson[];
}

export interface LoadResult {
  languages: LoadedLanguage[];
  issues: ContentIssue[];
}

function rel(path: string): string {
  return relative(ROOT, path).replace(/\\/g, '/');
}

/**
 * Parse a YAML file, converting a syntax error into a reportable issue.
 *
 * A raw stack trace is an unacceptable response to a contributor's typo. ADR-0004
 * puts non-technical native speakers in the editing loop through GitHub PRs, and
 * "SyntaxError at parser.js:306" tells them nothing actionable. They get a file,
 * a line, and a message instead.
 */
function readYaml(path: string, issues: ContentIssue[]): unknown | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    issues.push({
      file: rel(path),
      path: '(file)',
      message: `could not be read: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }

  try {
    return parse(raw);
  } catch (error) {
    const line =
      error instanceof Error && 'linePos' in error
        ? ((error as { linePos?: [{ line: number; col: number }] }).linePos?.[0]?.line ?? null)
        : null;
    issues.push({
      file: rel(path),
      path: line === null ? '(yaml)' : `line ${line}`,
      message: `invalid YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    });
    return undefined;
  }
}

function listYaml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => join(dir, f));
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((full) => statSync(full).isDirectory())
    .sort();
}

/** Turn a Zod failure into per-field issues rather than one opaque blob. */
function zodIssues(error: z.ZodError, file: string): ContentIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

function parseFile<T>(
  schema: z.ZodType<T>,
  path: string,
  issues: ContentIssue[],
): T | null {
  const raw = readYaml(path, issues);
  // readYaml already reported the syntax error; do not pile a schema error on top.
  if (raw === undefined) return null;

  const result = schema.safeParse(raw);
  if (!result.success) {
    issues.push(...zodIssues(result.error, rel(path)));
    return null;
  }
  return result.data;
}

export function loadContent(): LoadResult {
  const issues: ContentIssue[] = [];
  const languages: LoadedLanguage[] = [];

  for (const langDir of listSubdirs(CONTENT_DIR)) {
    const languagePath = join(langDir, 'language.yaml');
    if (!existsSync(languagePath)) {
      issues.push({
        file: rel(langDir),
        path: '(root)',
        message: 'language directory has no language.yaml',
      });
      continue;
    }

    const language = parseFile(languageSchema, languagePath, issues);
    if (language === null) continue;

    const dialects = listYaml(join(langDir, 'dialects'))
      .map((p) => parseFile(dialectSchema, p, issues))
      .filter((d): d is z.infer<typeof dialectSchema> => d !== null);

    const vocabulary: z.infer<typeof vocabularyItemSchema>[] = [];
    for (const path of listYaml(join(langDir, 'vocabulary'))) {
      const items = parseFile(z.array(vocabularyItemSchema), path, issues);
      if (items !== null) vocabulary.push(...items);
    }

    const skills: z.infer<typeof skillSchema>[] = [];
    const lessons: Lesson[] = [];

    for (const skillDir of listSubdirs(join(langDir, 'skills'))) {
      const skillPath = join(skillDir, 'skill.yaml');
      if (existsSync(skillPath)) {
        const skill = parseFile(skillSchema, skillPath, issues);
        if (skill !== null) skills.push(skill);
      }

      for (const path of listYaml(skillDir)) {
        if (path.endsWith('skill.yaml')) continue;
        const lesson = parseFile(lessonSchema, path, issues);
        if (lesson !== null) lessons.push(lesson);
      }
    }

    // --- Cross-file checks Zod cannot express ---
    const vocabIds = new Set(vocabulary.map((v) => v.id));
    const skillIds = new Set(skills.map((s) => s.id));
    const dialectAuthority = new Map(dialects.map((d) => [d.code, d.authority.name]));

    for (const lesson of lessons) {
      const file = `content/${language.code}/${lesson.id}`;

      issues.push(...checkGlossAlignment(lesson, file));
      issues.push(...checkToneCoverage(lesson, language.isTonal, file));
      issues.push(...checkVocabReferences(lesson, vocabIds, file));

      if (!skillIds.has(lesson.skill)) {
        issues.push({ file, path: 'skill', message: `unknown skill "${lesson.skill}"` });
        continue;
      }

      const skill = skills.find((s) => s.id === lesson.skill)!;
      issues.push(...checkPublishable(lesson, dialectAuthority.get(skill.dialect) ?? null, file));
    }

    // Prerequisites must exist and must not form a cycle — a cycle makes a
    // skill permanently unreachable, which is invisible until a learner is
    // stuck behind it.
    for (const skill of skills) {
      for (const prerequisite of skill.prerequisites) {
        if (!skillIds.has(prerequisite)) {
          issues.push({
            file: `content/${language.code}/${skill.id}`,
            path: 'prerequisites',
            message: `unknown prerequisite skill "${prerequisite}"`,
          });
        }
      }
    }
    issues.push(...detectPrerequisiteCycles(skills, language.code));

    // Duplicate IDs corrupt FSRS state — two items sharing an ID share memory.
    issues.push(...detectDuplicates(vocabulary.map((v) => v.id), 'vocabulary', language.code));
    issues.push(...detectDuplicates(lessons.map((l) => l.id), 'lesson', language.code));

    languages.push({ language, dialects, vocabulary, skills, lessons });
  }

  return { languages, issues };
}

function detectDuplicates(ids: string[], kind: string, languageCode: string): ContentIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].map((id) => ({
    file: `content/${languageCode}`,
    path: kind,
    message: `duplicate ${kind} id "${id}"`,
  }));
}

function detectPrerequisiteCycles(
  skills: readonly z.infer<typeof skillSchema>[],
  languageCode: string,
): ContentIssue[] {
  const graph = new Map(skills.map((s) => [s.id, s.prerequisites]));
  const state = new Map<string, 'visiting' | 'done'>();
  const issues: ContentIssue[] = [];

  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      issues.push({
        file: `content/${languageCode}`,
        path: 'prerequisites',
        message: `prerequisite cycle: ${[...trail, id].join(' → ')}`,
      });
      return;
    }
    state.set(id, 'visiting');
    for (const next of graph.get(id) ?? []) {
      if (graph.has(next)) visit(next, [...trail, id]);
    }
    state.set(id, 'done');
  };

  for (const skill of skills) visit(skill.id, []);
  return issues;
}

export function reportIssues(issues: readonly ContentIssue[]): void {
  const byFile = new Map<string, ContentIssue[]>();
  for (const issue of issues) {
    const list = byFile.get(issue.file) ?? [];
    list.push(issue);
    byFile.set(issue.file, list);
  }

  for (const [file, fileIssues] of byFile) {
    console.error(`\n  ${file}`);
    for (const issue of fileIssues) {
      console.error(`    • ${issue.path}: ${issue.message}`);
    }
  }
}
