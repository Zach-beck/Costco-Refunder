-- Costco Refunder: Initial schema migration
-- Generated from packages/shared/src/schema.ts

CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" integer PRIMARY KEY,
  "name" text NOT NULL,
  "city" text,
  "state" text,
  "zip" text,
  "region" text
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text UNIQUE NOT NULL,
  "password_hash" text NOT NULL,
  "costco_member_id" text,
  "home_warehouse_id" integer REFERENCES "warehouses"("id"),
  "notification_prefs" jsonb DEFAULT '{"email": true, "push": true}',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "warehouse_id" integer REFERENCES "warehouses"("id"),
  "receipt_date" date NOT NULL,
  "image_url" text NOT NULL,
  "subtotal" decimal(10, 2),
  "tax" decimal(10, 2),
  "total" decimal(10, 2),
  "parse_status" text DEFAULT 'pending',
  "parse_confidence" real,
  "raw_ocr_text" text,
  "adjustment_window_end" date,
  "created_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "items" (
  "id" integer PRIMARY KEY,
  "description" text,
  "category" text,
  "first_seen" date,
  "last_seen" date
);

CREATE TABLE IF NOT EXISTS "receipt_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "receipt_id" uuid NOT NULL REFERENCES "receipts"("id") ON DELETE CASCADE,
  "item_id" integer REFERENCES "items"("id"),
  "description_raw" text,
  "quantity" integer DEFAULT 1,
  "unit_price" decimal(10, 2) NOT NULL,
  "total_price" decimal(10, 2) NOT NULL,
  "is_taxable" boolean DEFAULT false,
  "ocr_confidence" real,
  "is_eligible" boolean DEFAULT true,
  "tracking_active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "price_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" integer NOT NULL REFERENCES "items"("id"),
  "warehouse_id" integer NOT NULL REFERENCES "warehouses"("id"),
  "price" decimal(10, 2) NOT NULL,
  "observed_date" date NOT NULL,
  "source" text NOT NULL,
  "reported_by" uuid REFERENCES "users"("id"),
  "verified" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "price_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "receipt_item_id" uuid NOT NULL REFERENCES "receipt_items"("id"),
  "original_price" decimal(10, 2) NOT NULL,
  "new_price" decimal(10, 2) NOT NULL,
  "savings" decimal(10, 2) NOT NULL,
  "observation_id" uuid REFERENCES "price_observations"("id"),
  "status" text DEFAULT 'pending',
  "eligible_until" date NOT NULL,
  "notified_at" timestamptz,
  "claimed_at" timestamptz,
  "created_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_receipts_window" ON "receipts" ("user_id", "adjustment_window_end");
CREATE INDEX IF NOT EXISTS "idx_receipt_items_item_id" ON "receipt_items" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_receipt_items_tracking" ON "receipt_items" ("tracking_active", "item_id");
CREATE INDEX IF NOT EXISTS "idx_price_observations_lookup" ON "price_observations" ("item_id", "warehouse_id", "observed_date");
CREATE INDEX IF NOT EXISTS "idx_alerts_pending" ON "price_alerts" ("user_id", "status");
