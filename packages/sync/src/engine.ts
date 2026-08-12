/**
 * Sync engine.
 *
 * Pushes queued reviews when connectivity allows. Three rules from
 * docs/08-SYNC-PROTOCOL.md:
 *
 *   1. Sync failure NEVER blocks or degrades learning (FR-094). A failed push
 *      is not an error state shown to the user; the events simply stay queued.
 *   2. Retry is naive because ingestion is idempotent. Re-sending a batch is
 *      harmless, so the client does not need clever bookkeeping.
 *   3. Backoff carries jitter. When a whole region regains connectivity at once
 *      — a realistic scenario in the target market — unjittered retries would
 *      arrive as a synchronised thundering herd.
 */

import type { LearningStore } from './store.js';
import type { PushEvents, SyncOutcome } from './types.js';

export interface SyncEngineOptions {
  readonly batchSize?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Injected jitter source in [0,1). Injected, not generated, so tests are deterministic. */
  readonly jitter?: () => number;
}

export class SyncEngine {
  private readonly batchSize: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: () => number;
  private inFlight = false;

  constructor(
    private readonly store: LearningStore,
    private readonly push: PushEvents,
    options: SyncEngineOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 500;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 300_000;
    this.jitter = options.jitter ?? (() => 0.5);
  }

  /**
   * Attempt one sync pass.
   *
   * Never throws. A transport failure is reported in the result and the events
   * remain queued — the caller has nothing to handle and the learner sees
   * nothing.
   */
  async sync(now: number): Promise<SyncOutcome> {
    // Guard against overlapping passes (e.g. a manual trigger during a timer
    // pass). Two concurrent pushes of the same events would be harmless thanks
    // to idempotency, but wasteful on metered data.
    if (this.inFlight) {
      return { pushed: 0, acknowledged: 0, rejected: 0, remaining: this.store.pendingCount() };
    }

    const pending = this.store.pendingEvents(this.batchSize);
    if (pending.length === 0) {
      return { pushed: 0, acknowledged: 0, rejected: 0, remaining: 0 };
    }

    // Deliberately not try/finally: the catch below handles every failure, so
    // finally's exceptional-completion edge would be unreachable code.
    this.inFlight = true;
    try {
      this.store.recordAttempt(
        pending.map((e) => e.eventId),
        now,
      );

      const response = await this.push(pending);

      // Accepted and duplicate are treated identically: in both cases the
      // server now holds the event, so the client can stop tracking it.
      const settled = [...response.accepted, ...response.duplicate];
      this.store.markAcknowledged(settled, now);

      // Permanently unacceptable events are dropped rather than retried
      // forever — one poison event must not block the whole queue.
      const permanent = response.rejected
        .filter((r) => r.reason !== 'clock_skew_exceeded')
        .map((r) => r.eventId);
      this.store.discard(permanent);

      // Clock skew IS retryable: the client re-stamps against serverTime and
      // tries again, so those events stay queued deliberately.

      this.store.purgeAcknowledged(now);

      this.inFlight = false;
      return {
        pushed: pending.length,
        acknowledged: settled.length,
        rejected: response.rejected.length,
        remaining: this.store.pendingCount(),
      };
    } catch (error) {
      // FR-094: sync failure is invisible to the learner. Events stay queued.
      this.inFlight = false;
      return {
        pushed: 0,
        acknowledged: 0,
        rejected: 0,
        remaining: this.store.pendingCount(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delay before the next attempt: exponential backoff with jitter, capped.
   *
   * Jitter is multiplicative on the full interval rather than additive, so
   * retries spread across the whole window instead of clustering at its start.
   */
  nextDelayMs(attempts: number): number {
    const exponential = this.baseDelayMs * 2 ** Math.max(0, attempts - 1);
    const capped = Math.min(exponential, this.maxDelayMs);
    return Math.round(capped * (0.5 + this.jitter() * 0.5));
  }

  /** Whether a queued event is ready to retry at `now`. */
  isReadyToRetry(attempts: number, lastAttemptAt: number | null, now: number): boolean {
    if (lastAttemptAt === null) return true;
    return now - lastAttemptAt >= this.nextDelayMs(attempts);
  }
}
