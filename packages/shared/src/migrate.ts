import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = postgres(url);

  console.log("Running migrations...");

  const migrationPath = join(__dirname, "../drizzle/0000_initial.sql");
  const sql = readFileSync(migrationPath, "utf-8");

  await client.unsafe(sql);

  console.log("Migrations complete.");
  await client.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
