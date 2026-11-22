import "./load-env.js";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@costco-refunder/shared";
import { SAMPLE_WAREHOUSES } from "@costco-refunder/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { isLocalMode } from "./mode.js";

const { warehouses } = schema;

async function createLocalDb(): Promise<PostgresJsDatabase<typeof schema>> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = process.env.DATA_DIR || "./data";
  const pgliteDir = join(dataDir, "pglite");
  mkdirSync(pgliteDir, { recursive: true });
  const client = new PGlite(pgliteDir);
  await client.waitReady;
  const migrationPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../shared/drizzle/0000_initial.sql"
  );
  await client.exec(readFileSync(migrationPath, "utf8"));
  const database = drizzle(client, { schema }) as unknown as PostgresJsDatabase<
    typeof schema
  >;
  const existing = await database
    .select({ id: warehouses.id })
    .from(warehouses)
    .limit(1);
  if (existing.length === 0) {
    await database.insert(warehouses).values(SAMPLE_WAREHOUSES);
  }
  return database;
}

async function createServerDb(): Promise<PostgresJsDatabase<typeof schema>> {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required when LOCAL_MODE is off. For a local run, set LOCAL_MODE=1.");
  }
  return drizzle(postgres(url), { schema });
}

export const db: PostgresJsDatabase<typeof schema> = isLocalMode()
  ? await createLocalDb()
  : await createServerDb();
