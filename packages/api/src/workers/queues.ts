import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

const connection = redis as never;

export const receiptQueue = new Queue("receipt-processing", { connection });
export const priceCheckQueue = new Queue("price-checking", { connection });
export const notificationQueue = new Queue("notifications", { connection });
