import type { ParsedReceipt, ParsedReceiptItem } from "@costco-refunder/shared";
import type { OcrLine } from "./ocr.js";

// ─── Regex patterns for Costco receipt format ────────────────────────────────

// Item line: "123456  ITEM DESCRIPTION     12.99 A"
const ITEM_LINE_PATTERN =
  /^(\d{5,7})\s+(.+?)\s{2,}(\d{1,4}\.\d{2})\s*([A-Z]?)$/;

// Quantity line (appears before item): "2 @ 5.99"
const QUANTITY_PATTERN = /^(\d+)\s*[@xX]\s*(\d{1,4}\.\d{2})$/;

// Discount/coupon line (negative): "123456  COUPON DESC     -3.00"
const DISCOUNT_PATTERN =
  /^(\d{5,7})\s+(.+?)\s{2,}-?\s*(\d{1,4}\.\d{2})-?\s*$/;

// Subtotal line
const SUBTOTAL_PATTERN = /(?:SUBTOTAL|SUB\s*TOTAL)\s+(\d{1,5}\.\d{2})/i;

// Tax line
const TAX_PATTERN = /(?:TAX)\s+(\d{1,4}\.\d{2})/i;

// Total line
const TOTAL_PATTERN =
  /(?:\*{2,}\s*TOTAL|\bTOTAL\b)\s+(\d{1,5}\.\d{2})/i;

// Warehouse info from header
const WAREHOUSE_PATTERN = /(?:WAREHOUSE|WH)\s*#?\s*(\d{1,4})/i;
const WAREHOUSE_CITY_PATTERN =
  /^([A-Z][A-Za-z\s]+),\s*([A-Z]{2})\s+(\d{5})/;

// Date patterns
const DATE_PATTERN_MDY = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;

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

  let pendingQuantity: { qty: number; unitPrice: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = cleanOcrText(line.text);

    // Try to extract warehouse ID
    if (!warehouseId) {
      const whMatch = text.match(WAREHOUSE_PATTERN);
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

    // Check for item line
    const itemMatch = text.match(ITEM_LINE_PATTERN);
    if (itemMatch) {
      const itemNumber = parseInt(itemMatch[1], 10);
      const description = itemMatch[2].trim();
      const price = parseFloat(itemMatch[3]);
      const taxIndicator = itemMatch[4];

      let quantity = 1;
      let unitPrice = price;
      let totalPrice = price;

      if (pendingQuantity) {
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
        isTaxable: taxIndicator === "A",
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

  const overallConfidence = calculateOverallConfidence(items, subtotal);

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
  subtotal: number | null
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
      0
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

import type { PriceEndingAnalysis } from "@costco-refunder/shared";

export function analyzePriceEnding(price: number): PriceEndingAnalysis {
  const cents = Math.round((price % 1) * 100);
  const ending = (cents / 100).toFixed(2).slice(1); // e.g., ".97"

  if (cents === 97) {
    return {
      type: "clearance",
      ending,
      isEligibleForAdjustment: false,
      note: "Price ending .97 indicates manager's markdown/clearance. Typically not eligible for price adjustment.",
    };
  }

  if (cents === 0 || cents === 88) {
    return {
      type: "manufacturer_special",
      ending,
      isEligibleForAdjustment: true,
      note: "Price ending .00 or .88 indicates a manufacturer special deal. Usually eligible for adjustment.",
    };
  }

  return {
    type: "regular",
    ending,
    isEligibleForAdjustment: true,
    note: "Standard pricing. Eligible for price adjustment within window.",
  };
}

// ─── Eligibility Rules ───────────────────────────────────────────────────────

export interface EligibilityResult {
  isEligible: boolean;
  reason: string;
}

const EXCLUDED_DESCRIPTION_PATTERNS = [
  /\bFUEL\b/i,
  /\bGAS\b/i,
  /\bPHARMACY\b/i,
  /\bRX\b/i,
  /\bSPECIAL\s*ORDER\b/i,
  /\bGIFT\s*CARD\b/i,
  /\bTOBACCO\b/i,
  /\bCIGAR/i,
];

export function checkItemEligibility(
  item: ParsedReceiptItem,
  purchaseDate: string,
  currentDate: string = new Date().toISOString().split("T")[0]
): EligibilityResult {
  // Check price ending
  const priceAnalysis = analyzePriceEnding(item.unitPrice);
  if (!priceAnalysis.isEligibleForAdjustment) {
    return {
      isEligible: false,
      reason: `Clearance item (price ends in ${priceAnalysis.ending}). Not eligible for price adjustment.`,
    };
  }

  // Check excluded categories
  for (const pattern of EXCLUDED_DESCRIPTION_PATTERNS) {
    if (pattern.test(item.description)) {
      return {
        isEligible: false,
        reason: `Item category excluded from price adjustment policy.`,
      };
    }
  }

  // Check time window
  const purchase = new Date(purchaseDate);
  const now = new Date(currentDate);
  const daysDiff = Math.floor(
    (now.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff > 30) {
    return {
      isEligible: false,
      reason: `Outside 30-day adjustment window (${daysDiff} days since purchase).`,
    };
  }

  if (daysDiff < 0) {
    return {
      isEligible: false,
      reason: `Purchase date is in the future.`,
    };
  }

  return {
    isEligible: true,
    reason: `Eligible. ${30 - daysDiff} days remaining in adjustment window.`,
  };
}
