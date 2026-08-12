/**
 * node:sqlite adapter for tests.
 *
 * Tests run against a REAL SQLite engine, not a fake. The invariant under test
 * is transactional atomicity — a stub that merely "supports transactions" would
 * prove nothing about whether SQLite actually rolls back.
 *
 * Loaded via createRequire rather than a static import: Vite's dependency
 * scanner does not recognise `node:sqlite` as a builtin and tries to resolve it
 * from disk, which fails. A runtime require sidesteps static analysis entirely.
 */

import { createRequire } from 'node:module';
import type { SqliteAdapter } from '../types.js';

interface Statement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (location: string) => Database;
};

export class NodeSqliteAdapter implements SqliteAdapter {
  readonly db: Database;

  constructor(location = ':memory:') {
    this.db = new DatabaseSync(location);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: readonly unknown[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  all<T>(sql: string, params: readonly unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Fails on the Nth statement matching a pattern, simulating a crash
 * mid-transaction. Used to prove the card update and the outbox insert cannot
 * be separated.
 */
export class FailingAdapter extends NodeSqliteAdapter {
  private count = 0;

  constructor(
    private readonly failOnMatch: RegExp,
    private readonly failAtOccurrence = 1,
  ) {
    super();
  }

  override run(sql: string, params: readonly unknown[] = []): void {
    if (this.failOnMatch.test(sql)) {
      this.count++;
      if (this.count === this.failAtOccurrence) {
        throw new Error('simulated crash');
      }
    }
    super.run(sql, params);
  }
}
