import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { warehouses } from "./schema.js";

const SAMPLE_WAREHOUSES = [
  { id: 1, name: "Seattle #1", city: "Seattle", state: "WA", zip: "98134", region: "Pacific Northwest" },
  { id: 2, name: "Kirkland", city: "Kirkland", state: "WA", zip: "98034", region: "Pacific Northwest" },
  { id: 3, name: "Tukwila", city: "Tukwila", state: "WA", zip: "98188", region: "Pacific Northwest" },
  { id: 4, name: "Lynnwood", city: "Lynnwood", state: "WA", zip: "98036", region: "Pacific Northwest" },
  { id: 5, name: "Shoreline", city: "Shoreline", state: "WA", zip: "98133", region: "Pacific Northwest" },
  { id: 110, name: "Issaquah", city: "Issaquah", state: "WA", zip: "98027", region: "Pacific Northwest" },
  { id: 116, name: "Woodinville", city: "Woodinville", state: "WA", zip: "98072", region: "Pacific Northwest" },
  { id: 24, name: "Aloha", city: "Aloha", state: "OR", zip: "97006", region: "Pacific Northwest" },
  { id: 32, name: "Portland", city: "Portland", state: "OR", zip: "97230", region: "Pacific Northwest" },
  { id: 101, name: "San Francisco", city: "San Francisco", state: "CA", zip: "94103", region: "Northern California" },
  { id: 102, name: "South San Francisco", city: "South San Francisco", state: "CA", zip: "94080", region: "Northern California" },
  { id: 103, name: "San Jose", city: "San Jose", state: "CA", zip: "95131", region: "Northern California" },
  { id: 119, name: "Mountain View", city: "Mountain View", state: "CA", zip: "94043", region: "Northern California" },
  { id: 121, name: "Sunnyvale", city: "Sunnyvale", state: "CA", zip: "94086", region: "Northern California" },
  { id: 131, name: "Burbank", city: "Burbank", state: "CA", zip: "91502", region: "Southern California" },
  { id: 132, name: "Hawthorne", city: "Hawthorne", state: "CA", zip: "90250", region: "Southern California" },
  { id: 133, name: "Culver City", city: "Culver City", state: "CA", zip: "90232", region: "Southern California" },
  { id: 134, name: "Van Nuys", city: "Van Nuys", state: "CA", zip: "91405", region: "Southern California" },
  { id: 150, name: "Irvine", city: "Irvine", state: "CA", zip: "92618", region: "Southern California" },
  { id: 201, name: "Las Vegas #1", city: "Las Vegas", state: "NV", zip: "89118", region: "Southwest" },
  { id: 202, name: "Las Vegas #2", city: "Las Vegas", state: "NV", zip: "89130", region: "Southwest" },
  { id: 203, name: "Henderson", city: "Henderson", state: "NV", zip: "89014", region: "Southwest" },
  { id: 301, name: "Scottsdale", city: "Scottsdale", state: "AZ", zip: "85260", region: "Southwest" },
  { id: 302, name: "Gilbert", city: "Gilbert", state: "AZ", zip: "85296", region: "Southwest" },
  { id: 401, name: "Dallas", city: "Dallas", state: "TX", zip: "75240", region: "South Central" },
  { id: 402, name: "Plano", city: "Plano", state: "TX", zip: "75024", region: "South Central" },
  { id: 403, name: "Houston #1", city: "Houston", state: "TX", zip: "77077", region: "South Central" },
  { id: 404, name: "Austin", city: "Austin", state: "TX", zip: "78759", region: "South Central" },
  { id: 501, name: "Schaumburg", city: "Schaumburg", state: "IL", zip: "60173", region: "Midwest" },
  { id: 502, name: "Naperville", city: "Naperville", state: "IL", zip: "60563", region: "Midwest" },
  { id: 601, name: "Wayne", city: "Wayne", state: "NJ", zip: "07470", region: "Northeast" },
  { id: 602, name: "Edison", city: "Edison", state: "NJ", zip: "08837", region: "Northeast" },
  { id: 603, name: "Brooklyn", city: "Brooklyn", state: "NY", zip: "11220", region: "Northeast" },
  { id: 604, name: "Long Island City", city: "Long Island City", state: "NY", zip: "11101", region: "Northeast" },
  { id: 701, name: "Atlanta (Perimeter)", city: "Atlanta", state: "GA", zip: "30346", region: "Southeast" },
  { id: 702, name: "Kennesaw", city: "Kennesaw", state: "GA", zip: "30144", region: "Southeast" },
  { id: 801, name: "Miami", city: "Miami", state: "FL", zip: "33172", region: "Southeast" },
  { id: 802, name: "Davie", city: "Davie", state: "FL", zip: "33324", region: "Southeast" },
  { id: 803, name: "Orlando", city: "Orlando", state: "FL", zip: "32839", region: "Southeast" },
];

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
