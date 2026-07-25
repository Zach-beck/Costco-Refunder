import type { FastifyInstance } from "fastify";
import type { Worker } from "bullmq";
import type IORedis from "ioredis";

let registered = false;

export function registerShutdown(
  app: FastifyInstance,
  workers: Worker[],
  redis: IORedis
): void {
  if (registered) return;
  registered = true;

  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);

    // Stop accepting new requests
    await app.close();

    // Close workers (waits for in-flight jobs)
    await Promise.all(
      workers.map(async (w) => {
        try {
          await w.close();
        } catch {}
      })
    );

    // Close Redis
    try {
      await redis.quit();
    } catch {}

    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
