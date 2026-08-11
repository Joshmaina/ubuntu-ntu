#!/usr/bin/env tsx
/**
 * Generate docs/OPENAPI.yaml from the running route schemas.
 *
 * The spec is GENERATED, never hand-written. A hand-maintained OpenAPI file
 * drifts from the implementation within weeks and then actively misleads
 * whoever trusts it; a generated one cannot disagree with the code.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { loadEnv } from '@ubuntu-ntu/config';
import { buildApp } from './app.js';
import { createDb } from './db.js';
import { loadDotEnv } from './env.js';

loadDotEnv();

// Generation only inspects route schemas; it never issues a query, so a
// placeholder connection string is sufficient and no database is required.
const env = loadEnv({
  ...process.env,
  UBUNTU_NTU_DATABASE_URL:
    process.env.UBUNTU_NTU_DATABASE_URL ?? 'postgresql://placeholder@localhost:5433/placeholder',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'openapi-generation-placeholder',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'openapi-generation-placeholder',
  NODE_ENV: 'test',
});

const { db, close } = createDb(env.UBUNTU_NTU_DATABASE_URL);
const app = await buildApp({ db, env });
await app.ready();

const spec = app.swagger();
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'OPENAPI.yaml');

writeFileSync(
  out,
  `# GENERATED FILE — do not edit by hand.\n` +
    `# Regenerate with: pnpm --filter @ubuntu-ntu/api openapi\n` +
    `# Source of truth: apps/api/src/app.ts route schemas.\n\n` +
    stringify(spec),
  'utf8',
);

const paths = Object.keys((spec as { paths?: Record<string, unknown> }).paths ?? {});
console.log(`✓ docs/OPENAPI.yaml written — ${paths.length} paths:`);
for (const p of paths.sort()) console.log(`    ${p}`);

await app.close();
await close();
