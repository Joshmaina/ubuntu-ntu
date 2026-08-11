#!/usr/bin/env node
/**
 * Enforces the constraints of ADR-0002 on packages/core.
 *
 * packages/core is imported identically by mobile, web, and server. If it ever
 * diverges between runtimes, users get different review schedules on different
 * devices — a corruption that is silent, cumulative, and unreproducible.
 *
 * The defence is that core CANNOT depend on anything runtime-specific. This
 * script makes that a build failure rather than a code-review habit.
 *
 * Checks:
 *   1. No runtime dependencies in package.json
 *   2. No imports of anything outside packages/core/src
 *   3. No implicit clock reads (Date.now, new Date) — time is a parameter
 *   4. No randomness (Math.random)
 *   5. No I/O or platform globals
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'packages', 'core');
const SRC = join(CORE, 'src');

const failures = [];

/** Recursively collect .ts files, excluding test files. */
function collect(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests may import from vitest; production code may not.
      if (entry === '__tests__') return [];
      return collect(full);
    }
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : [];
  });
}

// --- 1. No runtime dependencies -------------------------------------------
const pkgPath = join(CORE, 'package.json');
if (!existsSync(pkgPath)) {
  failures.push('packages/core/package.json not found');
} else {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const deps = Object.keys(pkg.dependencies ?? {});
  if (deps.length > 0) {
    failures.push(
      `packages/core must have ZERO runtime dependencies, found: ${deps.join(', ')}`,
    );
  }
  if (Object.keys(pkg.peerDependencies ?? {}).length > 0) {
    failures.push('packages/core must have no peerDependencies');
  }
}

// --- 2-5. Source-level constraints ----------------------------------------
const BANNED = [
  {
    // Any import whose specifier is not a relative path.
    pattern: /^\s*import\s+(?:type\s+)?[\s\S]*?from\s+['"](?!\.)([^'"]+)['"]/gm,
    message: (m) => `imports "${m[1]}" — core may only import relative paths`,
  },
  {
    pattern: /\brequire\s*\(/g,
    message: () => 'uses require() — core must be import-free',
  },
  {
    pattern: /\bDate\s*\.\s*now\s*\(/g,
    message: () => 'calls Date.now() — pass `now` as an explicit parameter (NFR-062)',
  },
  {
    pattern: /\bnew\s+Date\s*\(\s*\)/g,
    message: () => 'calls new Date() with no argument — time must be a parameter (NFR-062)',
  },
  {
    pattern: /\bMath\s*\.\s*random\s*\(/g,
    message: () => 'calls Math.random() — core must be deterministic',
  },
  {
    pattern: /\b(?:process|globalThis|window|document|localStorage|fetch|XMLHttpRequest)\b/g,
    message: (m) => `references platform global "${m[0]}" — core must be runtime-agnostic`,
  },
];

const files = collect(SRC);

if (files.length === 0) {
  failures.push('no source files found under packages/core/src');
}

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  // Strip comments so prose mentioning Date.now() does not trip the check.
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const { pattern, message } of BANNED) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(`${rel}:${line} ${message(match)}`);
    }
  }
}

// --- Report ----------------------------------------------------------------
if (failures.length > 0) {
  console.error('\n✗ packages/core purity check FAILED (ADR-0002)\n');
  for (const f of failures) console.error(`  • ${f}`);
  console.error(
    `\n${failures.length} violation(s). See docs/adr/0002-shared-learning-core.md\n`,
  );
  process.exit(1);
}

console.log(
  `✓ packages/core purity check passed (${files.length} files, 0 external imports)`,
);
