import { getObject } from "./s3.js";
import { persistParsedReceipt } from "./ingest.js";

export async function processReceiptImageJob(
  receiptId: string,
  imageKey: string,
  userId: string
) {
  const { parseReceiptImage } = await import("@receipt-rewind/parser");
  const imageBuffer = await getObject(imageKey);
  const parsed = await parseReceiptImage(imageBuffer);
  return persistParsedReceipt({
    userId,
    parsed,
    imageKey,
    receiptId,
  });
}
