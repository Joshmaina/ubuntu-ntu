/**
 * @ubuntu-ntu/config — environment, feature flags, and adapter selection.
 *
 * This is the ONE place a paid service is chosen. Business logic depends on the
 * port interfaces below, never on a concrete adapter, so enabling a paid
 * service is a configuration change and a deploy — no logic touched
 * (docs/05-ARCHITECTURE.md §10).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Note the connection variable is UBUNTU_NTU_DATABASE_URL, not DATABASE_URL.
 *
 * A machine-wide DATABASE_URL belonging to an unrelated project silently
 * hijacked our migrations during M2 — the symptom presented as a schema error
 * rather than a configuration error. A project-scoped name removes that entire
 * class of failure.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  UBUNTU_NTU_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),

  STORAGE_DRIVER: z.enum(['minio', 's3']).default('minio'),
  ASR_DRIVER: z.enum(['null', 'hosted']).default('null'),
  NOTIFICATIONS_DRIVER: z.enum(['local', 'fcm']).default('local'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('ubuntuntu-audio'),

  /** Reject events dated further ahead than this. See sync protocol §8. */
  MAX_CLOCK_SKEW_MS: z.coerce.number().int().positive().default(86_400_000),
  /** Cap on events per ingest request. */
  MAX_EVENT_BATCH: z.coerce.number().int().positive().default(500),

  /**
   * Whether a VERIFIED contributor outside a dialect's country may still
   * contribute (ADR-0009).
   *
   * OFF by default, matching the strict geographic lock. The consequence is
   * documented and deliberate: a Yoruba speaker in London is refused regardless
   * of fluency, even though the diaspora is a primary audience in
   * 02-CONCEPT-NOTE.md. Exposed as configuration so the policy can be changed
   * by decision rather than by editing the rule.
   */
  ALLOW_DIASPORA_CONTRIBUTIONS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${detail}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/**
 * Three states, not a boolean.
 *
 * `shadow` runs the code path and logs what it WOULD have done, with no
 * user-visible effect. That is how a feature gets validated in production
 * before we can afford to turn it on — the middle state a boolean cannot
 * express (docs/05-ARCHITECTURE.md §10).
 */
export const FlagState = { Live: 'live', Shadow: 'shadow', Hidden: 'hidden' } as const;
export type FlagState = (typeof FlagState)[keyof typeof FlagState];

export interface Flags {
  readonly speechRecognition: FlagState;
  readonly contributorStudio: FlagState;
  readonly pushNotifications: FlagState;
  readonly leaderboards: FlagState;
}

export function resolveFlags(env: Env): Flags {
  return {
    speechRecognition: env.ASR_DRIVER === 'hosted' ? FlagState.Live : FlagState.Hidden,
    contributorStudio: FlagState.Hidden,
    pushNotifications: env.NOTIFICATIONS_DRIVER === 'fcm' ? FlagState.Live : FlagState.Hidden,
    leaderboards: FlagState.Hidden,
  };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** Thrown by a dormant adapter. Tested, so it can never surprise us live. */
export class NotConfiguredError extends Error {
  constructor(capability: string) {
    super(
      `${capability} is not configured in this environment. ` +
        `It is behind a port with no active adapter — see docs/05-ARCHITECTURE.md §10.`,
    );
    this.name = 'NotConfiguredError';
  }
}

export interface StoragePort {
  readonly name: string;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}

export interface AsrPort {
  readonly name: string;
  transcribe(audio: Uint8Array, languageCode: string): Promise<string>;
}

export interface NotificationsPort {
  readonly name: string;
  send(userId: string, title: string, body: string): Promise<void>;
}

/**
 * ASR has no free adapter — it is deferred indefinitely. Pitch comparison, not
 * speech recognition, is the differentiator (ADR-0005), so this stays dormant.
 *
 * It throws rather than silently no-ops so that a caller wiring it up by
 * mistake fails loudly in test rather than quietly in production.
 */
export class NullAsrAdapter implements AsrPort {
  readonly name = 'null';
  transcribe(): Promise<string> {
    return Promise.reject(new NotConfiguredError('Speech recognition'));
  }
}

export class HostedAsrAdapter implements AsrPort {
  readonly name = 'hosted';
  transcribe(): Promise<string> {
    // Written, unwired, and deliberately unimplemented until funded.
    return Promise.reject(new NotConfiguredError('Hosted speech recognition'));
  }
}

export function selectAsr(env: Env): AsrPort {
  return env.ASR_DRIVER === 'hosted' ? new HostedAsrAdapter() : new NullAsrAdapter();
}
