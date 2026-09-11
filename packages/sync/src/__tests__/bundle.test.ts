import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { LearningStore } from '../store.js';
import { BundleInstaller, InstallFailure, SUPPORTED_FORMAT_VERSION } from '../bundle.js';
import { Rating } from '@ubuntu-ntu/core';
import { NodeSqliteAdapter, FailingAdapter } from './node-adapter.js';

const NOW = Date.UTC(2026, 8, 11, 10, 0, 0);

const sha256 = (input: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(input, 'utf8').digest('hex'));

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    dialectId: 'ki-central',
    languageId: 'ki',
    countryCode: 'KE',
    communityRegion: 'Nyeri, Central',
    isTonal: true,
    anchorLanguages: ['en', 'sw'],
    skills: [{ id: 'ki.greetings' }],
    lessons: [
      { id: 'ki.greetings.l1', skillId: 'ki.greetings', orderIndex: 0, title: { en: 'Greetings' } },
      { id: 'ki.greetings.l2', skillId: 'ki.greetings', orderIndex: 1, title: { en: 'More' } },
    ],
    vocabulary: [
      { id: 'ki.greetings.v001', target: 'wĩ' },
      { id: 'ki.greetings.v002', target: 'mwega' },
    ],
    audioFiles: ['greetings/l1.opus'],
    ...overrides,
  };
}

/** Build a raw payload plus a matching descriptor. */
async function packaged(overrides: Record<string, unknown> = {}) {
  const raw = JSON.stringify(payload(overrides));
  const hash = await sha256(raw);
  return {
    raw,
    descriptor: {
      id: `bundle-ki-central-${hash.slice(0, 12)}`,
      version: 1,
      sha256: hash,
      sizeBytes: Buffer.byteLength(raw, 'utf8'),
    },
  };
}

function setup() {
  const adapter = new NodeSqliteAdapter();
  const store = new LearningStore(adapter);
  return { adapter, store, installer: new BundleInstaller(store, adapter, sha256) };
}

describe('install', () => {
  it('installs a valid bundle', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();

    const result = await installer.install(raw, descriptor, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lessons).toBe(2);
      expect(result.vocabulary).toBe(2);
    }
  });

  it('records the bundle with its geographic scope', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    const [installed] = installer.installed();
    expect(installed!.id).toBe(descriptor.id);
    expect(installed!.countryCode).toBe('KE');
    expect(installed!.communityRegion).toBe('Nyeri, Central');
    expect(installed!.installedAt).toBe(NOW);
  });

  it('makes lessons available offline, in order', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    const lessons = installer.lessonsForSkill('ki.greetings') as { id: string }[];
    expect(lessons.map((l) => l.id)).toEqual(['ki.greetings.l1', 'ki.greetings.l2']);
  });

  it('retrieves a single lesson by id', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    expect(installer.getLesson('ki.greetings.l1')).toMatchObject({ id: 'ki.greetings.l1' });
    expect(installer.getLesson('ki.nonexistent')).toBeNull();
  });

  it('exposes vocabulary ids', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    expect(installer.vocabularyIds()).toEqual(['ki.greetings.v001', 'ki.greetings.v002']);
  });

  it('reports whether a bundle is already present', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();

    expect(installer.hasBundle(descriptor.id)).toBe(false);
    await installer.install(raw, descriptor, NOW);
    expect(installer.hasBundle(descriptor.id)).toBe(true);
  });

  it('exposes the learning store it serves', () => {
    const { store, installer } = setup();
    expect(installer.learningStore).toBe(store);
  });
});

// ---------------------------------------------------------------------------
// Integrity — the property the installer exists for
// ---------------------------------------------------------------------------

describe('integrity', () => {
  /**
   * A truncated or tampered download must never become a lesson. A learner
   * silently taught from corrupt content is worse than one told to retry.
   */
  it('refuses a payload whose hash does not match', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();

    const result = await installer.install(raw + ' ', descriptor, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(InstallFailure.HashMismatch);
  });

  it('writes nothing when the hash does not match', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged();

    await installer.install(raw.replace('mwega', 'WRONG'), descriptor, NOW);

    expect(installer.installed()).toHaveLength(0);
    expect(installer.lessonsForSkill('ki.greetings')).toHaveLength(0);
  });

  it('refuses malformed JSON even when the hash matches', async () => {
    const { installer } = setup();
    const raw = 'not json at all';
    const hash = await sha256(raw);

    const result = await installer.install(raw, {
      id: 'bundle-x',
      version: 1,
      sha256: hash,
      sizeBytes: raw.length,
    }, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(InstallFailure.Malformed);
  });

  it('refuses valid JSON that is not a bundle', async () => {
    const { installer } = setup();
    const raw = JSON.stringify({ hello: 'world' });
    const hash = await sha256(raw);

    const result = await installer.install(raw, {
      id: 'bundle-x',
      version: 1,
      sha256: hash,
      sizeBytes: raw.length,
    }, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(InstallFailure.Malformed);
  });

  /**
   * An older client must REFUSE a newer format rather than guess at it.
   * Silently misreading newer content produces wrong lessons, not an error.
   */
  it('refuses a format version newer than it supports', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged({ formatVersion: SUPPORTED_FORMAT_VERSION + 1 });

    const result = await installer.install(raw, descriptor, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(InstallFailure.UnsupportedFormat);
      expect(result.message).toContain('update the app');
    }
  });

  it('accepts an older format version', async () => {
    const { installer } = setup();
    const { raw, descriptor } = await packaged({ formatVersion: 0 });
    expect((await installer.install(raw, descriptor, NOW)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reinstall and removal must never touch progress
// ---------------------------------------------------------------------------

describe('progress is never touched by content operations', () => {
  /**
   * Content is re-downloadable; a learner's memory state is not. No content
   * operation may ever write to cards or the outbox.
   */
  it('reinstalling preserves cards and pending events', async () => {
    const { store, installer } = setup();
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    store.applyReview({
      eventId: '00000000-0000-7000-8000-000000000001',
      vocabItemId: 'ki.greetings.v001',
      rating: Rating.Good,
      reviewedAt: NOW,
    });

    await installer.install(raw, descriptor, NOW + 1000);

    expect(store.getCard('ki.greetings.v001').reps).toBe(1);
    expect(store.pendingCount()).toBe(1);
  });

  it('removing a bundle preserves cards and pending events', async () => {
    const { store, installer } = setup();
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    store.applyReview({
      eventId: '00000000-0000-7000-8000-000000000002',
      vocabItemId: 'ki.greetings.v001',
      rating: Rating.Good,
      reviewedAt: NOW,
    });

    installer.remove(descriptor.id);

    expect(installer.installed()).toHaveLength(0);
    expect(installer.lessonsForSkill('ki.greetings')).toHaveLength(0);
    // Progress survives, so reinstalling later resumes rather than restarts.
    expect(store.getCard('ki.greetings.v001').reps).toBe(1);
    expect(store.pendingCount()).toBe(1);
  });

  /**
   * Content removed from a newer build must disappear, or learners keep seeing
   * lessons that were deliberately deleted.
   */
  it('replaces rather than merges when content is removed upstream', async () => {
    const { installer } = setup();
    const first = await packaged();
    await installer.install(first.raw, first.descriptor, NOW);
    expect(installer.lessonsForSkill('ki.greetings')).toHaveLength(2);

    const trimmed = await packaged({
      lessons: [
        {
          id: 'ki.greetings.l1',
          skillId: 'ki.greetings',
          orderIndex: 0,
          title: { en: 'Greetings' },
        },
      ],
    });
    // Same bundle id so it replaces in place, as a corrected republish would.
    await installer.install(trimmed.raw, { ...trimmed.descriptor, id: first.descriptor.id }, NOW);

    const lessons = installer.lessonsForSkill('ki.greetings') as { id: string }[];
    expect(lessons.map((l) => l.id)).toEqual(['ki.greetings.l1']);
  });

  it('installing a second bundle leaves the first intact', async () => {
    const { installer } = setup();
    const first = await packaged();
    await installer.install(first.raw, first.descriptor, NOW);

    const second = await packaged({
      dialectId: 'ki-nyeri',
      skills: [{ id: 'ki.market' }],
      lessons: [
        { id: 'ki.market.l1', skillId: 'ki.market', orderIndex: 0, title: { en: 'Market' } },
      ],
      vocabulary: [{ id: 'ki.market.v001', target: 'ndũnyũ' }],
    });
    await installer.install(second.raw, second.descriptor, NOW + 1);

    expect(installer.installed()).toHaveLength(2);
    expect(installer.lessonsForSkill('ki.greetings')).toHaveLength(2);
    expect(installer.lessonsForSkill('ki.market')).toHaveLength(1);
  });
});

describe('transactional install and removal', () => {
  /**
   * A half-installed bundle would serve some lessons and silently omit others —
   * the learner would see a broken syllabus with no error anywhere. Either the
   * whole bundle lands or none of it does.
   */
  it('rolls the whole install back if any lesson write fails', async () => {
    const adapter = new FailingAdapter(/INSERT INTO local_lessons/);
    const store = new LearningStore(adapter);
    const installer = new BundleInstaller(store, adapter, sha256);
    const { raw, descriptor } = await packaged();

    await expect(installer.install(raw, descriptor, NOW)).rejects.toThrow('simulated crash');

    expect(installer.installed()).toHaveLength(0);
    expect(installer.lessonsForSkill('ki.greetings')).toHaveLength(0);
    expect(installer.vocabularyIds()).toHaveLength(0);
  });

  it('rolls a failed removal back, leaving content usable', async () => {
    // Install succeeds (it never issues this DELETE); removal fails on it.
    const adapter = new FailingAdapter(/DELETE FROM installed_bundles/);
    const store = new LearningStore(adapter);
    const installer = new BundleInstaller(store, adapter, sha256);
    const { raw, descriptor } = await packaged();

    expect((await installer.install(raw, descriptor, NOW)).ok).toBe(true);
    expect(() => installer.remove(descriptor.id)).toThrow('simulated crash');

    // Still fully installed rather than partially dismantled.
    expect(installer.hasBundle(descriptor.id)).toBe(true);
    expect(installer.lessonsForSkill('ki.greetings')).toHaveLength(2);
  });
});

describe('durability', () => {
  it('installed content survives a store reopen', async () => {
    const adapter = new NodeSqliteAdapter();
    const store = new LearningStore(adapter);
    const installer = new BundleInstaller(store, adapter, sha256);
    const { raw, descriptor } = await packaged();
    await installer.install(raw, descriptor, NOW);

    // Reopen over the same database — what a force-close and relaunch does.
    const reopened = new BundleInstaller(new LearningStore(adapter), adapter, sha256);
    expect(reopened.hasBundle(descriptor.id)).toBe(true);
    expect(reopened.lessonsForSkill('ki.greetings')).toHaveLength(2);
  });
});
