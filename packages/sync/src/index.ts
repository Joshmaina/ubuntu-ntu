/**
 * @ubuntu-ntu/sync — offline learning store and sync engine.
 *
 * Platform-agnostic. The mobile app supplies expo-sqlite, the web app supplies
 * SQLite-WASM, and tests supply node:sqlite — all through the same tiny
 * SqliteAdapter interface (ADR-0007).
 *
 * This is the component the M4 walking-skeleton gate actually exercises: the
 * UI is thin, but losing a review is unrecoverable.
 */

export * from './types.js';
export * from './store.js';
export * from './engine.js';
export * from './bundle.js';
