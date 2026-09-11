/**
 * Bundle installation.
 *
 * Completes the offline content path: a device downloads an immutable,
 * content-addressed bundle, verifies it, and unpacks it into local tables that
 * serve lessons with no network.
 *
 * Two properties matter:
 *
 *   1. INTEGRITY. A bundle whose hash does not match is rejected outright. A
 *      partial or corrupted download must never become a lesson — a learner
 *      silently taught from truncated content is worse than one told to retry.
 *
 *   2. PROGRESS IS NEVER TOUCHED. Installing, reinstalling, or removing a
 *      bundle only ever writes CONTENT tables. A learner's cards and outbox are
 *      irreplaceable; content is re-downloadable.
 */

import type { LearningStore } from './store.js';
import type { SqliteAdapter } from './types.js';

/**
 * Minimal shape the installer needs. Kept structural so this package does not
 * depend on @ubuntu-ntu/schema — sync stays installable anywhere.
 */
export interface InstallableBundle {
  formatVersion: number;
  dialectId: string;
  languageId: string;
  countryCode: string;
  communityRegion: string;
  isTonal: boolean;
  anchorLanguages: string[];
  skills: { id: string }[];
  lessons: { id: string; skillId: string; orderIndex: number; [key: string]: unknown }[];
  vocabulary: { id: string; target: string; [key: string]: unknown }[];
  audioFiles: string[];
}

export interface BundleDescriptor {
  readonly id: string;
  readonly version: number;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface InstalledBundle {
  readonly id: string;
  readonly dialectId: string;
  readonly version: number;
  readonly sha256: string;
  readonly countryCode: string;
  readonly communityRegion: string;
  readonly installedAt: number;
}

export const InstallFailure = {
  HashMismatch: 'BUNDLE_HASH_MISMATCH',
  UnsupportedFormat: 'BUNDLE_FORMAT_UNSUPPORTED',
  Malformed: 'BUNDLE_MALFORMED',
} as const;

export type InstallFailure = (typeof InstallFailure)[keyof typeof InstallFailure];

export type InstallResult =
  | { readonly ok: true; readonly lessons: number; readonly vocabulary: number }
  | { readonly ok: false; readonly code: InstallFailure; readonly message: string };

/** Highest bundle format this client understands. */
export const SUPPORTED_FORMAT_VERSION = 1;

/**
 * Compute a hex SHA-256 of a string.
 *
 * INJECTED rather than imported. Node has node:crypto, browsers have
 * crypto.subtle, React Native needs a polyfill — importing any one of them
 * would tie this package to a single runtime and break the "one engine, three
 * platforms" guarantee (ADR-0007). Same discipline as the injected clock.
 */
export type Sha256 = (input: string) => Promise<string>;

export class BundleInstaller {
  constructor(
    private readonly store: LearningStore,
    private readonly db: SqliteAdapter,
    private readonly sha256: Sha256,
  ) {}

  /**
   * Verify and install a bundle.
   *
   * `rawPayload` is the exact serialised text that was hashed at build time —
   * NOT a re-serialisation of the parsed object. Re-serialising could reorder
   * keys and produce a different hash for identical content, turning a valid
   * bundle into a spurious integrity failure.
   */
  async install(
    rawPayload: string,
    descriptor: BundleDescriptor,
    now: number,
  ): Promise<InstallResult> {
    const actual = await this.sha256(rawPayload);
    if (actual !== descriptor.sha256) {
      return {
        ok: false,
        code: InstallFailure.HashMismatch,
        message: `expected sha256 ${descriptor.sha256}, computed ${actual}`,
      };
    }

    let bundle: InstallableBundle;
    try {
      bundle = JSON.parse(rawPayload) as InstallableBundle;
    } catch (error) {
      // The only statement in this try is JSON.parse, which throws nothing but
      // SyntaxError. An `instanceof Error` guard here would be a branch that can
      // never be taken, and therefore never tested.
      return {
        ok: false,
        code: InstallFailure.Malformed,
        message: (error as SyntaxError).message,
      };
    }

    if (bundle === null || typeof bundle !== 'object' || !Array.isArray(bundle.lessons)) {
      return {
        ok: false,
        code: InstallFailure.Malformed,
        message: 'bundle is not a valid payload object',
      };
    }

    // Refuse a newer format rather than guessing. An older client silently
    // misreading a newer bundle would produce wrong lessons, not an error.
    if (bundle.formatVersion > SUPPORTED_FORMAT_VERSION) {
      return {
        ok: false,
        code: InstallFailure.UnsupportedFormat,
        message:
          `bundle format ${bundle.formatVersion} is newer than supported ` +
          `${SUPPORTED_FORMAT_VERSION} — update the app`,
      };
    }

    // One transaction: a half-installed bundle would serve some lessons and
    // silently omit others.
    this.db.exec('BEGIN');
    try {
      this.db.run(
        `INSERT INTO installed_bundles
           (id, dialect_id, version, sha256, size_bytes, country_code, community_region, installed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET installed_at = excluded.installed_at`,
        [
          descriptor.id,
          bundle.dialectId,
          descriptor.version,
          descriptor.sha256,
          descriptor.sizeBytes,
          bundle.countryCode,
          bundle.communityRegion,
          now,
        ],
      );

      // Replace this bundle's rows rather than merging: content removed from a
      // newer build must disappear, or learners keep seeing deleted lessons.
      this.db.run('DELETE FROM local_lessons WHERE bundle_id = ?', [descriptor.id]);
      this.db.run('DELETE FROM local_vocabulary WHERE bundle_id = ?', [descriptor.id]);

      for (const lesson of bundle.lessons) {
        this.db.run(
          `INSERT INTO local_lessons (id, bundle_id, skill_id, order_index, payload)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             bundle_id = excluded.bundle_id,
             skill_id = excluded.skill_id,
             order_index = excluded.order_index,
             payload = excluded.payload`,
          [lesson.id, descriptor.id, lesson.skillId, lesson.orderIndex, JSON.stringify(lesson)],
        );
      }

      for (const item of bundle.vocabulary) {
        this.db.run(
          `INSERT INTO local_vocabulary (id, bundle_id, target, payload)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             bundle_id = excluded.bundle_id,
             target = excluded.target,
             payload = excluded.payload`,
          [item.id, descriptor.id, item.target, JSON.stringify(item)],
        );
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return { ok: true, lessons: bundle.lessons.length, vocabulary: bundle.vocabulary.length };
  }

  installed(): InstalledBundle[] {
    return this.db
      .all<{
        id: string;
        dialect_id: string;
        version: number;
        sha256: string;
        country_code: string;
        community_region: string;
        installed_at: number;
      }>('SELECT * FROM installed_bundles ORDER BY installed_at ASC')
      .map((r) => ({
        id: r.id,
        dialectId: r.dialect_id,
        version: r.version,
        sha256: r.sha256,
        countryCode: r.country_code,
        communityRegion: r.community_region,
        installedAt: r.installed_at,
      }));
  }

  /** Is this exact content already present? Content addressing makes this cheap. */
  hasBundle(id: string): boolean {
    return (
      this.db.all<{ n: number }>(
        'SELECT COUNT(*) AS n FROM installed_bundles WHERE id = ?',
        [id],
      )[0]!.n > 0
    );
  }

  /** Lessons for a skill, in order, available with no network. */
  lessonsForSkill(skillId: string): unknown[] {
    return this.db
      .all<{ payload: string }>(
        'SELECT payload FROM local_lessons WHERE skill_id = ? ORDER BY order_index ASC',
        [skillId],
      )
      .map((r) => JSON.parse(r.payload) as unknown);
  }

  getLesson(lessonId: string): unknown | null {
    const rows = this.db.all<{ payload: string }>(
      'SELECT payload FROM local_lessons WHERE id = ?',
      [lessonId],
    );
    return rows.length === 0 ? null : (JSON.parse(rows[0]!.payload) as unknown);
  }

  /** Vocabulary ids in this bundle — what the scheduler may legitimately show. */
  vocabularyIds(): string[] {
    return this.db
      .all<{ id: string }>('SELECT id FROM local_vocabulary ORDER BY id ASC')
      .map((r) => r.id);
  }

  /**
   * Remove a bundle's content. Progress is deliberately untouched: a learner
   * who frees storage and later reinstalls must not lose their memory state.
   */
  remove(bundleId: string): void {
    this.db.exec('BEGIN');
    try {
      this.db.run('DELETE FROM local_lessons WHERE bundle_id = ?', [bundleId]);
      this.db.run('DELETE FROM local_vocabulary WHERE bundle_id = ?', [bundleId]);
      this.db.run('DELETE FROM installed_bundles WHERE id = ?', [bundleId]);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** The learning store this installer serves content to. */
  get learningStore(): LearningStore {
    return this.store;
  }
}
