const REQUIRED_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_BUCKET",
] as const;

const OPTIONAL_VARS = [
  "SESSION_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RESEND_API_KEY",
  "FROM_EMAIL",
  "WEB_URL",
  "API_URL",
  "PORT",
  "HOST",
  "NODE_ENV",
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error("\n[FATAL] Missing required environment variables:\n");
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    console.error("\nCopy .env.example to .env and fill in the values:");
    console.error("  cp .env.example .env\n");
    process.exit(1);
  }

  // Warn about optional but recommended vars
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "change-me-in-production") {
    if (process.env.NODE_ENV === "production") {
      console.error("[FATAL] SESSION_SECRET must be set in production");
      process.exit(1);
    }
    console.warn("[WARN] Using default SESSION_SECRET — not safe for production");
  }
}
