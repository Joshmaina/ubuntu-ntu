/**
 * Database connection for scripts, with a wrong-database guard.
 *
 * The guard exists because of a real failure: a natively installed PostgreSQL
 * bound port 5432 and won it, Docker's mapping silently lost, and `migrate`
 * connected to an unrelated database that happened to contain a `users` table.
 * The symptom was "relation already exists" — which reads as a schema bug, not
 * a connection bug, and cost real time to diagnose.
 *
 * A connection is now verified before anything is written.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Minimal .env loader. Deliberately not a dependency — this is ~15 lines and
 * scripts/ is the only consumer. Existing environment variables always win, so
 * CI and shell overrides behave as expected.
 */
export function loadEnv(): void {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    // Strip an inline comment, but not a '#' inside quotes.
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    value = value.replace(/^["']|["']$/g, '');

    process.env[key] = value;
  }
}

/**
 * Build the connection string.
 *
 * Deliberately reads UBUNTU_NTU_DATABASE_URL, **never** the bare DATABASE_URL.
 *
 * `DATABASE_URL` is the single most commonly set environment variable in
 * development, and a machine-wide one belonging to an unrelated project will
 * silently hijack this one. That is not hypothetical — it is exactly what
 * happened here, and it presented as a schema error rather than a
 * configuration error. A project-scoped name removes the collision entirely.
 */
export function connectionString(): string {
  const url = process.env.UBUNTU_NTU_DATABASE_URL;
  if (url !== undefined && url.length > 0) return url;

  const user = process.env.POSTGRES_USER ?? 'ubuntuntu_admin';
  const password = process.env.POSTGRES_PASSWORD ?? 'ubuntuntu_local_dev';
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  // 5433, not 5432 — see .env.example for why.
  const port = process.env.POSTGRES_PORT ?? '5433';
  const database = process.env.POSTGRES_DB ?? 'ubuntuntu_dev';
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

/** Tables this project owns. Anything else in `public` is a red flag. */
const OWNED_TABLES = new Set([
  'schema_migrations',
  'languages',
  'dialects',
  'skills',
  'skill_prerequisites',
  'lessons',
  'vocabulary_items',
  'exercises',
  'users',
  'refresh_tokens',
  'user_fsrs_cards',
  'fsrs_review_logs',
  'bundles',
]);

export async function connect(): Promise<pg.Client> {
  loadEnv();

  const conn = connectionString();
  const client = new pg.Client({ connectionString: conn });

  try {
    await client.connect();
  } catch (error) {
    const redacted = conn.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
    console.error(`\n✗ Could not connect to ${redacted}`);
    console.error('  Is the stack up?  pnpm docker:up  &&  pnpm docker:health\n');
    throw error;
  }

  await assertExpectedDatabase(client, conn);
  return client;
}

/**
 * Confirm we are talking to the database we think we are.
 *
 * Catches the case where the connection landed on some other PostgreSQL
 * instance — the failure this module exists to prevent.
 */
async function assertExpectedDatabase(client: pg.Client, conn: string): Promise<void> {
  const { rows } = await client.query<{ db: string; usr: string; port: string }>(
    `SELECT current_database() AS db,
            current_user       AS usr,
            current_setting('port') AS port`,
  );
  const info = rows[0]!;

  const expectedDb = process.env.POSTGRES_DB ?? 'ubuntuntu_dev';
  if (info.db !== expectedDb) {
    throw new Error(
      `connected to database "${info.db}" but expected "${expectedDb}" — check DATABASE_URL`,
    );
  }

  const { rows: tableRows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const foreign = tableRows.map((r) => r.table_name).filter((t) => !OWNED_TABLES.has(t));

  if (foreign.length > 0) {
    const redacted = conn.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
    console.error(`\n✗ Refusing to proceed: unexpected tables in "${info.db}".`);
    console.error(`  Found: ${foreign.slice(0, 8).join(', ')}${foreign.length > 8 ? ', …' : ''}`);
    console.error(`  Connection: ${redacted}`);
    console.error(
      '\n  This usually means the connection landed on a DIFFERENT PostgreSQL\n' +
        '  instance — commonly a native install holding port 5432. Our container\n' +
        '  publishes 5433 by default. Check POSTGRES_HOST_PORT and DATABASE_URL.\n',
    );
    throw new Error(`unexpected tables in target database: ${foreign.join(', ')}`);
  }
}
