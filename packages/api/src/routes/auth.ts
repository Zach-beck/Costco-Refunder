import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { users, SignupSchema, LoginSchema } from "@costco-refunder/shared";
import { db } from "../lib/db.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  requireAuth,
} from "../lib/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/signup", async (request, reply) => {
    const parsed = SignupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: parsed.error.issues[0].message });
    }

    const { email, password, costcoMemberId, homeWarehouseId } = parsed.data;

    // Check if user already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return reply
        .status(409)
        .send({ success: false, error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        costcoMemberId,
        homeWarehouseId,
      })
      .returning({ id: users.id });

    const sessionId = await createSession(user.id);

    reply
      .setCookie("session", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      })
      .status(201)
      .send({ success: true, data: { userId: user.id } });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Invalid input" });
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply
        .status(401)
        .send({ success: false, error: "Invalid credentials" });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return reply
        .status(401)
        .send({ success: false, error: "Invalid credentials" });
    }

    const sessionId = await createSession(user.id);

    reply
      .setCookie("session", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      })
      .send({ success: true, data: { userId: user.id } });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies?.session;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    reply
      .clearCookie("session", { path: "/" })
      .send({ success: true });
  });

  app.get("/api/auth/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = (request as any).userId;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        costcoMemberId: users.costcoMemberId,
        homeWarehouseId: users.homeWarehouseId,
        notificationPrefs: users.notificationPrefs,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ success: false, error: "User not found" });
    }

    reply.send({ success: true, data: user });
  });
}
