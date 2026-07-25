import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth.js";
import { receiptRoutes } from "./routes/receipts.js";
import { priceRoutes } from "./routes/prices.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { priceCheckQueue } from "./workers/queues.js";

// Import workers to start them
import "./workers/receipt-worker.js";
import "./workers/price-checker.js";
import "./workers/notification-worker.js";

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
