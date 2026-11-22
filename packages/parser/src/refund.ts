import type { ParsedReceipt, ParsedReceiptItem } from "@costco-refunder/shared";
import { ADJUSTMENT_WINDOW_DAYS } from "@costco-refunder/shared/types";
import { addDaysIso, daysBetweenIso } from "./dates.js";
import { parseEmailReceipt } from "./email-parser.js";
import type { CatalogPrice } from "./prices.js";
import type { OcrLine } from "./ocr.js";
import { checkItemEligibility, parseReceiptLines } from "./receipt-parser.js";

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
  purchaseDate: string | null;
  deadline: string | null;
  daysRemaining: number;
  warehouseId: number | null;
}

export interface RefundEvaluation {
  receipt: ParsedReceipt;
  asOf: string;
  results: RefundLine[];
  totalRefund: number;
}

export function parseReceiptText(text: string): ParsedReceipt {
  if (/<[a-z!]/i.test(text)) {
    return parseEmailReceipt(text);
  }
  const lines: OcrLine[] = text.split(/\r?\n/).map((line) => ({
    text: line,
    confidence: 1,
    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
  }));
  return parseReceiptLines(lines);
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
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const purchaseDate = receipt.receiptDate;
  const warehouseId = receipt.warehouseId;

  const results = receipt.items.map((item) =>
    evaluateLine(item, purchaseDate, warehouseId, input.prices, asOf)
  );

  const totalRefund = roundMoney(
    results.reduce((sum, line) => sum + (line.eligible ? line.totalSavings : 0), 0)
  );

  return { receipt, asOf, results, totalRefund };
}

export function formatRefundReport(evaluation: RefundEvaluation): string {
  const { receipt, asOf, results, totalRefund } = evaluation;
  const lines: string[] = [];
  lines.push("Costco Refunder");
  lines.push(`Receipt date: ${receipt.receiptDate ?? "unknown"}`);
  lines.push(`Warehouse: ${receipt.warehouseId ?? "unknown"}`);
  lines.push(`Compared as of: ${asOf}`);
  lines.push(`Items parsed: ${receipt.items.length}`);
  lines.push("");

  const claimable = results.filter((line) => line.eligible && line.totalSavings > 0);
  if (claimable.length === 0) {
    lines.push("No claimable price adjustment in this comparison.");
  } else {
    lines.push(`Claimable refund: $${totalRefund.toFixed(2)}`);
    lines.push("");
    for (const line of claimable) {
      lines.push(`${line.description} (#${line.itemNumber})`);
      lines.push(
        `  Paid $${line.purchasePrice.toFixed(2)}, current $${line.currentPrice?.toFixed(2)}, qty ${line.quantity}`
      );
      lines.push(
        `  Refund $${line.totalSavings.toFixed(2)}. ${line.daysRemaining} days left (until ${line.deadline}).`
      );
      lines.push(
        "  Ask at the membership counter, or call 1-800-774-2678. Bring your membership card. This app does not contact Costco for you."
      );
      lines.push("");
    }
  }

  const rest = results.filter((line) => !(line.eligible && line.totalSavings > 0));
  if (rest.length > 0) {
    lines.push("Not claimed:");
    for (const line of rest) {
      const why = line.eligible ? "No lower price in the supplied catalog." : line.reason;
      lines.push(`  ${line.description} (#${line.itemNumber}): ${why}`);
    }
  }

  return lines.join("\n");
}

function evaluateLine(
  item: ParsedReceiptItem,
  purchaseDate: string | null,
  warehouseId: number | null,
  prices: CatalogPrice[],
  asOf: string
): RefundLine {
  const deadline = purchaseDate
    ? addDaysIso(purchaseDate, ADJUSTMENT_WINDOW_DAYS)
    : null;
  const daysRemaining =
    purchaseDate == null
      ? 0
      : Math.max(0, ADJUSTMENT_WINDOW_DAYS - daysBetweenIso(purchaseDate, asOf));

  if (!purchaseDate) {
    return emptyLine(item, warehouseId, null, deadline, daysRemaining, false, "Receipt date is missing.");
  }

  const eligibility = checkItemEligibility(item, purchaseDate, asOf);
  const currentPrice = lowestMatchingPrice(item.itemNumber, warehouseId, purchaseDate, asOf, prices);

  if (!eligibility.isEligible) {
    return emptyLine(
      item,
      warehouseId,
      currentPrice,
      deadline,
      daysRemaining,
      false,
      eligibility.reason
    );
  }

  if (currentPrice == null) {
    return emptyLine(
      item,
      warehouseId,
      null,
      deadline,
      daysRemaining,
      true,
      "No current price in the supplied catalog."
    );
  }

  const unitSavings = roundMoney(item.unitPrice - currentPrice);
  if (unitSavings <= 0) {
    return emptyLine(
      item,
      warehouseId,
      currentPrice,
      deadline,
      daysRemaining,
      true,
      "No lower price in the supplied catalog."
    );
  }

  return {
    itemNumber: item.itemNumber,
    description: item.description,
    quantity: item.quantity,
    purchasePrice: item.unitPrice,
    currentPrice,
    unitSavings,
    totalSavings: roundMoney(unitSavings * item.quantity),
    eligible: true,
    reason: eligibility.reason,
    purchaseDate,
    deadline,
    daysRemaining,
    warehouseId,
  };
}

function emptyLine(
  item: ParsedReceiptItem,
  warehouseId: number | null,
  currentPrice: number | null,
  deadline: string | null,
  daysRemaining: number,
  eligible: boolean,
  reason: string
): RefundLine {
  return {
    itemNumber: item.itemNumber,
    description: item.description,
    quantity: item.quantity,
    purchasePrice: item.unitPrice,
    currentPrice,
    unitSavings: 0,
    totalSavings: 0,
    eligible,
    reason,
    purchaseDate: null,
    deadline,
    daysRemaining,
    warehouseId,
  };
}

function lowestMatchingPrice(
  itemNumber: number,
  warehouseId: number | null,
  purchaseDate: string,
  asOf: string,
  prices: CatalogPrice[]
): number | null {
  const matches = prices.filter((price) => {
    if (price.itemNumber !== itemNumber) return false;
    if (
      warehouseId != null &&
      price.warehouseId != null &&
      price.warehouseId !== warehouseId
    ) {
      return false;
    }
    if (price.observedDate && price.observedDate < purchaseDate) return false;
    if (price.observedDate && price.observedDate > asOf) return false;
    return true;
  });
  if (matches.length === 0) return null;
  return Math.min(...matches.map((price) => price.price));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
