import { describe, it, expect } from "vitest";
import { parseReceiptLines, analyzePriceEnding, checkItemEligibility } from "../receipt-parser.js";
import type { OcrLine } from "../ocr.js";

function makeLine(text: string, confidence = 0.95): OcrLine {
  return { text, confidence, bbox: { x0: 0, y0: 0, x1: 500, y1: 20 } };
}

describe("parseReceiptLines", () => {
  it("parses a basic item line", () => {
    const lines = [makeLine("1234567  KS OLIVE OIL         12.99 A")];
    const result = parseReceiptLines(lines);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemNumber: 1234567,
      description: "KS OLIVE OIL",
      quantity: 1,
      unitPrice: 12.99,
      totalPrice: 12.99,
      isTaxable: true,
    });
  });

  it("parses quantity lines", () => {
    const lines = [
      makeLine("3 @ 4.99"),
      makeLine("543210  AVOCADOS              14.97"),
    ];
    const result = parseReceiptLines(lines);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemNumber: 543210,
      quantity: 3,
      unitPrice: 4.99,
      totalPrice: 14.97,
    });
  });

  it("extracts warehouse ID", () => {
    const lines = [
      makeLine("WAREHOUSE #116"),
      makeLine("1234567  ITEM NAME            9.99"),
    ];
    const result = parseReceiptLines(lines);
    expect(result.warehouseId).toBe(116);
  });

  it("extracts receipt date (MM/DD/YYYY)", () => {
    const lines = [
      makeLine("01/15/2025"),
      makeLine("1234567  ITEM NAME            9.99"),
    ];
    const result = parseReceiptLines(lines);
    expect(result.receiptDate).toBe("2025-01-15");
  });

  it("extracts subtotal", () => {
    const lines = [
      makeLine("1234567  ITEM A               10.00"),
      makeLine("7654321  ITEM B               5.00"),
      makeLine("SUBTOTAL  15.00"),
    ];
    const result = parseReceiptLines(lines);
    expect(result.subtotal).toBe(15.0);
  });

  it("handles multiple items and calculates confidence", () => {
    const lines = [
      makeLine("WAREHOUSE #1"),
      makeLine("01/20/2025"),
      makeLine("1234567  KS PAPER TOWELS      18.99 A"),
      makeLine("2345678  ROTISSERIE CHICKEN   4.99"),
      makeLine("3456789  KS WATER 40PK        4.49"),
      makeLine("SUBTOTAL  28.47"),
      makeLine("TAX  1.66"),
      makeLine("** TOTAL  30.13"),
    ];
    const result = parseReceiptLines(lines);

    expect(result.items).toHaveLength(3);
    expect(result.subtotal).toBe(28.47);
    expect(result.tax).toBe(1.66);
    expect(result.total).toBe(30.13);
    expect(result.warehouseId).toBe(1);
    expect(result.overallConfidence).toBeGreaterThan(0.9);
  });

  it("handles non-taxable items", () => {
    const lines = [makeLine("9876543  BANANAS ORGANIC      3.49")];
    const result = parseReceiptLines(lines);
    expect(result.items[0].isTaxable).toBe(false);
  });
});

describe("analyzePriceEnding", () => {
  it("identifies clearance pricing (.97)", () => {
    const result = analyzePriceEnding(24.97);
    expect(result.type).toBe("clearance");
    expect(result.isEligibleForAdjustment).toBe(false);
  });

  it("identifies manufacturer special (.00)", () => {
    const result = analyzePriceEnding(10.0);
    expect(result.type).toBe("manufacturer_special");
    expect(result.isEligibleForAdjustment).toBe(true);
  });

  it("identifies manufacturer special (.88)", () => {
    const result = analyzePriceEnding(15.88);
    expect(result.type).toBe("manufacturer_special");
    expect(result.isEligibleForAdjustment).toBe(true);
  });

  it("identifies regular pricing", () => {
    const result = analyzePriceEnding(12.99);
    expect(result.type).toBe("regular");
    expect(result.isEligibleForAdjustment).toBe(true);
  });
});

describe("checkItemEligibility", () => {
  const baseItem = {
    itemNumber: 1234567,
    description: "KS OLIVE OIL",
    quantity: 1,
    unitPrice: 12.99,
    totalPrice: 12.99,
    isTaxable: false,
    confidence: 0.95,
  };

  it("marks item as eligible within window", () => {
    const result = checkItemEligibility(baseItem, "2025-01-01", "2025-01-15");
    expect(result.isEligible).toBe(true);
    expect(result.reason).toContain("16 days remaining");
  });

  it("marks item as ineligible outside window", () => {
    const result = checkItemEligibility(baseItem, "2025-01-01", "2025-02-15");
    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("Outside 30-day");
  });

  it("marks clearance items as ineligible", () => {
    const clearanceItem = { ...baseItem, unitPrice: 24.97 };
    const result = checkItemEligibility(clearanceItem, "2025-01-01", "2025-01-15");
    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("Clearance");
  });

  it("marks fuel as ineligible", () => {
    const fuelItem = { ...baseItem, description: "FUEL GASOLINE REG" };
    const result = checkItemEligibility(fuelItem, "2025-01-01", "2025-01-15");
    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("excluded");
  });

  it("marks gift cards as ineligible", () => {
    const giftCard = { ...baseItem, description: "GIFT CARD $50" };
    const result = checkItemEligibility(giftCard, "2025-01-01", "2025-01-15");
    expect(result.isEligible).toBe(false);
  });
});
