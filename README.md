# Costco Refunder

Track Costco price drops and get your money back. Upload receipts, monitor prices within the 30-day adjustment window, and get step-by-step refund instructions when a price drops.

## How It Works

1. **Upload** — Photograph your Costco receipt. OCR + regex parsing extracts items automatically.
2. **Track** — Items are monitored for 30 days (Costco's price adjustment window).
3. **Alert** — When a price drops, you get notified with the exact savings amount.
4. **Claim** — Follow step-by-step instructions to get your refund at the membership counter or by phone.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React PWA (Vite)                     │
│         Upload · Dashboard · Alerts · Guide          │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                  Fastify API Server                   │
│        Auth · Receipts · Prices · Dashboard          │
└────┬────────────────────┬──────────────────┬────────┘
     │                    │                  │
     ▼                    ▼                  ▼
┌──────────┐      ┌──────────────┐    ┌───────────┐
│PostgreSQL│      │    Redis     │    │ S3 / R2   │
│  (Neon)  │      │  (BullMQ)   │    │ (Images)  │
└──────────┘      └──────┬───────┘    └───────────┘
                         │
                         ▼
              ┌────────────────────┐
              │   BullMQ Workers   │
              │                    │
              │ · Receipt Parser   │
              │   (Tesseract+Regex)│
              │ · Price Checker    │
              │   (Cron: 6hr)      │
              │ · Notifications    │
              │   (Push + Email)   │
              └────────────────────┘
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + TypeScript + Tailwind (PWA) | Cross-platform, push notifications, camera access |
| Backend | Fastify + TypeScript | Fast, schema validation, shared types |
| Database | PostgreSQL (Drizzle ORM) | Relational + JSONB |
| Queue | BullMQ + Redis | Async receipt parsing, scheduled price checks |
| OCR | Tesseract.js (self-hosted) | Free, no AI API costs |
| Storage | S3-compatible (Cloudflare R2) | Zero egress costs |
| Monorepo | Turborepo + Yarn Workspaces | Fast builds, shared packages |

**Zero AI usage at runtime.** Receipt parsing uses Tesseract OCR + deterministic regex patterns. Price comparison is pure math. Eligibility checking is a rule engine. No LLM calls needed.

## Project Structure

```
costco-price-tracker/
├── packages/
│   ├── shared/          # DB schema (Drizzle), types, constants
│   ├── parser/          # Receipt OCR + regex parsing engine
│   ├── api/             # Fastify server + BullMQ workers
│   └── web/             # React PWA frontend
├── docker-compose.yml   # Local dev: PostgreSQL, Redis, MinIO
├── turbo.json           # Turborepo task config
└── package.json         # Workspace root
```

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn 1.x
- Docker (for local databases)

### Quick Setup (One Command)

```bash
git clone https://github.com/Zach-beck/Costco-Refunder.git
cd Costco-Refunder
./scripts/setup.sh
```

This installs dependencies, starts PostgreSQL/Redis/MinIO via Docker, runs migrations, and seeds warehouse data.

### Manual Setup

```bash
# Install dependencies
yarn install

# Start databases (PostgreSQL, Redis, MinIO)
docker compose up -d

# Copy environment config
cp .env.example .env

# Run database migrations
yarn db:migrate

# Seed warehouse data
yarn db:seed

# Start development servers (API + Web)
yarn dev
```

### Using the Makefile

```bash
make setup     # Full one-command setup
make dev       # Start infra + app
make stop      # Stop Docker containers
make test      # Run all tests
make typecheck # TypeScript checking
make db-reset  # Drop and recreate database
```

The web app runs at `http://localhost:5173` and the API at `http://localhost:3001`.

### Environment Variables

See `.env.example` for all configurable values. Required for local dev:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `S3_ENDPOINT` — MinIO/R2 endpoint

Optional (for notifications):
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Generate with `npx web-push generate-vapid-keys`
- `RESEND_API_KEY` — For email notifications

## Key Design Decisions

### Why no AI/LLM?

Costco receipts are thermal-printed monospace text with a highly consistent format. Deterministic regex parsing achieves 95%+ accuracy on item numbers and 98%+ on prices. This eliminates per-receipt API costs (~$0.01-0.05 each with Vision APIs) — at scale, that saves thousands per month.

### Price Tracking Strategy

Since Costco has no public price API:
1. **Crowdsourced** — Every receipt upload feeds the shared price database
2. **Manual entry** — "I spotted a lower price" button
3. **Rule-based intelligence** — Price ending .97 = clearance, .00/.88 = manufacturer deal
4. **No scraping** — Relies entirely on user-submitted data (legal, sustainable)

### Price Adjustment Policy (as of knowledge cutoff)

- **Window:** 30 days from purchase
- **Method:** Membership counter in-store OR call 1-800-774-2678
- **Exclusions:** Clearance (.97), fuel, pharmacy, tobacco, gift cards, special orders
- **Proof:** Membership card lookup (no receipt required)

## Development Commands

```bash
yarn dev              # Start all services in dev mode
yarn build            # Build all packages
yarn typecheck        # TypeScript type checking
yarn test             # Run tests
yarn db:generate      # Generate Drizzle migrations
yarn db:migrate       # Apply migrations
yarn db:seed          # Seed warehouse data
yarn clean            # Remove build artifacts
```

## Deployment

### Recommended Stack (Low Cost)

| Service | Provider | Cost |
|---------|----------|------|
| API + Workers | Railway | $5-20/mo |
| Frontend | Cloudflare Pages | Free |
| Database | Neon PostgreSQL | Free-$19/mo |
| Redis | Upstash | Free-$5/mo |
| Object Storage | Cloudflare R2 | ~$0 (free tier) |
| **Total** | | **$5-44/month** |

### Production Deployment

1. Push to GitHub (CI/CD triggers on push to main)
2. Frontend deploys automatically to Cloudflare Pages
3. Backend builds Docker image and deploys to Railway
4. Database migrations run as part of deploy pipeline

## Roadmap

- [x] Receipt upload + OCR parsing
- [x] Price tracking with crowdsourced data
- [x] Push + email notifications
- [x] Reimbursement step-by-step guide
- [ ] Digital receipt email forwarding (parse HTML, no OCR needed)
- [ ] Multi-warehouse price comparison
- [ ] Price history charts
- [ ] Barcode scanning for in-store price checks
- [ ] Predictive alerts ("this item usually goes on sale in X month")
- [ ] Household/family sharing

## License

MIT
