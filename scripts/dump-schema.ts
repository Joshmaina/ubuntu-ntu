#!/usr/bin/env tsx
/**
 * Generate docs/SCHEMA.sql from the live database.
 *
 * The project brief names /docs/SCHEMA.sql as a source-of-truth document. It is
 * not: migrations/ is authoritative and this file is DERIVED from the schema
 * they produce. Generating it means the documentation can never drift from the
 * database, which a hand-maintained copy always eventually does.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, ROOT } from './lib/db.js';

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
}

// Wrapped in main() rather than using top-level await: the root package is not
// ESM, so tsx compiles scripts/ as CJS. Matches migrate.ts and seed.ts.
async function main(): Promise<void> {
  const client = await connect();

  try {
    const { rows: columns } = await client.query<ColumnRow>(
    `SELECT table_name, column_name, data_type, character_maximum_length,
            is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
    );

    const { rows: constraints } = await client.query<{ table_name: string; def: string }>(
    `SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'public'
     ORDER BY rel.relname, con.conname`,
    );

    const { rows: indexes } = await client.query<{ tablename: string; indexdef: string }>(
    `SELECT tablename, indexdef FROM pg_indexes
     WHERE schemaname = 'public' ORDER BY tablename, indexname`,
    );

    const byTable = new Map<string, ColumnRow[]>();
    for (const column of columns) {
    const list = byTable.get(column.table_name) ?? [];
    list.push(column);
    byTable.set(column.table_name, list);
    }

    const lines: string[] = [
    '-- =========================================================================',
    '-- UBUNTU-NTU — PostgreSQL schema',
    '--',
    '-- GENERATED FILE — do not edit by hand.',
    '-- Regenerate with: pnpm schema:dump',
    '--',
    '-- Source of truth is migrations/*.sql. This document is derived from the',
    '-- live schema so it can never drift from the database.',
    '-- =========================================================================',
    '',
    ];

    for (const [table, cols] of [...byTable].sort()) {
    if (table === 'schema_migrations') continue;

    lines.push(`-- ${'-'.repeat(70)}`);
    lines.push(`CREATE TABLE ${table} (`);

    const width = Math.max(...cols.map((c) => c.column_name.length));
    lines.push(
      ...cols.map((c, i) => {
        const type =
          c.character_maximum_length !== null
            ? `${c.data_type.toUpperCase()}(${c.character_maximum_length})`
            : c.data_type.toUpperCase();
        const nullable = c.is_nullable === 'NO' ? ' NOT NULL' : '';
        const dflt = c.column_default !== null ? ` DEFAULT ${c.column_default}` : '';
        const comma = i < cols.length - 1 ? ',' : '';
        return `    ${c.column_name.padEnd(width)}  ${type}${nullable}${dflt}${comma}`;
      }),
    );
    lines.push(');', '');

    const tableConstraints = constraints.filter((c) => c.table_name === table);
    if (tableConstraints.length > 0) {
      lines.push('-- Constraints:');
      lines.push(...tableConstraints.map((c) => `--   ${c.def}`));
      lines.push('');
    }

    const tableIndexes = indexes.filter((i) => i.tablename === table);
    if (tableIndexes.length > 0) {
      lines.push(...tableIndexes.map((i) => `${i.indexdef};`));
      lines.push('');
    }
    }

    const out = join(ROOT, 'docs', 'SCHEMA.sql');
    writeFileSync(out, lines.join('\n'), 'utf8');

    console.log(`✓ docs/SCHEMA.sql written — ${byTable.size - 1} tables`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('\n✗ Schema dump failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
