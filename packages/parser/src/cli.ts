import { readFileSync } from "node:fs";
import { formatRefundReport, evaluateRefunds } from "./refund.js";
import { parsePriceCatalogCsv, parsePublicPriceHtml } from "./prices.js";
import { isFuelReceipt } from "./receipt-parser.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const receiptPath = arg("--receipt");
const pricesPath = arg("--prices");
const asOf = arg("--as-of");

if (!receiptPath || !pricesPath) {
  console.error(
    "Usage: yarn refund --receipt <receipt.txt> --prices <prices.csv|page.html> [--as-of YYYY-MM-DD]"
  );
  process.exit(1);
}

const receiptText = readFileSync(receiptPath, "utf8");
const priceText = readFileSync(pricesPath, "utf8");
const prices =
  pricesPath.endsWith(".html") || /<article|<table|<tr/i.test(priceText)
    ? parsePublicPriceHtml(priceText)
    : parsePriceCatalogCsv(priceText);

const evaluation = evaluateRefunds({ receiptText, prices, asOf });
console.log(formatRefundReport(evaluation));

// Fuel receipts are a valid input with nothing to check, not a failed parse.
if (isFuelReceipt(receiptText)) {
  process.exit(0);
}

if (evaluation.receipt.items.length === 0) {
  console.error("No items could be read from this receipt.");
  process.exit(1);
}
