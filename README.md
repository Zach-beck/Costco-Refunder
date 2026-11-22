# Costco Refunder

Compare a Costco receipt with a later price. If the item is still inside the 30-day price adjustment window, the app shows the refund and how to ask for it at the membership counter or by calling 1-800-774-2678.

You supply the receipt and the prices. The app does not log into Costco, does not store a membership number, and does not send the claim for you.

## Quickstart

Requirements: Node.js 20+ and Yarn 1.x. Docker is optional and not used below.

```bash
yarn install
yarn test
yarn refund -- --receipt fixtures/sample-receipt.txt --prices fixtures/public-prices.csv --as-of 2026-11-15
yarn dev:local
```

`yarn test` runs offline against fixtures. The refund command prints the claimable total for that sample (olive oil and paper towels, $7.00 on 2026-11-15).

Then open http://localhost:5173.

1. Create an account. The password is only for this app. It is stored as a hash in the local database under `data/`.
2. Open Upload.
3. Choose "Use sample" on the receipt form, then "Use sample" on the prices form.
4. Open Price Alerts and a guide. The sample purchase is dated 10 days before today so the window is still open.

Paste your own receipt text the same way. For prices, paste a CSV or a public product page you saved from your browser:

```text
item_number,description,price,warehouse_id,observed_date
1111111,KS OLIVE OIL,11.49,116,2026-11-20
```

`observed_date` is when you saw the price. A warehouse id should match the receipt (`WAREHOUSE #116` in the sample). Prices from a different warehouse are ignored.

A saved page can be an `<article data-item-number="1111111">` with a `$11.49` price, or a table row with the item number, name, and price.

## What the check does

1. Read item number, description, quantity, and price from receipt text or a saved email.
2. Drop lines that are outside 30 days, clearance (price ends in .97), or an excluded category (fuel, pharmacy, tobacco, gift cards, special orders).
3. Match a later price for the same item number and warehouse.
4. Report `(paid - current) x quantity` and the deadline.

Photo upload still runs Tesseract locally. The first photo can download language data, so the text path is the one that works offline.

## Environment

Copy `.env.example` to `.env` only if you want to override the defaults. `.env` is gitignored. Do not commit it.

Local mode uses:

| Name | Purpose |
| --- | --- |
| `LOCAL_MODE` | `1` embeds the database and skips Redis and object storage |
| `DATA_DIR` | Where the local database and photos live. Default `./data` |
| `SESSION_SECRET` | Signs cookies. Change this if anyone else can reach the server |
| `PORT` | API port, default `3001` |
| `WEB_URL` | Web origin, default `http://localhost:5173` |

These names are optional and unused by the local quickstart. Set them only in `.env`:

`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `API_URL`, `NODE_ENV`, `COOKIE_DOMAIN`.

The MinIO values in the example are the stock local defaults. Do not reuse them on a shared machine.

## Optional Docker stack

`docker compose up -d` starts Postgres, Redis, and MinIO. Then set `LOCAL_MODE=0` in `.env` and run `yarn db:migrate`, `yarn db:seed`, and `yarn dev`. That path was the original design. The quickstart above does not need it.

`make local` is the same as `yarn dev:local`. `make dev` still starts Docker.

## Layout

```text
packages/shared    schema, warehouse list, shared types
packages/parser    receipt parsing, price files, refund math, tests
packages/api       Fastify API. Local mode or Postgres
packages/web       React app
fixtures           fake receipt, email, CSV, and saved price page
docs/decisions-review.md
```

## Tests

```bash
yarn test
```

Parser tests cover receipt lines, eligibility, the sample fixtures, CSV, a saved HTML price page, and a digital receipt email. They do not call Costco and they do not use a real account.

## Notes

Policy details can change. Confirm the adjustment at the warehouse before you count on a refund.

See `docs/decisions-review.md` for which earlier choices held up, which were risky, and what this version changed.
