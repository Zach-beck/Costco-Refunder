import "./lib/load-env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { validateEnv } from "./lib/env.js";
import { redis } from "./lib/redis.js";
import { registerShutdown } from "./lib/shutdown.js";
import { registerCsrf } from "./lib/csrf.js";
import { isLocalMode } from "./lib/mode.js";
import { authRoutes } from "./routes/auth.js";
import { receiptRoutes } from "./routes/receipts.js";
import { priceRoutes } from "./routes/prices.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { settingsRoutes } from "./routes/settings.js";

validateEnv();

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
  bodyLimit: 8 * 1024 * 1024,
});

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

await registerCsrf(app);

if (isLocalMode()) {
  app.addContentTypeParser(
    [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/heic",
      "application/octet-stream",
    ],
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    }
  );
}

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/api/auth/login" && request.method === "POST") {
    const key = `login-limit:${request.ip}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 60);
    if (attempts > 5) {
      return reply.status(429).send({
        success: false,
        error: "Too many login attempts. Try again in a minute.",
      });
    }
  }
});

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

await app.register(authRoutes);
await app.register(receiptRoutes);
await app.register(priceRoutes);
await app.register(dashboardRoutes);
await app.register(settingsRoutes);

app.get("/api/health", async () => ({
  status: "ok",
  mode: isLocalMode() ? "local" : "server",
  timestamp: new Date().toISOString(),
}));

const workers: { close: () => Promise<unknown> }[] = [];

if (!isLocalMode()) {
  const [{ receiptWorker }, { priceCheckerWorker }, { notificationWorker }, { priceCheckQueue }] =
    await Promise.all([
      import("./workers/receipt-worker.js"),
      import("./workers/price-checker.js"),
      import("./workers/notification-worker.js"),
      import("./workers/queues.js"),
    ]);
  workers.push(receiptWorker, priceCheckerWorker, notificationWorker);
  await priceCheckQueue.upsertJobScheduler(
    "price-check-scheduler",
    { every: 6 * 60 * 60 * 1000 },
    { name: "scheduled-price-check", data: { type: "scheduled-check" } }
  );
}

registerShutdown(app, workers, redis);

const port = parseInt(process.env.PORT || "3001");
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(
    `API server running on http://${host}:${port} (${isLocalMode() ? "local mode" : "server mode"})`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
