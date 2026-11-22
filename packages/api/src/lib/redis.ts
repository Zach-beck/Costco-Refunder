import "./load-env.js";
import IORedis from "ioredis";
import { MemoryRedis } from "./memory-redis.js";
import { isLocalMode } from "./mode.js";

export const redis = isLocalMode()
  ? new MemoryRedis()
  : new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
