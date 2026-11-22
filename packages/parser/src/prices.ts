/**
 * Where a price was seen.
 * - "warehouse": on the shelf (or a warehouse deal list) at the warehouse in `warehouseId`
 * - "online": costco.com or another online Costco channel. Never matched against warehouse receipts.
 */
export type PriceChannel = "warehouse" | "online";

/** "each" is a per-item price. "lb" is a per-pound price and can't be compared to a receipt total. */
export type PriceUnit = "each" | "lb";

export interface CatalogPrice {
  itemNumber: number;
  description: string;
  price: number;
  /** Required for warehouse prices. A blank warehouse never matches a warehouse receipt. */
  warehouseId: number | null;
  observedDate: string | null;
  channel: PriceChannel;
  unit: PriceUnit;
  /** Last day of a dated promotion. A promo drop must be claimed before it ends. */
  promoEnd: string | null;
  /** Promotional item limit. Only this many units count. */
  promoLimit: number | null;
}

export interface PriceParseDefaults {
  warehouseId?: number | null;
  observedDate?: string | null;
  channel?: PriceChannel;
}

export function parsePriceCatalogCsv(
  csv: string,
  defaults: PriceParseDefaults = {}
): CatalogPrice[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) return [];

  const headerCells = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = headerCells.some((cell) => cell.includes("price") || cell.includes("item"));
  const start = hasHeader ? 1 : 0;
  const index = hasHeader ? headerIndex(headerCells) : null;

  const prices: CatalogPrice[] = [];
  for (const line of lines.slice(start)) {
    const cells = splitCsvLine(line);
    const itemRaw = pick(cells, index, "item", 0);
    const description = pick(cells, index, "description", 1) || "";
    const priceRaw = pick(cells, index, "price", index ? 2 : cells.length > 2 ? 2 : 1);
    const warehouseRaw = pick(cells, index, "warehouse", 3);
    const dateRaw = pick(cells, index, "date", 4);
    const channelRaw = index && index.channel !== undefined ? cells[index.channel] ?? "" : "";
    const unitRaw = index && index.unit !== undefined ? cells[index.unit] ?? "" : "";
    const promoEndRaw = index && index.promoEnd !== undefined ? cells[index.promoEnd] ?? "" : "";
    const promoLimitRaw =
      index && index.promoLimit !== undefined ? cells[index.promoLimit] ?? "" : "";

    const itemNumber = parseInt(itemRaw.replace(/\D/g, ""), 10);
    const price = parsePriceToken(priceRaw);
    if (!Number.isFinite(itemNumber) || itemNumber <= 0 || price == null) continue;

    const warehouseId = parseOptionalInt(warehouseRaw) ?? defaults.warehouseId ?? null;
    const observedDate = normalizeDate(dateRaw) ?? defaults.observedDate ?? null;

    prices.push({
      itemNumber,
      description: description.trim(),
      price,
      warehouseId,
      observedDate,
      // A CSV you type is what you saw in the warehouse unless it says otherwise.
      channel: parseChannel(channelRaw) ?? defaults.channel ?? "warehouse",
      unit: parseUnit(unitRaw || channelRaw),
      promoEnd: normalizeDate(promoEndRaw),
      promoLimit: parseOptionalInt(promoLimitRaw),
    });
  }

  return prices;
}

export function parsePublicPriceHtml(
  html: string,
  defaults: PriceParseDefaults = {}
): CatalogPrice[] {
  return [
    ...parseArticlePrices(html, defaults),
    ...parseTablePrices(html, defaults),
  ];
}

function parseArticlePrices(html: string, defaults: PriceParseDefaults): CatalogPrice[] {
  const pattern =
    /<article\b[^>]*data-item-number=["'](\d{5,7})["'][^>]*>([\s\S]*?)<\/article>/gi;
  const prices: CatalogPrice[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const price = firstPrice(match[2]);
    if (price == null) continue;
    const heading = match[2].match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    prices.push({
      itemNumber: parseInt(match[1], 10),
      description: stripTags(heading?.[1] ?? ""),
      price,
      warehouseId: defaults.warehouseId ?? null,
      observedDate: defaults.observedDate ?? null,
      // A saved product page is a costco.com page: an online price.
      channel: defaults.channel ?? "online",
      unit: "each",
      promoEnd: null,
      promoLimit: null,
    });
  }
  return prices;
}

function parseTablePrices(html: string, defaults: PriceParseDefaults): CatalogPrice[] {
  const prices: CatalogPrice[] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html))) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (cell) => stripTags(cell[1])
    );
    const itemCell = cells.find((cell) => /^\d{5,7}$/.test(cell));
    if (!itemCell) continue;
    const price = cells
      .map((cell) => firstPrice(cell))
      .find((value) => value != null);
    if (price == null) continue;
    const description =
      cells.find(
        (cell) =>
          cell !== itemCell &&
          firstPrice(cell) == null &&
          !/^\d{5,7}$/.test(cell)
      ) ?? "";
    prices.push({
      itemNumber: parseInt(itemCell, 10),
      description,
      price,
      warehouseId: defaults.warehouseId ?? null,
      observedDate: defaults.observedDate ?? null,
      // A saved product page is a costco.com page: an online price.
      channel: defaults.channel ?? "online",
      unit: "each",
      promoEnd: null,
      promoLimit: null,
    });
  }
  return prices;
}

function headerIndex(cells: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  cells.forEach((cell, position) => {
    if (cell.includes("item")) index.item = position;
    else if (cell.includes("desc") || cell.includes("name")) index.description = position;
    else if (cell.includes("price")) index.price = position;
    else if (cell.includes("warehouse") || cell === "wh") index.warehouse = position;
    else if (cell === "promo_end" || cell === "promo end") index.promoEnd = position;
    else if (cell === "promo_limit" || cell === "promo limit") index.promoLimit = position;
    else if (cell.includes("date")) index.date = position;
    else if (cell === "channel") index.channel = position;
    else if (cell === "unit") index.unit = position;
  });
  return index;
}

function pick(
  cells: string[],
  index: Record<string, number> | null,
  key: string,
  fallback: number
): string {
  const position = index && index[key] !== undefined ? index[key] : fallback;
  return cells[position] ?? "";
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parsePriceToken(raw: string): number | null {
  if (!raw) return null;
  const match = raw.replace(/,/g, "").match(/(\d{1,5}\.\d{2})/);
  if (!match) return null;
  return parseFloat(match[1]);
}

function firstPrice(text: string): number | null {
  const plain = stripTags(text);
  const match = plain.match(/\$\s*(\d{1,5}\.\d{2})|(?:^|\s)(\d{1,5}\.\d{2})(?:\s|$)/);
  if (!match) return null;
  return parseFloat(match[1] || match[2]);
}

function parseOptionalInt(raw: string): number | null {
  if (!raw) return null;
  const match = raw.match(/\d{1,4}/);
  if (!match) return null;
  return parseInt(match[0], 10);
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!mdy) return null;
  const month = mdy[1].padStart(2, "0");
  const day = mdy[2].padStart(2, "0");
  const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
  return `${year}-${month}-${day}`;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseChannel(raw: string): PriceChannel | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "online" || value.includes("costco.com") || value === "same-day") return "online";
  if (value.startsWith("wh") || value === "warehouse" || value === "in-warehouse") return "warehouse";
  return null;
}

function parseUnit(raw: string): PriceUnit {
  const value = raw.trim().toLowerCase();
  return value === "lb" || value === "per-lb" || value === "per lb" ? "lb" : "each";
}
