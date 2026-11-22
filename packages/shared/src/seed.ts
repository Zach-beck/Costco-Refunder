import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { warehouses } from "./schema.js";
import { SAMPLE_WAREHOUSES } from "./warehouses.js";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = postgres(url);
  const db = drizzle(client);

  console.log("Seeding warehouses...");
  await db
    .insert(warehouses)
    .values(SAMPLE_WAREHOUSES)
    .onConflictDoNothing();

  console.log(`Seeded ${SAMPLE_WAREHOUSES.length} warehouses.`);
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
