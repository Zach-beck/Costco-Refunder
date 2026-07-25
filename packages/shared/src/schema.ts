import {
  pgTable,
  uuid,
  text,
  integer,
  decimal,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  costcoMemberId: text("costco_member_id"),
  homeWarehouseId: integer("home_warehouse_id").references(
    () => warehouses.id
  ),
  notificationPrefs: jsonb("notification_prefs")
    .$type<{ email: boolean; push: boolean }>()
    .default({ email: true, push: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Warehouses ──────────────────────────────────────────────────────────────

export const warehouses = pgTable("warehouses", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  region: text("region"),
});

// ─── Receipts ────────────────────────────────────────────────────────────────

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    warehouseId: integer("warehouse_id").references(() => warehouses.id),
    receiptDate: date("receipt_date").notNull(),
    imageUrl: text("image_url").notNull(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
    tax: decimal("tax", { precision: 10, scale: 2 }),
    total: decimal("total", { precision: 10, scale: 2 }),
    parseStatus: text("parse_status")
      .$type<"pending" | "processing" | "complete" | "failed">()
      .default("pending"),
    parseConfidence: real("parse_confidence"),
    rawOcrText: text("raw_ocr_text"),
    adjustmentWindowEnd: date("adjustment_window_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    windowIdx: index("idx_receipts_window").on(
      table.userId,
      table.adjustmentWindowEnd
    ),
  })
);

// ─── Items (canonical registry) ──────────────────────────────────────────────

export const items = pgTable("items", {
  id: integer("id").primaryKey(),
  description: text("description"),
  category: text("category"),
  firstSeen: date("first_seen"),
  lastSeen: date("last_seen"),
});

// ─── Receipt Line Items ──────────────────────────────────────────────────────

export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .references(() => receipts.id, { onDelete: "cascade" })
      .notNull(),
    itemId: integer("item_id").references(() => items.id),
    descriptionRaw: text("description_raw"),
    quantity: integer("quantity").default(1),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
    isTaxable: boolean("is_taxable").default(false),
    ocrConfidence: real("ocr_confidence"),
    isEligible: boolean("is_eligible").default(true),
    trackingActive: boolean("tracking_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    itemIdx: index("idx_receipt_items_item_id").on(table.itemId),
    trackingIdx: index("idx_receipt_items_tracking").on(
      table.trackingActive,
      table.itemId
    ),
  })
);

// ─── Price Observations ──────────────────────────────────────────────────────

export const priceObservations = pgTable(
  "price_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: integer("item_id")
      .references(() => items.id)
      .notNull(),
    warehouseId: integer("warehouse_id")
      .references(() => warehouses.id)
      .notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    observedDate: date("observed_date").notNull(),
    source: text("source")
      .$type<"receipt_upload" | "manual_entry" | "web_scrape">()
      .notNull(),
    reportedBy: uuid("reported_by").references(() => users.id),
    verified: boolean("verified").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    lookupIdx: index("idx_price_observations_lookup").on(
      table.itemId,
      table.warehouseId,
      table.observedDate
    ),
  })
);

// ─── Price Alerts ────────────────────────────────────────────────────────────

export const priceAlerts = pgTable(
  "price_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    receiptItemId: uuid("receipt_item_id")
      .references(() => receiptItems.id)
      .notNull(),
    originalPrice: decimal("original_price", {
      precision: 10,
      scale: 2,
    }).notNull(),
    newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
    savings: decimal("savings", { precision: 10, scale: 2 }).notNull(),
    observationId: uuid("observation_id").references(
      () => priceObservations.id
    ),
    status: text("status")
      .$type<"pending" | "notified" | "claimed" | "expired" | "dismissed">()
      .default("pending"),
    eligibleUntil: date("eligible_until").notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pendingIdx: index("idx_alerts_pending").on(table.userId, table.status),
  })
);

// ─── Push Subscriptions ──────────────────────────────────────────────────────

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  receipts: many(receipts),
  alerts: many(priceAlerts),
  pushSubscriptions: many(pushSubscriptions),
  homeWarehouse: one(warehouses, {
    fields: [users.homeWarehouseId],
    references: [warehouses.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  user: one(users, { fields: [receipts.userId], references: [users.id] }),
  warehouse: one(warehouses, {
    fields: [receipts.warehouseId],
    references: [warehouses.id],
  }),
  items: many(receiptItems),
}));

export const receiptItemsRelations = relations(receiptItems, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptItems.receiptId],
    references: [receipts.id],
  }),
  item: one(items, {
    fields: [receiptItems.itemId],
    references: [items.id],
  }),
}));

export const priceAlertsRelations = relations(priceAlerts, ({ one }) => ({
  user: one(users, {
    fields: [priceAlerts.userId],
    references: [users.id],
  }),
  receiptItem: one(receiptItems, {
    fields: [priceAlerts.receiptItemId],
    references: [receiptItems.id],
  }),
  observation: one(priceObservations, {
    fields: [priceAlerts.observationId],
    references: [priceObservations.id],
  }),
}));
