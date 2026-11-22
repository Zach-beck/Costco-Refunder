import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEmailReceipt } from "../email-parser.js";
import { parsePriceCatalogCsv, parsePublicPriceHtml } from "../prices.js";
import { redactReceiptText } from "../redact.js";
import { evaluateRefunds } from "../refund.js";

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

  it("computes claimable refunds from the sample receipt", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices,
      asOf: "2026-11-15",
    });

    expect(evaluation.receipt.warehouseId).toBe(116);
    expect(evaluation.receipt.receiptDate).toBe("2026-11-01");
    expect(evaluation.receipt.items).toHaveLength(6);
    expect(evaluation.totalRefund).toBe(7);

    const olive = evaluation.results.find((line) => line.itemNumber === 1111111);
    expect(olive).toMatchObject({
      eligible: true,
      currentPrice: 11.49,
      totalSavings: 3.5,
      daysRemaining: 16,
      deadline: "2026-12-01",
    });

    const towels = evaluation.results.find((line) => line.itemNumber === 6666666);
    expect(towels?.totalSavings).toBe(3.5);

    const chicken = evaluation.results.find((line) => line.itemNumber === 2222222);
    expect(chicken).toMatchObject({ eligible: true, totalSavings: 0 });

    expect(evaluation.results.find((line) => line.itemNumber === 3333333)?.eligible).toBe(false);
    expect(evaluation.results.find((line) => line.itemNumber === 4444444)?.eligible).toBe(false);
    expect(evaluation.results.find((line) => line.itemNumber === 5555555)?.eligible).toBe(false);
  });

  it("uses a saved HTML price page the same way", () => {
    const evaluation = evaluateRefunds({
      receiptText: fixture("sample-receipt.txt"),
      prices: parsePublicPriceHtml(fixture("public-price-page.html"), {
        warehouseId: 116,
        observedDate: "2026-11-10",
      }),
      asOf: "2026-11-15",
    });
    expect(evaluation.totalRefund).toBe(7);
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
});

describe("redactReceiptText", () => {
  it("removes membership numbers before storage", () => {
    const redacted = redactReceiptText(fixture("sample-receipt.txt"));
    expect(redacted).not.toContain("123456789012");
    expect(redacted).toContain("MEMBER #[redacted]");
    expect(redacted).toContain("KS OLIVE OIL");
  });
});
