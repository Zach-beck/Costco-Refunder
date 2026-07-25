import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE = "csrf-token";
const TOKEN_LENGTH = 32;

function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

export async function csrfPlugin(app: FastifyInstance) {
  // Issue a CSRF token cookie on every response if not already set
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const existing = request.cookies[CSRF_COOKIE];
    if (!existing) {
      const token = generateToken();
      reply.setCookie(CSRF_COOKIE, token, {
        httpOnly: false, // JS needs to read this
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
  });

  // Validate CSRF token on state-changing requests
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return;

    // Skip CSRF for health checks and auth routes (login/signup need to work without prior cookie)
    const url = request.url;
    if (url === "/api/health") return;
    if (url === "/api/auth/signup" || url === "/api/auth/login") return;

    const cookieToken = request.cookies[CSRF_COOKIE];
    const headerToken = request.headers[CSRF_HEADER] as string | undefined;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      reply.status(403).send({ success: false, error: "Invalid CSRF token" });
    }
  });
}
