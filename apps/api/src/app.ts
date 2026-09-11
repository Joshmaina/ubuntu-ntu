/**
 * Fastify application factory.
 *
 * Schema-first: every route declares Zod schemas, which serve three purposes at
 * once — runtime validation, TypeScript types, and the generated OpenAPI
 * document. That is why Fastify was chosen over Express: a hand-maintained
 * OpenAPI file drifts from the code within weeks, and a generated one cannot.
 */

import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify';
import fastifySwagger from '@fastify/swagger';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { eq, and, isNull, lte, asc, sql } from 'drizzle-orm';
import type { Env } from '@ubuntu-ntu/config';
import { tables, type Db } from './db.js';
import {
  issueTokens,
  refreshTokens,
  revokeFamily,
  verifyAccessToken,
} from './auth/tokens.js';
import { ingestEvents } from './events/ingest.js';
import { registerContributionRoutes } from './contributions/routes.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AppDeps {
  db: Db;
  env: Env;
  /** Injectable clock — keeps time-dependent behaviour testable (NFR-062). */
  now?: () => number;
}

const errorResponse = z.object({ error: z.string(), message: z.string() });

export async function buildApp({ db, env, now = Date.now }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
    // Body cap: a 500-event batch is ~60KB. 1MB is generous without being a
    // memory-exhaustion vector.
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'UBUNTU-NTU API',
        description:
          'Offline-first African language learning. Progress synchronises as an ' +
          'append-only event log; server state is derived by deterministic replay.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  /** Reject unauthenticated requests. userId comes from the TOKEN, never the body. */
  async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      await reply.code(401).send({ error: 'unauthorized', message: 'missing bearer token' });
      return;
    }
    const claims = await verifyAccessToken(header.slice(7), env);
    if (claims === null) {
      await reply.code(401).send({ error: 'unauthorized', message: 'invalid or expired token' });
      return;
    }
    request.userId = claims.sub;
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/health',
    schema: {
      tags: ['system'],
      response: { 200: z.object({ status: z.literal('ok'), database: z.boolean() }) },
    },
    handler: async () => {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok' as const, database: true };
    },
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  const credentials = z.object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(200),
  });

  const tokenResponse = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/auth/register',
    schema: {
      tags: ['auth'],
      body: credentials.extend({
        anchorLanguage: z.string().max(10).default('en'),
        uiLocale: z.string().max(10).default('en'),
        /**
         * ISO 3166-1 alpha-2. Required because contribution rights are scoped
         * to it (ADR-0009). Learners are unaffected by the value; only
         * contributors are.
         */
        homeCountryCode: z
          .string()
          .regex(/^[A-Z]{2}$/, 'must be ISO 3166-1 alpha-2, e.g. KE'),
      }),
      response: { 201: tokenResponse, 409: errorResponse },
    },
    handler: async (request, reply) => {
      const { email, password, anchorLanguage, uiLocale, homeCountryCode } = request.body;

      const existing = await db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(eq(tables.users.email, email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        return reply
          .code(409)
          .send({ error: 'email_taken', message: 'an account with this email already exists' });
      }

      // argon2id. The hash is never logged and the plaintext never stored (FR-002).
      const passwordHash = await hash(password);

      const [user] = await db
        .insert(tables.users)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          anchorLanguage,
          uiLocale,
          homeCountryCode,
        })
        .returning({ id: tables.users.id });

      // Every account gets a default profile immediately, so the phase-2
      // switchover to profile-keyed progress has nothing to backfill.
      await db.insert(tables.learnerProfiles).values({
        accountId: user!.id,
        displayName: 'Default',
        anchorLanguage,
        uiLocale,
        isDefault: true,
      });

      return reply.code(201).send(await issueTokens(db, user!.id, env));
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/auth/login',
    schema: {
      tags: ['auth'],
      body: credentials,
      response: { 200: tokenResponse, 401: errorResponse },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body;

      const [user] = await db
        .select()
        .from(tables.users)
        .where(and(eq(tables.users.email, email.toLowerCase()), isNull(tables.users.deletedAt)))
        .limit(1);

      // Same response whether the account is absent or the password is wrong,
      // so the endpoint cannot be used to enumerate registered emails.
      const invalid = { error: 'invalid_credentials', message: 'email or password is incorrect' };

      if (user === undefined) return reply.code(401).send(invalid);
      if (!(await verify(user.passwordHash, password))) return reply.code(401).send(invalid);

      return issueTokens(db, user.id, env);
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/auth/refresh',
    schema: {
      tags: ['auth'],
      body: z.object({ refreshToken: z.string().min(1) }),
      response: { 200: tokenResponse, 401: errorResponse },
    },
    handler: async (request, reply) => {
      const outcome = await refreshTokens(db, request.body.refreshToken, env);
      if (outcome.ok) return outcome.tokens;

      const message =
        outcome.reason === 'reused'
          ? 'refresh token was already used; the session family has been revoked'
          : 'refresh token is invalid or expired';

      return reply.code(401).send({ error: `refresh_${outcome.reason}`, message });
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/auth/logout',
    schema: {
      tags: ['auth'],
      body: z.object({ refreshToken: z.string().min(1) }),
      response: { 204: z.null() },
    },
    handler: async (request, reply) => {
      await revokeFamily(db, request.body.refreshToken);
      return reply.code(204).send(null);
    },
  });

  // -------------------------------------------------------------------------
  // Content bundles
  // -------------------------------------------------------------------------

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/v1/bundles/manifest',
    schema: {
      tags: ['content'],
      querystring: z.object({ dialect: z.string().min(2) }),
      response: {
        200: z.object({
          dialect: z.string(),
          /** Geographic scope, always present in bundle metadata (ADR-0009). */
          countryCode: z.string(),
          communityRegion: z.string(),
          languageId: z.string(),
          bundles: z.array(
            z.object({
              id: z.string(),
              version: z.number(),
              sizeBytes: z.number(),
              sha256: z.string(),
              lessonIds: z.array(z.string()),
            }),
          ),
        }),
        404: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const [dialect] = await db
        .select({
          id: tables.dialects.id,
          languageId: tables.dialects.languageId,
          countryCode: tables.dialects.countryCode,
          communityRegion: tables.dialects.communityRegion,
        })
        .from(tables.dialects)
        .where(eq(tables.dialects.id, request.query.dialect))
        .limit(1);

      if (dialect === undefined) {
        return reply
          .code(404)
          .send({ error: 'dialect_not_found', message: `unknown dialect "${request.query.dialect}"` });
      }

      const rows = await db
        .select()
        .from(tables.bundles)
        .where(eq(tables.bundles.dialectId, dialect.id))
        .orderBy(asc(tables.bundles.version));

      return {
        dialect: dialect.id,
        countryCode: dialect.countryCode,
        communityRegion: dialect.communityRegion,
        languageId: dialect.languageId,
        bundles: rows.map((b) => ({
          id: b.id,
          version: b.version,
          sizeBytes: b.sizeBytes,
          sha256: b.sha256,
          lessonIds: b.lessonIds as string[],
        })),
      };
    },
  });

  /**
   * Download a bundle.
   *
   * Returns the EXACT serialised text whose sha256 is in the manifest. The
   * client re-hashes these bytes before installing, so the API must not
   * re-serialise, pretty-print, or otherwise normalise the payload — any of
   * which would change the hash and make a valid bundle look corrupt.
   */
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/v1/bundles/:id',
    schema: {
      tags: ['content'],
      params: z.object({ id: z.string().min(1).max(128) }),
      // 200 is the raw bundle text. Fastify sends string payloads verbatim
      // without invoking the serialiser, which is exactly what is needed: the
      // client hashes these bytes, so any normalisation would break integrity.
      // The content-delivery test asserts sha256(response.body) against the
      // manifest, so a regression here fails loudly rather than silently.
      response: { 200: z.string(), 404: errorResponse },
    },
    handler: async (request, reply) => {
      const [bundle] = await db
        .select()
        .from(tables.bundles)
        .where(eq(tables.bundles.id, request.params.id))
        .limit(1);

      if (bundle === undefined || bundle.payload === null) {
        return reply
          .code(404)
          .send({ error: 'bundle_not_found', message: `unknown bundle "${request.params.id}"` });
      }

      // Content-addressed, therefore immutable: a given id can never mean
      // different bytes, so it is safe to cache forever.
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('x-bundle-sha256', bundle.sha256)
        .send(bundle.payload);
    },
  });

  // -------------------------------------------------------------------------
  // Review events  — the heart of ADR-0003
  // -------------------------------------------------------------------------

  const incomingEvent = z.object({
    eventId: z.string().uuid(),
    vocabItemId: z.string().min(1).max(128),
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    reviewedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative().optional(),
    clientId: z.string().max(64).optional(),
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/events',
    preHandler: requireAuth,
    schema: {
      tags: ['sync'],
      security: [{ bearerAuth: [] }],
      body: z.object({ events: z.array(incomingEvent).max(env.MAX_EVENT_BATCH) }),
      response: {
        200: z.object({
          accepted: z.array(z.string()),
          duplicate: z.array(z.string()),
          rejected: z.array(z.object({ eventId: z.string(), reason: z.string() })),
          serverTime: z.string(),
        }),
        401: errorResponse,
      },
    },
    handler: async (request) =>
      // userId comes from the verified token — a client-supplied one is ignored
      // entirely, so no client can write to another user's progress.
      ingestEvents(db, request.userId!, request.body.events, env, now()),
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/v1/cards/due',
    preHandler: requireAuth,
    schema: {
      tags: ['sync'],
      security: [{ bearerAuth: [] }],
      querystring: z.object({ limit: z.coerce.number().int().positive().max(200).default(50) }),
      response: {
        200: z.object({
          cards: z.array(
            z.object({
              vocabItemId: z.string(),
              state: z.number(),
              stability: z.number(),
              difficulty: z.number(),
              reps: z.number(),
              lapses: z.number(),
              due: z.string().nullable(),
            }),
          ),
        }),
        401: errorResponse,
      },
    },
    handler: async (request) => {
      const rows = await db
        .select()
        .from(tables.userFsrsCards)
        .where(
          and(
            eq(tables.userFsrsCards.userId, request.userId!),
            lte(tables.userFsrsCards.due, new Date(now())),
          ),
        )
        .orderBy(asc(tables.userFsrsCards.due))
        .limit(request.query.limit);

      return {
        cards: rows.map((c) => ({
          vocabItemId: c.vocabItemId,
          state: c.state,
          stability: c.stability,
          difficulty: c.difficulty,
          reps: c.reps,
          lapses: c.lapses,
          due: c.due === null ? null : c.due.toISOString(),
        })),
      };
    },
  });

  await registerContributionRoutes(app, {
    db,
    requireAuth,
    allowDiasporaOverride: env.ALLOW_DIASPORA_CONTRIBUTIONS,
  });

  return app;
}
