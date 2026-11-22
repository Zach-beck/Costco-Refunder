import { describe, it, expect } from "vitest";
import { parseReceiptText } from "../refund.js";

// Synthetic receipts in the costco.com "Orders & Purchases" text format.
// Every item number, description, price and store name here is made up.
// Do not paste real receipt lines into this file.
const MEMBER_FORMAT = `Date: 2026-04-09 | Warehouse: SampleTown123
In-Warehouse Receipt
SAMPLETOWN #123
7100001 TEST SODA 10.49 Y
9001 CA REDEMP VAL T EE/7100001 0.90
7100002 TEST BREAD 2 @ 5.25 = 10.50 N
8123 TEST PEARS 6.49 N
7100003 TEST CEREAL 9.99 N
900001 /7100003 2.00- (instant savings)
7100004 TEST SPEAKER 59.99 B
SUBTOTAL 96.36
TAX 6.02
TOTAL 102.38
(B) B tax 0.50
Items sold 6`;

const ONE_LINE_HEADER = `In-Warehouse Receipt | 04/12/2026 10:15am | SAMPLETOWN #987, 1 MAIN ST
7100005 TEST LAMP 39.99 Y
 900002 /7100005 8.00- (instant savings)
SUBTOTAL 31.99
TAX 2.48
TOTAL 34.47`;

describe("member receipt text format", () => {
  it("parses single-spaced items, inline quantities, 4-digit items and linked savings", () => {
    const r = parseReceiptText(MEMBER_FORMAT);
    expect(r.receiptDate).toBe("2026-04-09");
    expect(r.warehouseId).toBe(123);
    expect(r.items.map((i) => i.itemNumber)).toEqual([7100001, 7100002, 8123, 7100003, 7100004]);
    expect(r.items[1]).toMatchObject({ quantity: 2, unitPrice: 5.25, totalPrice: 10.5 });
    expect(r.items[3]).toMatchObject({ unitPrice: 7.99, totalPrice: 7.99, shelfPrice: 9.99 });
    expect(r.items[0].isTaxable).toBe(true);
    expect(r.items[2].isTaxable).toBe(false);
    expect(r.items[4].isTaxable).toBe(true);
    expect(r.tax).toBe(6.02);
    expect(r.total).toBe(102.38);
    expect(r.overallConfidence).toBeGreaterThan(0.9);
  });

  it("reads the one-line header", () => {
    const r = parseReceiptText(ONE_LINE_HEADER);
    expect(r.receiptDate).toBe("2026-04-12");
    expect(r.warehouseId).toBe(987);
    expect(r.items[0]).toMatchObject({ itemNumber: 7100005, unitPrice: 31.99, shelfPrice: 39.99 });
  });
});
