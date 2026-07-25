import type { ParsedReceipt, ParsedReceiptItem } from "@costco-refunder/shared";

/**
 * Parse a Costco digital receipt email body (plain text or HTML).
 * Digital receipts have perfect structure — no OCR confidence issues.
 */
export function parseEmailReceipt(emailBody: string): ParsedReceipt {
  const isHtml = emailBody.includes("<html") || emailBody.includes("<table");
  const text = isHtml ? stripHtml(emailBody) : emailBody;

  const items: ParsedReceiptItem[] = [];
  let warehouseId: number | null = null;
  let receiptDate: string | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  let total: number | null = null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Costco digital receipt patterns
  const ITEM_PATTERN = /^(\d{5,7})\s+(.+?)\s+\$?([\d,]+\.\d{2})$/;
  const QTY_PATTERN = /^(\d+)\s*[@xX]\s*\$?([\d,]+\.\d{2})$/;
  const DATE_PATTERN = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  const WAREHOUSE_PATTERN = /(?:warehouse|location)\s*#?\s*(\d{1,4})/i;
  const SUBTOTAL_PATTERN = /subtotal\s*\$?([\d,]+\.\d{2})/i;
  const TAX_PATTERN = /tax\s*\$?([\d,]+\.\d{2})/i;
  const TOTAL_PATTERN = /total\s*\$?([\d,]+\.\d{2})/i;

  let pendingQty: { qty: number; unitPrice: number } | null = null;

  for (const line of lines) {
    // Warehouse
    if (!warehouseId) {
      const whMatch = line.match(WAREHOUSE_PATTERN);
      if (whMatch) warehouseId = parseInt(whMatch[1]);
    }

    // Date
    if (!receiptDate) {
      const dateMatch = line.match(DATE_PATTERN);
      if (dateMatch) {
        const m = dateMatch[1].padStart(2, "0");
        const d = dateMatch[2].padStart(2, "0");
        let y = dateMatch[3];
        if (y.length === 2) y = `20${y}`;
        receiptDate = `${y}-${m}-${d}`;
      }
    }

    // Quantity
    const qtyMatch = line.match(QTY_PATTERN);
    if (qtyMatch) {
      pendingQty = {
        qty: parseInt(qtyMatch[1]),
        unitPrice: parseFloat(qtyMatch[2].replace(",", "")),
      };
      continue;
    }

    // Item
    const itemMatch = line.match(ITEM_PATTERN);
    if (itemMatch) {
      const itemNumber = parseInt(itemMatch[1]);
      const description = itemMatch[2].trim();
      const price = parseFloat(itemMatch[3].replace(",", ""));

      let quantity = 1;
      let unitPrice = price;
      let totalPrice = price;

      if (pendingQty) {
        quantity = pendingQty.qty;
        unitPrice = pendingQty.unitPrice;
        totalPrice = price;
        pendingQty = null;
      }

      items.push({
        itemNumber,
        description,
        quantity,
        unitPrice,
        totalPrice,
        isTaxable: false, // Email receipts don't always show tax indicators
        confidence: 1.0, // Perfect confidence — no OCR
      });
      continue;
    }

    // Subtotal
    const subMatch = line.match(SUBTOTAL_PATTERN);
    if (subMatch) subtotal = parseFloat(subMatch[1].replace(",", ""));

    // Tax
    const taxMatch = line.match(TAX_PATTERN);
    if (taxMatch) tax = parseFloat(taxMatch[1].replace(",", ""));

    // Total
    const totalMatch = line.match(TOTAL_PATTERN);
    if (totalMatch) total = parseFloat(totalMatch[1].replace(",", ""));

    pendingQty = null;
  }

  return {
    warehouseId,
    warehouseCity: null,
    receiptDate,
    memberNumber: null,
    items,
    subtotal,
    tax,
    total,
    overallConfidence: 1.0, // Digital receipts are perfectly accurate
    rawText: text,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, "")
    .replace(/\t+/g, "  ");
}
