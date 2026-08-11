/**
 * Token issuing and refresh rotation.
 *
 * Short-lived access token, long-lived rotating refresh token. Refresh tokens
 * are stored HASHED — a database leak must not yield usable credentials.
 *
 * NFR-034: reuse of a consumed refresh token invalidates the entire family.
 * That is the standard defence against a stolen refresh token: the thief and
 * the legitimate user cannot both keep rotating, so the second use of any
 * consumed token proves compromise and kills the session.
 */

import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { and, eq } from 'drizzle-orm';
import type { Env } from '@ubuntu-ntu/config';
import { tables, type Db } from '../db.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AccessClaims {
  sub: string;
}

const encoder = new TextEncoder();

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function signAccessToken(userId: string, env: Env): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(encoder.encode(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(token: string, env: Env): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.JWT_ACCESS_SECRET));
    return typeof payload.sub === 'string' ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}

/** Issue a token pair, starting a new refresh family. */
export async function issueTokens(db: Db, userId: string, env: Env): Promise<TokenPair> {
  return rotate(db, userId, randomUUID(), env);
}

async function rotate(db: Db, userId: string, familyId: string, env: Env): Promise<TokenPair> {
  const refreshToken = randomUUID() + randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);

  await db.insert(tables.refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt,
  });

  return {
    accessToken: await signAccessToken(userId, env),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL,
  };
}

export type RefreshOutcome =
  | { ok: true; tokens: TokenPair }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' };

/**
 * Exchange a refresh token for a new pair.
 *
 * If the presented token was already consumed, the family is compromised:
 * every token in it is revoked and the caller must sign in again.
 */
export async function refreshTokens(
  db: Db,
  presented: string,
  env: Env,
): Promise<RefreshOutcome> {
  const hash = hashToken(presented);

  const [row] = await db
    .select()
    .from(tables.refreshTokens)
    .where(eq(tables.refreshTokens.tokenHash, hash))
    .limit(1);

  if (row === undefined) return { ok: false, reason: 'unknown' };

  if (row.consumedAt !== null) {
    // Replay detected. Revoke the whole family rather than just this token.
    await db
      .delete(tables.refreshTokens)
      .where(eq(tables.refreshTokens.familyId, row.familyId));
    return { ok: false, reason: 'reused' };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  await db
    .update(tables.refreshTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(tables.refreshTokens.id, row.id), eq(tables.refreshTokens.tokenHash, hash)));

  return { ok: true, tokens: await rotate(db, row.userId, row.familyId, env) };
}

/** Sign out: drop the whole family so no rotation can continue. */
export async function revokeFamily(db: Db, presented: string): Promise<void> {
  const [row] = await db
    .select({ familyId: tables.refreshTokens.familyId })
    .from(tables.refreshTokens)
    .where(eq(tables.refreshTokens.tokenHash, hashToken(presented)))
    .limit(1);

  if (row !== undefined) {
    await db.delete(tables.refreshTokens).where(eq(tables.refreshTokens.familyId, row.familyId));
  }
}
