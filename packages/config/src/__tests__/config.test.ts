import { describe, it, expect } from 'vitest';
import {
  loadEnv,
  resolveFlags,
  selectAsr,
  FlagState,
  NotConfiguredError,
  NullAsrAdapter,
  HostedAsrAdapter,
} from '../index.js';

const base = {
  UBUNTU_NTU_DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  JWT_ACCESS_SECRET: 'a-sufficiently-long-secret',
  JWT_REFRESH_SECRET: 'another-sufficiently-long-secret',
};

describe('loadEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.ASR_DRIVER).toBe('null');
    expect(env.MAX_EVENT_BATCH).toBe(500);
  });

  it('coerces numeric strings', () => {
    expect(loadEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a missing database url', () => {
    const { UBUNTU_NTU_DATABASE_URL: _omitted, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/UBUNTU_NTU_DATABASE_URL/);
  });

  /** Short secrets are a real deployment mistake; fail at boot, not at runtime. */
  it('rejects a short JWT secret', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects an unknown driver', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'dropbox' })).toThrow(/STORAGE_DRIVER/);
  });

  it('rejects a non-positive port', () => {
    expect(() => loadEnv({ ...base, PORT: '0' })).toThrow();
  });

  /**
   * Guards the M2 lesson: a machine-wide DATABASE_URL must never be picked up.
   * If this ever starts passing, the collision hazard has returned.
   */
  it('ignores a bare DATABASE_URL', () => {
    expect(() =>
      loadEnv({
        JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: base.JWT_REFRESH_SECRET,
        DATABASE_URL: 'postgresql://someone-elses/project',
      }),
    ).toThrow(/UBUNTU_NTU_DATABASE_URL/);
  });
});

describe('resolveFlags', () => {
  it('hides speech recognition when the driver is null', () => {
    expect(resolveFlags(loadEnv(base)).speechRecognition).toBe(FlagState.Hidden);
  });

  it('goes live when the hosted driver is selected', () => {
    const env = loadEnv({ ...base, ASR_DRIVER: 'hosted' });
    expect(resolveFlags(env).speechRecognition).toBe(FlagState.Live);
  });

  it('keeps unfinished surfaces hidden', () => {
    const flags = resolveFlags(loadEnv(base));
    expect(flags.contributorStudio).toBe(FlagState.Hidden);
    expect(flags.leaderboards).toBe(FlagState.Hidden);
  });

  it('follows the notifications driver', () => {
    expect(resolveFlags(loadEnv(base)).pushNotifications).toBe(FlagState.Hidden);
    expect(resolveFlags(loadEnv({ ...base, NOTIFICATIONS_DRIVER: 'fcm' })).pushNotifications).toBe(
      FlagState.Live,
    );
  });
});

describe('ASR port', () => {
  it('selects the null adapter by default', () => {
    expect(selectAsr(loadEnv(base)).name).toBe('null');
  });

  it('selects the hosted adapter when configured', () => {
    expect(selectAsr(loadEnv({ ...base, ASR_DRIVER: 'hosted' })).name).toBe('hosted');
  });

  /**
   * A dormant adapter that has never once executed is not "ready" — it is a
   * liability waiting for a production incident. Both must fail cleanly and
   * recognisably.
   */
  it('null adapter rejects with NotConfiguredError', async () => {
    await expect(new NullAsrAdapter().transcribe()).rejects.toBeInstanceOf(NotConfiguredError);
  });

  it('hosted adapter rejects with NotConfiguredError until implemented', async () => {
    await expect(new HostedAsrAdapter().transcribe()).rejects.toBeInstanceOf(NotConfiguredError);
  });

  it('the error explains where to look', async () => {
    await expect(new NullAsrAdapter().transcribe()).rejects.toThrow(/ARCHITECTURE/);
  });
});
