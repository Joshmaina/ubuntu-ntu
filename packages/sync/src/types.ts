/**
 * Platform abstraction for the on-device store.
 *
 * The same engine runs on three SQLite implementations (ADR-0007):
 *   - mobile: expo-sqlite
 *   - web:    SQLite-WASM over OPFS
 *   - tests:  node:sqlite
 *
 * The interface is deliberately tiny. Anything richer would start encoding one
 * driver's quirks and stop being portable.
 */

export interface SqliteAdapter {
  /** Execute one or more statements with no result. */
  exec(sql: string): void;
  /** Execute a parameterised statement. */
  run(sql: string, params?: readonly unknown[]): void;
  /** Query rows. */
  all<T>(sql: string, params?: readonly unknown[]): T[];
}

/** A review awaiting sync. */
export interface OutboxEvent {
  readonly eventId: string;
  readonly vocabItemId: string;
  readonly rating: 1 | 2 | 3 | 4;
  readonly reviewedAt: number;
  readonly durationMs: number;
  readonly attempts: number;
}

/** What the server returned for a batch. */
export interface IngestResponse {
  readonly accepted: readonly string[];
  readonly duplicate: readonly string[];
  readonly rejected: readonly { eventId: string; reason: string }[];
  readonly serverTime: string;
}

/** Transport, injected so the engine has no network dependency of its own. */
export type PushEvents = (
  events: readonly OutboxEvent[],
) => Promise<IngestResponse>;

export interface SyncOutcome {
  readonly pushed: number;
  readonly acknowledged: number;
  readonly rejected: number;
  readonly remaining: number;
  readonly error?: string;
}
