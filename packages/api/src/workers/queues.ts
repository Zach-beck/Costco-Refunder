import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

export const receiptQueue = new Queue("receipt-processing", {
  connection: redis,
});

export const priceCheckQueue = new Queue("price-checking", {
  connection: redis,
});

export const notificationQueue = new Queue("notifications", {
  connection: redis,
});
