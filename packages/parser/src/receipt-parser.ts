import type { ParsedReceipt, ParsedReceiptItem } from "@receipt-rewind/shared";
import type { OcrLine } from "./ocr.js";

// ─── Regex patterns for Costco receipt format ────────────────────────────────

// Item line: "123456  ITEM DESCRIPTION     12.99 A"
// Also accepts single-spaced lines, 4-digit item numbers, Y/N/B tax flags and
// inline quantities: "7000001 SAMPLE ITEM 2 @ 3.99 = 7.98 Y"
const ITEM_LINE_PATTERN =
  /^(\d{4,7})\s+(.+?)\s+(?:(\d+)\s*@\s*(\d{1,4}\.\d{2})\s*=\s*)?(\d{1,4}\.\d{2})(?:\s+([A-Z]))?$/;

// California redemption value (bottle deposit): "9001 CA REDEMP VAL T EE/7000002 1.20"
const CRV_PATTERN = /^\d{3,7}\s+CA\s+REDEMP\b.*?\/\s*(\d{4,7})\s+(\d{1,4}\.\d{2})$/i;

// Instant savings tied to an item: "900001 /7000003 10.00- (instant savings)"
const LINKED_DISCOUNT_PATTERN =
  /^(\d{4,7})\s*\/\s*(\d{4,7})\s+(\d{1,4}\.\d{2})-(?:\s*\(.*\))?$/;

// Quantity line (appears before item): "2 @ 5.99"
const QUANTITY_PATTERN = /^(\d+)\s*[@xX]\s*(\d{1,4}\.\d{2})$/;

// Discount/coupon line (negative): "123456  COUPON DESC     -3.00"
const DISCOUNT_PATTERN =
  /^(\d{5,7})\s+(.+?)\s{2,}-?\s*(\d{1,4}\.\d{2})-?\s*$/;

// Subtotal line
const SUBTOTAL_PATTERN = /(?:SUBTOTAL|SUB\s*TOTAL)\s+(\d{1,5}\.\d{2})/i;

// Tax line
const TAX_PATTERN = /^TAX\s+(\d{1,4}\.\d{2})/i;

// Total line
const TOTAL_PATTERN =
  /(?:\*{2,}\s*TOTAL|\bTOTAL\b)\s+(\d{1,5}\.\d{2})/i;

// Warehouse info from header
const WAREHOUSE_PATTERN = /(?:WAREHOUSE|WH)\s*#?\s*(\d{1,4})\b/i;
// Store line on member receipts: "SAMPLETOWN #123" or "... | SAMPLETOWN #987, 1 MAIN ST"
const STORE_NUMBER_PATTERN = /\b[A-Z][A-Z .'-]*\s#(\d{1,4})\b/i;
const WAREHOUSE_CITY_PATTERN =
  /^([A-Z][A-Za-z\s]+),\s*([A-Z]{2})\s+(\d{5})/;

// Date patterns
const DATE_PATTERN_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DATE_PATTERN_MDY = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})\b/;

// Member number
const MEMBER_PATTERN = /(?:MEMBER|MBR)\s*#?\s*(\d[\d\s*]{8,})/i;

// ─── Parser ──────────────────────────────────────────────────────────────────

export function parseReceiptLines(lines: OcrLine[]): ParsedReceipt {
  const items: ParsedReceiptItem[] = [];
  let warehouseId: number | null = null;
  let warehouseCity: string | null = null;
  let receiptDate: string | null = null;
  let memberNumber: string | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  let total: number | null = null;

  let depositTotal = 0;
  let pendingQuantity: { qty: number; unitPrice: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = cleanOcrText(line.text);

    // Try to extract warehouse ID
    if (!warehouseId) {
      const whMatch =
        text.match(WAREHOUSE_PATTERN) ?? text.match(STORE_NUMBER_PATTERN);
      if (whMatch) {
        warehouseId = parseInt(whMatch[1], 10);
      }
    }

    // Try to extract warehouse city
    if (!warehouseCity) {
      const cityMatch = text.match(WAREHOUSE_CITY_PATTERN);
      if (cityMatch) {
        warehouseCity = `${cityMatch[1].trim()}, ${cityMatch[2]}`;
      }
    }

    // Try to extract date
    if (!receiptDate) {
      const iso = text.match(DATE_PATTERN_ISO);
      if (iso) receiptDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    if (!receiptDate) {
      const dateMatch = text.match(DATE_PATTERN_MDY);
      if (dateMatch) {
        const month = dateMatch[1].padStart(2, "0");
        const day = dateMatch[2].padStart(2, "0");
        let year = dateMatch[3];
        if (year.length === 2) {
          year = `20${year}`;
        }
        receiptDate = `${year}-${month}-${day}`;
      }
    }

    // Try to extract member number
    if (!memberNumber) {
      const memberMatch = text.match(MEMBER_PATTERN);
      if (memberMatch) {
        memberNumber = memberMatch[1].replace(/\s/g, "");
      }
    }

    // Check for quantity line
    const qtyMatch = text.match(QUANTITY_PATTERN);
    if (qtyMatch) {
      pendingQuantity = {
        qty: parseInt(qtyMatch[1], 10),
        unitPrice: parseFloat(qtyMatch[2]),
      };
      continue;
    }

    // Bottle deposits are not part of the item price; keep them for subtotal checks
    const crvMatch = text.match(CRV_PATTERN);
    if (crvMatch) {
      depositTotal += parseFloat(crvMatch[2]);
      continue;
    }

    // Instant savings that name the item they apply to
    const linked = text.match(LINKED_DISCOUNT_PATTERN);
    if (linked && items.length > 0) {
      const target =
        [...items].reverse().find((it) => it.itemNumber === parseInt(linked[2], 10)) ??
        items[items.length - 1];
      target.totalPrice = Math.round((target.totalPrice - parseFloat(linked[3])) * 100) / 100;
      target.unitPrice = target.totalPrice / target.quantity;
      continue;
    }

    // Check for item line
    const itemMatch = text.match(ITEM_LINE_PATTERN);
    if (itemMatch) {
      const itemNumber = parseInt(itemMatch[1], 10);
      const description = itemMatch[2].trim();
      const price = parseFloat(itemMatch[5]);
      const taxIndicator = itemMatch[6] ?? "";

      let quantity = 1;
      let unitPrice = price;
      let totalPrice = price;

      if (itemMatch[3]) {
        quantity = parseInt(itemMatch[3], 10);
        unitPrice = parseFloat(itemMatch[4]);
        pendingQuantity = null;
      } else if (pendingQuantity) {
        quantity = pendingQuantity.qty;
        unitPrice = pendingQuantity.unitPrice;
        totalPrice = price;
        pendingQuantity = null;
      }

      items.push({
        itemNumber,
        description,
        quantity,
        unitPrice,
        totalPrice,
        shelfPrice: unitPrice,
        isTaxable: taxIndicator !== "" && taxIndicator !== "N",
        confidence: line.confidence,
      });
      continue;
    }

    // Check for discount line (associate with previous item)
    const discountMatch = text.match(DISCOUNT_PATTERN);
    if (discountMatch && items.length > 0) {
      const discountAmount = parseFloat(discountMatch[3]);
      const lastItem = items[items.length - 1];
      lastItem.totalPrice -= discountAmount;
      lastItem.unitPrice = lastItem.totalPrice / lastItem.quantity;
      continue;
    }

    // Check for subtotal
    const subtotalMatch = text.match(SUBTOTAL_PATTERN);
    if (subtotalMatch) {
      subtotal = parseFloat(subtotalMatch[1]);
    }

    // Check for tax
    const taxMatch = text.match(TAX_PATTERN);
    if (taxMatch) {
      tax = parseFloat(taxMatch[1]);
    }

    // Check for total
    const totalMatch = text.match(TOTAL_PATTERN);
    if (totalMatch) {
      total = parseFloat(totalMatch[1]);
    }

    // Reset pending quantity if we hit a non-quantity, non-item line
    pendingQuantity = null;
  }

  const overallConfidence = calculateOverallConfidence(items, subtotal, depositTotal);

  return {
    warehouseId,
    warehouseCity,
    receiptDate,
    memberNumber,
    items,
    subtotal,
    tax,
    total,
    overallConfidence,
    rawText: lines.map((l) => l.text).join("\n"),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanOcrText(text: string): string {
  return text
    .replace(/[|]/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

function calculateOverallConfidence(
  items: ParsedReceiptItem[],
  subtotal: number | null,
  depositTotal = 0
): number {
  if (items.length === 0) return 0;

  // Average item confidence
  const avgItemConfidence =
    items.reduce((sum, item) => sum + item.confidence, 0) / items.length;

  // Subtotal validation bonus
  let subtotalBonus = 0;
  if (subtotal !== null) {
    const calculatedSubtotal = items.reduce(
      (sum, item) => sum + item.totalPrice,
      depositTotal
    );
    const diff = Math.abs(calculatedSubtotal - subtotal);
    if (diff < 0.02) {
      subtotalBonus = 0.1; // perfect match
    } else if (diff < 1.0) {
      subtotalBonus = 0.05; // close enough (likely one item misread)
    } else {
      subtotalBonus = -0.1; // significant mismatch, reduce confidence
    }
  }

  return Math.min(1, Math.max(0, avgItemConfidence + subtotalBonus));
}

// ─── Price Ending Analysis ───────────────────────────────────────────────────
//
// Costco does not publish what price endings mean. Shoppers often read .97 as
// a clearance markdown, and reports about .00 and .88 conflict. These are
// unofficial hints only. They never remove a line from the check.

import type { PriceEndingAnalysis } from "@receipt-rewind/shared";
import { ADJUSTMENT_WINDOW_DAYS } from "@receipt-rewind/shared/types";

export function analyzePriceEnding(price: number): PriceEndingAnalysis {
  const cents = Math.round((price % 1) * 100);
  const ending = (cents / 100).toFixed(2).slice(1); // e.g., ".97"

  if (cents === 97) {
    return {
      type: "clearance",
      ending,
      isEligibleForAdjustment: true,
      note: "Unofficial hint: price ends in .97, which shoppers often read as clearance. Costco doesn't publish what endings mean and may decline clearance items. Ask.",
    };
  }

  return {
    type: "regular",
    ending,
    isEligibleForAdjustment: true,
    note: "No price-ending hint.",
  };
}

// ─── Eligibility Rules ───────────────────────────────────────────────────────

export interface EligibilityResult {
  isEligible: boolean;
  reason: string;
  /** Unofficial hints to show next to the line. They never change eligibility. */
  hints: string[];
}

// Documented on Costco's US "Price Match" page: precious metals are not eligible.
const HARD_EXCLUSIONS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(GOLD|SILVER|PLATINUM)\b.*\b(BAR|COIN|ROUND)S?\b|\bBULLION\b/i,
    reason: "Costco's price match page says precious metals are not eligible.",
  },
];

// Not on Costco's price match page. Shopper reports only, so the line stays in
// the check and gets a hint instead of being dropped.
const SOFT_EXCLUSIONS: { pattern: RegExp; hint: string }[] = [
  { pattern: /\bFUEL\b|\bGAS\b|\bGASOLINE\b/i, hint: "Unofficial: fuel is likely not adjustable. Ask." },
  { pattern: /\bPHARMACY\b|\bRX\b/i, hint: "Unofficial: pharmacy items are likely not adjustable. Ask." },
  { pattern: /\bTOBACCO\b|\bCIGAR/i, hint: "Unofficial: tobacco is likely not adjustable. Ask." },
  { pattern: /\bGIFT\s*CARD\b/i, hint: "Unofficial: gift cards are likely not adjustable. Ask." },
  {
    pattern: /\bSPECIAL\s*ORDER\b/i,
    hint: "Special Order Kiosk and installed products follow separate Costco rules. Check with the dealer.",
  },
];

export function checkItemEligibility(
  item: ParsedReceiptItem,
  purchaseDate: string,
  currentDate: string = new Date().toISOString().split("T")[0]
): EligibilityResult {
  const hints: string[] = [];

  // Price-ending hint runs on the shelf price, before any instant savings.
  const priceAnalysis = analyzePriceEnding(item.shelfPrice ?? item.unitPrice);
  if (priceAnalysis.type === "clearance") {
    hints.push(priceAnalysis.note);
  }

  for (const rule of HARD_EXCLUSIONS) {
    if (rule.pattern.test(item.description)) {
      return { isEligible: false, reason: rule.reason, hints };
    }
  }

  for (const rule of SOFT_EXCLUSIONS) {
    if (rule.pattern.test(item.description)) {
      hints.push(rule.hint);
    }
  }

  const purchase = new Date(purchaseDate);
  const now = new Date(currentDate);
  const daysDiff = Math.floor(
    (now.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff > ADJUSTMENT_WINDOW_DAYS) {
    return {
      isEligible: false,
      reason: `Outside the ${ADJUSTMENT_WINDOW_DAYS}-day window (${daysDiff} days since purchase).`,
      hints,
    };
  }

  if (daysDiff < 0) {
    return { isEligible: false, reason: "Purchase date is in the future.", hints };
  }

  return {
    isEligible: true,
    reason: `Inside the window. ${ADJUSTMENT_WINDOW_DAYS - daysDiff} days left.`,
    hints,
  };
}

// ─── Receipt kind ────────────────────────────────────────────────────────────

/** True for a Costco gas station receipt. Fuel is not checked for price drops. */
export function isFuelReceipt(text: string): boolean {
  return (
    /Gas\s+Station\s+Receipt/i.test(text) ||
    (/\bGallons\b/i.test(text) && /\/\s*gal\b/i.test(text))
  );
}
