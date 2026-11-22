import type { ParsedReceipt, ParsedReceiptItem, PurchaseChannel } from "@receipt-rewind/shared";
import { ADJUSTMENT_WINDOW_DAYS, POLICY_SOURCE } from "@receipt-rewind/shared/types";
import { addDaysIso, daysBetweenIso } from "./dates.js";
import { parseEmailReceipt } from "./email-parser.js";
import type { CatalogPrice } from "./prices.js";
import type { OcrLine } from "./ocr.js";
import { checkItemEligibility, isFuelReceipt, parseReceiptLines } from "./receipt-parser.js";

export const PRODUCT_NAME = "Receipt Rewind";

export interface RefundLine {
  itemNumber: number;
  description: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number | null;
  unitSavings: number;
  totalSavings: number;
  eligible: boolean;
  reason: string;
  /** Unofficial hints (price endings, likely-excluded categories). */
  hints: string[];
  /** Lower prices that were found but don't count, and why. */
  ignoredPrices: string[];
  purchaseDate: string | null;
  deadline: string | null;
  daysRemaining: number;
  warehouseId: number | null;
}

export interface RefundEvaluation {
  receipt: ParsedReceipt;
  channel: PurchaseChannel;
  isFuel: boolean;
  asOf: string;
  results: RefundLine[];
  totalRefund: number;
  /** Part of totalRefund on lines that carry an unofficial caveat. */
  caveatTotal: number;
}

export function detectChannel(text: string): PurchaseChannel {
  return /costco\.com\s+order|order\s*(?:number|#)|online\s+order/i.test(text)
    ? "online"
    : "warehouse";
}

export function parseReceiptText(text: string): ParsedReceipt {
  const channel = detectChannel(text);
  if (/<[a-z!]/i.test(text)) {
    return { ...parseEmailReceipt(text), channel };
  }
  const lines: OcrLine[] = text.split(/\r?\n/).map((line) => ({
    text: line,
    confidence: 1,
    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
  }));
  return { ...parseReceiptLines(lines), channel };
}

export function evaluateRefunds(input: {
  receiptText: string;
  prices: CatalogPrice[];
  asOf?: string;
  warehouseId?: number | null;
}): RefundEvaluation {
  const receipt = parseReceiptText(input.receiptText);
  if (input.warehouseId) {
    receipt.warehouseId = input.warehouseId;
  }
  const channel = receipt.channel ?? "warehouse";
  const isFuel = isFuelReceipt(input.receiptText);
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const purchaseDate = receipt.receiptDate;
  const warehouseId = receipt.warehouseId;

  const results = isFuel
    ? []
    : receipt.items.map((item) =>
        evaluateLine(item, purchaseDate, warehouseId, channel, input.prices, asOf)
      );

  const totalRefund = roundMoney(
    results.reduce((sum, line) => sum + (line.eligible ? line.totalSavings : 0), 0)
  );

  const caveatTotal = roundMoney(
    results.reduce(
      (sum, line) => sum + (line.eligible && line.hints.length > 0 ? line.totalSavings : 0),
      0
    )
  );

  return { receipt, channel, isFuel, asOf, results, totalRefund, caveatTotal };
}

export function claimInstructions(channel: PurchaseChannel, warehouseId: number | null): string {
  if (channel === "online") {
    return "Use the Request a Price Match form on Costco's \"Price Match - Costco.com Orders\" help page. Costco decides. This app doesn't contact Costco.";
  }
  const where = warehouseId ? `warehouse #${warehouseId}` : "the warehouse";
  return `Ask at the Returns counter at ${where}, where you bought it. Bring your membership card. Costco decides. This app doesn't contact Costco.`;
}

export function formatRefundReport(evaluation: RefundEvaluation): string {
  const { receipt, channel, isFuel, asOf, results, totalRefund, caveatTotal } = evaluation;
  const lines: string[] = [];
  lines.push(PRODUCT_NAME);
  lines.push(`Receipt date: ${receipt.receiptDate ?? "unknown"}`);
  lines.push(`Warehouse: ${receipt.warehouseId ?? "unknown"}`);
  lines.push(`Channel: ${channel}`);
  lines.push(`Compared as of: ${asOf}`);

  if (isFuel) {
    lines.push("");
    lines.push("Fuel receipt: skipped. Gas prices change daily and aren't checked for price matches.");
    return lines.join("\n");
  }

  lines.push(`Items parsed: ${receipt.items.length}`);
  lines.push("");

  const claimable = results.filter((line) => line.eligible && line.totalSavings > 0);
  if (claimable.length === 0) {
    lines.push("No price match found in this comparison.");
  } else {
    lines.push(`Possible price match: $${totalRefund.toFixed(2)}. Costco decides every claim.`);
    if (caveatTotal > 0) {
      lines.push(`$${caveatTotal.toFixed(2)} of that has an unofficial caveat. See the notes.`);
    }
    lines.push("");
    for (const line of claimable) {
      lines.push(`${line.description} (#${line.itemNumber})`);
      lines.push(
        `  Paid $${line.purchasePrice.toFixed(2)}, current $${line.currentPrice?.toFixed(2)}, qty ${line.quantity}`
      );
      lines.push(
        `  Difference $${line.totalSavings.toFixed(2)}. ${line.daysRemaining} days left (until ${line.deadline}).`
      );
      for (const hint of line.hints) lines.push(`  Note: ${hint}`);
      lines.push(`  ${claimInstructions(channel, line.warehouseId)}`);
      lines.push("");
    }
  }

  const rest = results.filter((line) => !(line.eligible && line.totalSavings > 0));
  if (rest.length > 0) {
    lines.push("Not claimed:");
    for (const line of rest) {
      lines.push(`  ${line.description} (#${line.itemNumber}): ${line.reason}`);
      for (const hint of line.hints) lines.push(`    Note: ${hint}`);
    }
  }

  const ignored = results.filter((line) => line.ignoredPrices.length > 0);
  if (ignored.length > 0) {
    lines.push("");
    lines.push("Lower prices that don't count:");
    for (const line of ignored) {
      for (const why of line.ignoredPrices) {
        lines.push(`  ${line.description} (#${line.itemNumber}): ${why}`);
      }
    }
  }

  lines.push("");
  lines.push(
    `Policy: ${POLICY_SOURCE.page}, version ${POLICY_SOURCE.version} (published ${POLICY_SOURCE.published}, last checked ${POLICY_SOURCE.lastChecked}). The ${ADJUSTMENT_WINDOW_DAYS}-day warehouse window is an assumption.`
  );

  return lines.join("\n");
}

function evaluateLine(
  item: ParsedReceiptItem,
  purchaseDate: string | null,
  warehouseId: number | null,
  channel: PurchaseChannel,
  prices: CatalogPrice[],
  asOf: string
): RefundLine {
  const base = {
    itemNumber: item.itemNumber,
    description: item.description,
    quantity: item.quantity,
    purchasePrice: item.unitPrice,
    warehouseId,
  };

  if (!purchaseDate) {
    return {
      ...base,
      currentPrice: null,
      unitSavings: 0,
      totalSavings: 0,
      eligible: false,
      reason: "Receipt date is missing.",
      hints: [],
      ignoredPrices: [],
      purchaseDate: null,
      deadline: null,
      daysRemaining: 0,
    };
  }

  const windowEnd = addDaysIso(purchaseDate, ADJUSTMENT_WINDOW_DAYS);
  const eligibility = checkItemEligibility(item, purchaseDate, asOf);
  const { match, ignored } = findMatchingPrice(item, warehouseId, channel, purchaseDate, asOf, prices);

  const deadline =
    match?.promoEnd && match.promoEnd < windowEnd ? match.promoEnd : windowEnd;
  const daysRemaining = Math.max(0, daysBetweenIso(asOf, deadline));

  const line: RefundLine = {
    ...base,
    currentPrice: match?.price ?? null,
    unitSavings: 0,
    totalSavings: 0,
    eligible: eligibility.isEligible,
    reason: eligibility.reason,
    hints: eligibility.hints,
    ignoredPrices: ignored,
    purchaseDate,
    deadline,
    daysRemaining,
  };

  if (!eligibility.isEligible) return line;

  if (!match) {
    line.reason = "No lower price that counts in the supplied prices.";
    return line;
  }

  if (match.promoEnd && match.promoEnd < asOf) {
    line.eligible = false;
    line.reason = `The promotion ended on ${match.promoEnd}.`;
    return line;
  }

  const unitSavings = roundMoney(item.unitPrice - match.price);
  if (unitSavings <= 0) {
    line.reason = "No lower price that counts in the supplied prices.";
    return line;
  }

  const countedQty =
    match.promoLimit != null ? Math.min(item.quantity, match.promoLimit) : item.quantity;
  line.unitSavings = unitSavings;
  line.totalSavings = roundMoney(unitSavings * countedQty);
  if (countedQty < item.quantity) {
    line.hints = [...line.hints, `Promo limit is ${match.promoLimit}, so only ${countedQty} counted.`];
  }
  return line;
}

/**
 * The lowest price that can fairly be compared with this receipt line, plus
 * plain reasons for lower prices that were skipped.
 *
 * Rules:
 * - same item number, seen on or after the purchase date and on or before "as of"
 * - same channel: online prices never match warehouse receipts, and the reverse
 * - warehouse receipts need a warehouse number, and the price must be from that
 *   same warehouse. A blank warehouse on a price never matches.
 * - per-pound prices can't be compared with a receipt total
 */
function findMatchingPrice(
  item: ParsedReceiptItem,
  warehouseId: number | null,
  channel: PurchaseChannel,
  purchaseDate: string,
  asOf: string,
  prices: CatalogPrice[]
): { match: CatalogPrice | null; ignored: string[] } {
  const ignored: string[] = [];
  let match: CatalogPrice | null = null;

  for (const price of prices) {
    if (price.itemNumber !== item.itemNumber) continue;
    if (price.observedDate && price.observedDate < purchaseDate) continue;
    if (price.observedDate && price.observedDate > asOf) continue;

    const lower = price.price < item.unitPrice;
    const skip = (why: string) => {
      if (lower) ignored.push(`$${price.price.toFixed(2)} ${why}`);
    };

    if (price.channel !== channel) {
      skip(
        price.channel === "online"
          ? "is an online price. Costco doesn't match online prices against warehouse purchases."
          : "is a warehouse price. Costco doesn't match warehouse prices for Costco.com orders."
      );
      continue;
    }
    if (price.unit === "lb") {
      skip("is a per-pound price. The receipt shows only the total, so it can't be compared.");
      continue;
    }
    if (channel === "warehouse") {
      if (warehouseId == null) {
        skip("can't be checked: the receipt has no warehouse number.");
        continue;
      }
      if (price.warehouseId == null) {
        skip("has no warehouse number, so it isn't counted.");
        continue;
      }
      if (price.warehouseId !== warehouseId) {
        skip(`is from warehouse #${price.warehouseId}, not #${warehouseId} where you bought it.`);
        continue;
      }
    }

    if (!match || price.price < match.price) match = price;
  }

  return { match, ignored };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
