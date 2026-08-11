/**
 * Database client. Drizzle over node-postgres, using the shared schema.
 */

import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pg as tables } from '@ubuntu-ntu/schema';

export type Db = NodePgDatabase<typeof tables>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema: tables });
  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

export { tables };
