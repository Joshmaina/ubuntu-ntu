#!/usr/bin/env tsx
/**
 * Database migration runner (project brief §Task 3).
 *
 * Properties that matter:
 *   - Ledger table records what has been applied
 *   - Files run in lexical order, once each
 *   - Each file runs in its own transaction — a failure leaves no partial schema
 *   - Checksum guard detects a file edited AFTER it was applied, which is the
 *     failure mode that silently desynchronises environments
 *
 * Usage:
 *   pnpm migrate            apply pending migrations
 *   pnpm migrate --status   report without applying
 *   pnpm migrate --verify   assert the expected tables exist
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { connect, ROOT } from './lib/db.js';

const MIGRATIONS_DIR = join(ROOT, 'migrations');

/** Tables the brief §Task 3 requires us to verify. */
const REQUIRED_TABLES = [
  'languages',
  'dialects',
  'skills',
  'lessons',
  'user_fsrs_cards',
] as const;

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT        PRIMARY KEY,
    checksum    TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER     NOT NULL
  );
`;

interface Migration {
  filename: string;
  sql: string;
  checksum: string;
}

function loadMigrations(): Migration[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
      return {
        filename,
        sql,
        // Normalise line endings so a Windows checkout and a Linux CI runner
        // compute the same checksum for identical content.
        checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
      };
    });
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes('--status');
  const verifyOnly = process.argv.includes('--verify');

  // Loads .env and refuses to proceed if the connection landed on an
  // unexpected database — see scripts/lib/db.ts.
  const client = await connect();

  try {
    if (verifyOnly) {
      await verify(client);
      return;
    }

    await client.query(LEDGER);

    const migrations = loadMigrations();
    const { rows } = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    // Checksum guard. An already-applied file whose content has changed means
    // the database and the repository disagree, and no amount of re-running
    // will reconcile them — a new migration is required instead.
    const drifted = migrations.filter(
      (m) => applied.has(m.filename) && applied.get(m.filename) !== m.checksum,
    );

    if (drifted.length > 0) {
      console.error('\n✗ Migration drift detected — these files changed after being applied:\n');
      for (const m of drifted) console.error(`  • ${m.filename}`);
      console.error('\nWrite a NEW migration instead of editing an applied one.\n');
      process.exit(1);
    }

    const pending = migrations.filter((m) => !applied.has(m.filename));

    if (statusOnly) {
      console.log(`\nApplied: ${applied.size}   Pending: ${pending.length}\n`);
      for (const m of migrations) {
        console.log(`  ${applied.has(m.filename) ? '✓' : '·'} ${m.filename}`);
      }
      console.log('');
      return;
    }

    if (pending.length === 0) {
      console.log('✓ Database is up to date — no pending migrations.');
      await verify(client);
      return;
    }

    for (const migration of pending) {
      const started = Date.now();
      // Per-file transaction: a failure leaves no partial schema behind.
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum, duration_ms) VALUES ($1, $2, $3)',
          [migration.filename, migration.checksum, Date.now() - started],
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${migration.filename}  (${Date.now() - started}ms)`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${migration.filename} — rolled back`);
        throw error;
      }
    }

    console.log(`\n✓ Applied ${pending.length} migration(s).`);
    await verify(client);
  } finally {
    await client.end();
  }
}

async function verify(client: pg.Client): Promise<void> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const present = new Set(rows.map((r) => r.table_name));

  console.log('\nRequired tables (brief §Task 3):');
  let ok = true;
  for (const table of REQUIRED_TABLES) {
    const found = present.has(table);
    console.log(`  ${found ? '✓' : '✗'} ${table}`);
    if (!found) ok = false;
  }
  console.log(`\n  ${present.size} tables total in public schema.`);

  if (!ok) {
    console.error('\n✗ Verification failed — required tables missing.\n');
    process.exit(1);
  }
  console.log('✓ Verification passed.\n');
}

main().catch((error: unknown) => {
  console.error('\n✗ Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
