/**
 * @ubuntu-ntu/core — the shared learning core.
 *
 * Imported identically by the mobile app, the web app, and the API server.
 * Zero dependencies, no I/O, no clock reads, no randomness (ADR-0002).
 *
 * That purity is not stylistic: it is what makes client and server incapable
 * of computing different schedules from the same review history, and what lets
 * the server derive authoritative state by replaying an event log (ADR-0003).
 */

export * from './types.js';
export * from './constants.js';
export * from './fsrs.js';
export * from './tone.js';
export * from './gloss.js';
export * from './geo.js';
