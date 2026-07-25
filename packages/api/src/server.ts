import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { validateEnv } from "./lib/env.js";
import { redis } from "./lib/redis.js";
import { registerShutdown } from "./lib/shutdown.js";
import { csrfPlugin } from "./lib/csrf.js";
import { authRoutes } from "./routes/auth.js";
import { receiptRoutes } from "./routes/receipts.js";
import { priceRoutes } from "./routes/prices.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { settingsRoutes } from "./routes/settings.js";
import { priceCheckQueue } from "./workers/queues.js";

// Validate environment before anything else
validateEnv();

// Import workers to start them
import { receiptWorker } from "./workers/receipt-worker.js";
import { priceCheckerWorker } from "./workers/price-checker.js";
import { notificationWorker } from "./workers/notification-worker.js";

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

// Plugins
await app.register(cors, {
  origin: process.env.WEB_URL || "http://localhost:5173",
  credentials: true,
});

await app.register(cookie, {
  secret: process.env.SESSION_SECRET || "dev-secret-change-me",
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// CSRF protection for state-changing requests
await app.register(csrfPlugin);

// Stricter rate limit on auth endpoints (5 attempts per minute)
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/api/auth/login" && request.method === "POST") {
    const key = `login-limit:${request.ip}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 60);
    if (attempts > 5) {
      reply.status(429).send({
        success: false,
        error: "Too many login attempts. Try again in a minute.",
      });
    }
  }
});

// Global error handler
app.setErrorHandler((error: any, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) {
    app.log.error(error);
  }
  reply.status(statusCode).send({
    success: false,
    error: statusCode >= 500 ? "Internal server error" : error.message,
  });
});

// Routes
await app.register(authRoutes);
await app.register(receiptRoutes);
await app.register(priceRoutes);
await app.register(dashboardRoutes);
await app.register(settingsRoutes);

// Health check
app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// Schedule recurring price checks (every 6 hours)
async function schedulePriceChecks() {
  await priceCheckQueue.upsertJobScheduler(
    "price-check-scheduler",
    { every: 6 * 60 * 60 * 1000 },
    { name: "scheduled-price-check", data: { type: "scheduled-check" } }
  );
}

// Graceful shutdown
registerShutdown(
  app,
  [receiptWorker, priceCheckerWorker, notificationWorker],
  redis
);

// Start server
const port = parseInt(process.env.PORT || "3001");
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  await schedulePriceChecks();
  console.log(`API server running on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
