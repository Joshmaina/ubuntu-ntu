/**
 * Contributor audio submission and peer validation, with geographic locking.
 *
 * The decision logic lives in @ubuntu-ntu/core (geo.ts) — these routes only
 * fetch state and translate a decision into HTTP. Keeping the rule pure means
 * it is exhaustively tested without a database, and identical wherever it runs.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import {
  canContributeAudio,
  canVoteOnContribution,
  type ContributorScope,
  type DialectScope,
} from '@ubuntu-ntu/core';
import { tables, type Db } from '../db.js';

const errorResponse = z.object({ error: z.string(), message: z.string() });

export interface ContributionRouteDeps {
  db: Db;
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /**
   * Whether a verified contributor outside the dialect's country may still
   * contribute. OFF by default, matching the strict specification. See
   * ADR-0009 — the diaspora consequence is a policy decision, not a bug.
   */
  allowDiasporaOverride: boolean;
}

export async function registerContributionRoutes(
  app: FastifyInstance,
  { db, requireAuth, allowDiasporaOverride }: ContributionRouteDeps,
): Promise<void> {
  /** Load the scope objects the geo rules need. */
  async function loadScopes(
    userId: string,
    dialectId: string,
  ): Promise<{ contributor: ContributorScope; dialect: DialectScope } | null> {
    const [user] = await db
      .select({
        homeCountryCode: tables.users.homeCountryCode,
        verifiedDialects: tables.users.verifiedDialects,
      })
      .from(tables.users)
      .where(eq(tables.users.id, userId))
      .limit(1);

    const [dialect] = await db
      .select({
        id: tables.dialects.id,
        countryCode: tables.dialects.countryCode,
        communityRegion: tables.dialects.communityRegion,
      })
      .from(tables.dialects)
      .where(eq(tables.dialects.id, dialectId))
      .limit(1);

    if (user === undefined || dialect === undefined) return null;

    return {
      contributor: {
        homeCountryCode: user.homeCountryCode,
        verifiedDialects: user.verifiedDialects,
      },
      dialect,
    };
  }

  // -------------------------------------------------------------------------
  // Submit audio
  // -------------------------------------------------------------------------

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/contributions/audio',
    preHandler: requireAuth,
    schema: {
      tags: ['contributions'],
      security: [{ bearerAuth: [] }],
      body: z.object({
        dialectId: z.string().min(2).max(32),
        promptText: z.string().min(1),
        audioPath: z.string().min(1),
        vocabItemId: z.string().max(128).optional(),
        durationMs: z.number().int().positive().optional(),
        snrDb: z.number().optional(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          status: z.string(),
          dialectId: z.string(),
          countryCode: z.string(),
        }),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const { dialectId, promptText, audioPath, vocabItemId, durationMs, snrDb } = request.body;

      const scopes = await loadScopes(request.userId!, dialectId);
      if (scopes === null) {
        return reply
          .code(404)
          .send({ error: 'dialect_not_found', message: `unknown dialect "${dialectId}"` });
      }

      const decision = canContributeAudio(scopes.contributor, scopes.dialect, {
        allowDiasporaOverride,
      });

      if (!decision.allowed) {
        return reply.code(403).send({ error: decision.code, message: decision.message });
      }

      const [row] = await db
        .insert(tables.audioContributions)
        .values({
          contributorId: request.userId!,
          dialectId,
          vocabItemId: vocabItemId ?? null,
          promptText,
          audioPath,
          durationMs: durationMs ?? null,
          snrDb: snrDb ?? null,
          // Captured at submission time so the audit trail survives a later
          // correction to the dialect's country.
          countryCode: scopes.dialect.countryCode,
        })
        .returning({
          id: tables.audioContributions.id,
          status: tables.audioContributions.status,
        });

      return reply.code(201).send({
        id: row!.id,
        status: row!.status,
        dialectId,
        countryCode: scopes.dialect.countryCode,
      });
    },
  });

  // -------------------------------------------------------------------------
  // Vote on a submission
  // -------------------------------------------------------------------------

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/contributions/:id/vote',
    preHandler: requireAuth,
    schema: {
      tags: ['contributions'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        vote: z.enum(['approve', 'reject', 'wrong_dialect']),
        reason: z.string().max(50).optional(),
      }),
      response: {
        201: z.object({ recorded: z.literal(true), vote: z.string() }),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const [submission] = await db
        .select()
        .from(tables.audioContributions)
        .where(eq(tables.audioContributions.id, request.params.id))
        .limit(1);

      if (submission === undefined) {
        return reply
          .code(404)
          .send({ error: 'contribution_not_found', message: 'no such contribution' });
      }

      const scopes = await loadScopes(request.userId!, submission.dialectId);
      if (scopes === null) {
        return reply
          .code(404)
          .send({ error: 'dialect_not_found', message: 'dialect no longer exists' });
      }

      const decision = canVoteOnContribution(
        { ...scopes.contributor, userId: request.userId! },
        scopes.dialect,
        { contributorId: submission.contributorId },
        { allowDiasporaOverride },
      );

      if (!decision.allowed) {
        return reply.code(403).send({ error: decision.code, message: decision.message });
      }

      const existing = await db
        .select({ id: tables.contributionVotes.id })
        .from(tables.contributionVotes)
        .where(
          and(
            eq(tables.contributionVotes.contributionId, submission.id),
            eq(tables.contributionVotes.reviewerId, request.userId!),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return reply
          .code(409)
          .send({ error: 'already_voted', message: 'you have already voted on this submission' });
      }

      await db.insert(tables.contributionVotes).values({
        contributionId: submission.id,
        reviewerId: request.userId!,
        vote: request.body.vote,
        reason: request.body.reason ?? null,
      });

      return reply.code(201).send({ recorded: true as const, vote: request.body.vote });
    },
  });

  // -------------------------------------------------------------------------
  // Review queue — scoped to what the reviewer is actually entitled to judge
  // -------------------------------------------------------------------------

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/v1/contributions/queue',
    preHandler: requireAuth,
    schema: {
      tags: ['contributions'],
      security: [{ bearerAuth: [] }],
      querystring: z.object({ dialectId: z.string().min(2).max(32) }),
      response: {
        200: z.object({
          dialectId: z.string(),
          countryCode: z.string(),
          contributions: z.array(
            z.object({
              id: z.string(),
              promptText: z.string(),
              audioPath: z.string(),
              status: z.string(),
            }),
          ),
        }),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const scopes = await loadScopes(request.userId!, request.query.dialectId);
      if (scopes === null) {
        return reply
          .code(404)
          .send({ error: 'dialect_not_found', message: 'unknown dialect' });
      }

      // The queue itself is gated: a reviewer must not even SEE submissions for
      // a community they cannot judge. Filtering only at vote time would leak
      // one community's recordings to another.
      const decision = canContributeAudio(scopes.contributor, scopes.dialect, {
        allowDiasporaOverride,
      });
      if (!decision.allowed) {
        return reply.code(403).send({ error: decision.code, message: decision.message });
      }

      const rows = await db
        .select({
          id: tables.audioContributions.id,
          promptText: tables.audioContributions.promptText,
          audioPath: tables.audioContributions.audioPath,
          status: tables.audioContributions.status,
        })
        .from(tables.audioContributions)
        .where(
          and(
            eq(tables.audioContributions.dialectId, request.query.dialectId),
            eq(tables.audioContributions.status, 'pending'),
          ),
        )
        .limit(50);

      return {
        dialectId: scopes.dialect.id,
        countryCode: scopes.dialect.countryCode,
        contributions: rows,
      };
    },
  });
}
