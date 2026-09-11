/**
 * @ubuntu-ntu/schema — table definitions and content contracts.
 *
 * Postgres tables (server) and SQLite tables (mobile + web) are exported from
 * separate entry points because Drizzle's dialects are distinct builders. The
 * Zod contracts below are shared by everything.
 */

export * as pg from './pg.js';
export * as sqlite from './sqlite.js';
export * from './contracts.js';
export * from './bundle.js';
