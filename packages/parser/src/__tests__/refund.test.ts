import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEmailReceipt } from "../email-parser.js";
import { parsePriceCatalogCsv, parsePublicPriceHtml } from "../prices.js";
import { redactReceiptText } from "../redact.js";
import {
  claimInstructions,
  detectChannel,
  evaluateRefunds,
  formatRefundReport,
} from "../refund.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures");

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

describe("price catalogs", () => {
  it("parses the CSV fixture and ignores a different warehouse later", () => {
    const prices = parsePriceCatalogCsv(fixture("public-prices.csv"));
    const olive = prices.filter((price) => price.itemNumber === 1111111);
    expect(olive).toHaveLength(2);
    expect(olive[0]).toMatchObject({
      price: 11.49,
      warehouseId: 116,
      observedDate: "2026-11-10",
    });
  });

  it("parses a saved public price page", () => {
    const prices = parsePublicPriceHtml(fixture("public-price-page.html"));
    expect(prices.map((price) => price.itemNumber).sort()).toEqual([
      1111111, 2222222, 6666666,
    ]);
    expect(prices.find((price) => price.itemNumber === 6666666)?.price).toBe(15.49);
  });
});

describe("evaluateRefunds", () => {
  const prices = parsePriceCatalogCsv(fixture("public-prices.csv"));

  it("computes possible price matches from the sample receipt", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices,
      asOf: "2026-11-15",
    });

    expect(evaluation.receipt.warehouseId).toBe(116);
    expect(evaluation.receipt.receiptDate).toBe("2026-11-01");
    expect(evaluation.receipt.items).toHaveLength(6);
    expect(evaluation.channel).toBe("warehouse");
    // Olive oil 3.50 + paper towels 3.50, plus two lines with unofficial caveats:
    // vitamins (.97 ending) 5.00 and fuel 0.40.
    expect(evaluation.totalRefund).toBe(12.4);
    expect(evaluation.caveatTotal).toBe(5.4);

    const olive = evaluation.results.find((line) => line.itemNumber === 1111111);
    expect(olive).toMatchObject({
      eligible: true,
      currentPrice: 11.49,
      totalSavings: 3.5,
      daysRemaining: 16,
      deadline: "2026-12-01",
      hints: [],
    });
    // The $1.00 row is from another warehouse and doesn't count.
    expect(olive?.ignoredPrices[0]).toContain("warehouse #1");

    const towels = evaluation.results.find((line) => line.itemNumber === 6666666);
    expect(towels?.totalSavings).toBe(3.5);

    const chicken = evaluation.results.find((line) => line.itemNumber === 2222222);
    expect(chicken).toMatchObject({ eligible: true, totalSavings: 0 });

    const vitamins = evaluation.results.find((line) => line.itemNumber === 4444444);
    expect(vitamins).toMatchObject({ eligible: true, totalSavings: 5 });
    expect(vitamins?.hints[0]).toContain(".97");

    const gift = evaluation.results.find((line) => line.itemNumber === 5555555);
    expect(gift?.hints.join(" ")).toContain("gift cards");
  });

  it("points warehouse claims to the Returns counter, not a phone number", () => {
    const report = formatRefundReport(
      evaluateRefunds({ receiptText: fixture("sample-receipt.txt"), prices, asOf: "2026-11-15" })
    );
    expect(report).toContain("Receipt Rewind");
    expect(report).toContain("Returns counter at warehouse #116");
    expect(report).toContain("Costco decides every claim");
    expect(report).not.toContain("774-2678");
  });

  it("never matches a saved costco.com page against a warehouse receipt", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices: parsePublicPriceHtml(fixture("public-price-page.html"), {
        warehouseId: 116,
        observedDate: "2026-11-10",
      }),
      asOf: "2026-11-15",
    });
    expect(evaluation.totalRefund).toBe(0);
    const olive = evaluation.results.find((line) => line.itemNumber === 1111111);
    expect(olive?.ignoredPrices[0]).toContain("online price");
  });

  it("does not let a price with a blank warehouse match any warehouse", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices: parsePriceCatalogCsv(
        "item_number,description,price,warehouse_id,observed_date\n1111111,KS OLIVE OIL,9.99,,2026-11-10"
      ),
      asOf: "2026-11-15",
    });
    expect(evaluation.totalRefund).toBe(0);
    const olive = evaluation.results.find((line) => line.itemNumber === 1111111);
    expect(olive?.ignoredPrices[0]).toContain("no warehouse number");
  });

  it("skips per-pound prices", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices: parsePriceCatalogCsv(
        "item_number,description,price,warehouse_id,observed_date,channel,unit\n2222222,ROTISSERIE CHICKEN,1.99,116,2026-11-10,warehouse,lb"
      ),
      asOf: "2026-11-15",
    });
    const chicken = evaluation.results.find((line) => line.itemNumber === 2222222);
    expect(chicken?.totalSavings).toBe(0);
    expect(chicken?.ignoredPrices[0]).toContain("per-pound");
  });

  it("uses the promotion end date as the deadline and respects promo limits", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices: parsePriceCatalogCsv(
        "item_number,description,price,warehouse_id,observed_date,channel,promo_end,promo_limit\n1111111,KS OLIVE OIL,11.49,116,2026-11-10,warehouse,2026-11-20,1"
      ),
      asOf: "2026-11-15",
    });
    const olive = evaluation.results.find((line) => line.itemNumber === 1111111);
    expect(olive).toMatchObject({ deadline: "2026-11-20", daysRemaining: 5, totalSavings: 3.5 });

    const after = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices: parsePriceCatalogCsv(
        "item_number,description,price,warehouse_id,observed_date,channel,promo_end\n1111111,KS OLIVE OIL,11.49,116,2026-11-10,warehouse,2026-11-12"
      ),
      asOf: "2026-11-15",
    });
    expect(after.totalRefund).toBe(0);
  });

  it("skips fuel receipts instead of treating them as a failed parse", () => {
    const evaluation = evaluateRefunds({
      receiptText:
        "Gas Station Receipt | 11/02/2026 09:00 | Sampletown #123\nPump 4, Gallons 10.000, $4.999/gal, Regular $49.99; Total Sale $49.99",
      prices,
      asOf: "2026-11-15",
    });
    expect(evaluation.isFuel).toBe(true);
    expect(formatRefundReport(evaluation)).toContain("Fuel receipt: skipped");
  });

  it("parses a digital receipt email without taking the subtotal as the total", () => {
    const parsed = parseEmailReceipt(fixture("sample-email.html"));
    expect(parsed.subtotal).toBe(33.98);
    expect(parsed.tax).toBe(1.31);
    expect(parsed.total).toBe(35.29);
    expect(parsed.items).toHaveLength(2);

    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-email.html"),
      prices,
      asOf: "2026-11-15",
    });
    expect(evaluation.totalRefund).toBe(7);
  });

  it("sends Costco.com orders to the online form", () => {
    expect(claimInstructions("online", null)).toContain("Request a Price Match form");
    expect(detectChannel("Costco.com Order Number 123")).toBe("online");
  });
});

describe("redactReceiptText", () => {
  it("removes membership numbers before storage", () => {
    const redacted = redactReceiptText(fixture("sample-receipt.txt"));
    expect(redacted).not.toContain("123456789012");
    expect(redacted).toContain("MEMBER #[redacted]");
    expect(redacted).toContain("KS OLIVE OIL");
  });
});
