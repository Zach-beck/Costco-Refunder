import type { ParsedReceipt } from "@costco-refunder/shared";
import { autoCropReceipt, preprocessReceiptImage } from "./preprocess.js";
import { performOcr, terminateOcr } from "./ocr.js";
import { parseReceiptLines } from "./receipt-parser.js";

export {
  preprocessReceiptImage,
  autoCropReceipt,
} from "./preprocess.js";
export { performOcr, terminateOcr } from "./ocr.js";
export {
  parseReceiptLines,
  analyzePriceEnding,
  checkItemEligibility,
} from "./receipt-parser.js";
export { parseEmailReceipt } from "./email-parser.js";

/**
 * Full receipt parsing pipeline: preprocess → OCR → parse.
 * This is the main entry point for processing a receipt image.
 */
export async function parseReceiptImage(
  input: Buffer | string
): Promise<ParsedReceipt> {
  // Step 1: Auto-crop to receipt boundaries
  const cropped = await autoCropReceipt(input);

  // Step 2: Preprocess for OCR (grayscale, threshold, normalize)
  const { buffer } = await preprocessReceiptImage(cropped);

  // Step 3: Run OCR
  const ocrResult = await performOcr(buffer);

  // Step 4: Parse OCR output with deterministic regex engine
  const parsed = parseReceiptLines(ocrResult.lines);

  return parsed;
}
