import { hash, verify } from "argon2";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { users, sessions } from "@costco-refunder/shared";
import type { FastifyRequest, FastifyReply } from "fastify";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  hashed: string,
  plain: string
): Promise<boolean> {
  return verify(hashed, plain);
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return sessionId;
}

export async function validateSession(
  sessionId: string
): Promise<string | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return session.userId;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies?.session;
  if (!sessionId) {
    reply.status(401).send({ success: false, error: "Not authenticated" });
    return;
  }

  const userId = await validateSession(sessionId);
  if (!userId) {
    reply.status(401).send({ success: false, error: "Session expired" });
    return;
  }

  (request as any).userId = userId;
}
