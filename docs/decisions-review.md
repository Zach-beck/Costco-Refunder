# Decisions review

> Update, Nov 21, 2026: this project was renamed from Costco Refunder to Receipt Rewind, and several rules below were corrected after checking Costco's own pages. Price endings and category exclusions are now unofficial hints, warehouse and online prices never cross-match, and claims point to the Returns counter or Costco's online form instead of a phone line. The README's "Design decisions" and "Accuracy caveats" sections are the current source. The text below is the original review, kept for history.

Receipt Rewind compares what you paid with a later price and tells you when a Costco price adjustment is still inside the posted window. The claim itself stays with you: the membership counter, or 1-800-774-2678. The app does not log into Costco and does not send the request for you.

This note reviews the decisions already in the repo (README, schema, parser, API, and the six commits on main). There were no GitHub issues.

## What holds up

The stack is a normal small web app: React, Fastify, Drizzle, Postgres, and a separate parser package. That split is right. Parsing and eligibility are pure functions. They can be tested without a database, a browser, or an account.

Skipping a model at runtime is the correct call. A Costco receipt is already structured text: item number, description, price, tax flag, warehouse, date. The parser is a rules pass over that text. That is Context Engineering. The receipt, the price file, and the adjustment rules are the context. The code applies them. There is no generation step and no reason to invent one.

The eligibility rules match the policy the README describes:

- 30 days from purchase
- prices ending in .97 treated as clearance and not adjustable
- fuel, pharmacy, tobacco, gift cards, and special orders excluded
- .00 and .88 treated as manufacturer specials that stay eligible

Crowdsourced observations plus a manual "I saw this price" report are a lawful way to learn prices. A person typing a price they saw, or dropping in a file they saved, does not require Costco credentials.

Local account passwords are hashed with argon2. Sessions are httpOnly cookies. State-changing routes use a double-submit CSRF cookie. Login attempts are rate limited. Those are ordinary and worth keeping. Optional email and push keys are named in `.env.example` and the file `.env` is gitignored.

## What is risky

The price source type included `web_scrape`. Nothing in the running code fetched Costco, and the README said "no scraping". The type still left a door open. A later worker that opened a logged-in Costco session would be handling credentials, fighting bot checks, and very likely conflicting with Costco's terms. That path should not exist, even as a label.

The user profile had an optional Costco member id. The refund math does not need it. The claim steps already tell the person to bring their own card. Storing the number next to an email address and a copy of the receipt concentrates an account identifier this app should not have.

`raw_ocr_text` kept the whole receipt, including a membership line when one was printed. That is the same problem in another column.

The product did not actually close the loop. The background price job only reread observations already in the database. It never obtained a price. A new alert also required two independent reporters, or a verified row, and nothing marked a row verified. One person, one receipt, and no second report produced no alert. The UI looked finished. The core question ("did this get cheaper, and can I still ask?") did not run.

Local setup required Docker, Postgres, Redis, MinIO, and a presigned upload before any of that. Photo OCR also downloads Tesseract language data on first use. That is a network dependency and a poor default.

The old README stated 95% item accuracy and 98% price accuracy. This repo has fixture tests, not a measured corpus. Those percentages should not be treated as results.

The example MinIO keys are the public local defaults (`minioadmin`). They are not Costco credentials. They are also not safe to reuse on a reachable server.

Push (VAPID) and email (Resend) keys are optional. They belong only in `.env`.

## What changed

Local mode is the default. It uses embedded Postgres (PGlite), an in-memory store for login limits and password-reset tokens, and files under `data/` for photos. Docker remains available when you want the original services. It is not required to try the product.

The core check runs offline:

- a receipt you paste, or a saved email
- a CSV you write, or a public price page you saved in a browser
- the eligibility rules
- a dollar total and the claim steps

The command is `yarn refund`. The same check is what the local web app runs after you paste a receipt and import prices. Sample fixtures are fake. They are not an account export.

`web_scrape` is gone. Imports are `public_page` or `catalog_import`. The app does not request costco.com.

Signup and settings no longer save a membership number. Saving settings clears one if it was stored before. Receipt text is redacted before it is written, so a `MEMBER #` line does not stay in the database.

Eligibility is applied when a receipt is saved. Excluded lines are kept on the receipt and are not tracked. A price you import is enough to open an alert on your own items. The old two-reporter rule remains on the scheduled job, which only runs in the Docker setup, and a verified import still counts as confident there.

## Still open

Photo OCR is still optional and may download Tesseract data the first time you use a picture. The text path does not.

The 30-day window, the .97 clearance rule, and the category exclusions are a working summary of a policy Costco can change. The app is not legal advice and it does not file the adjustment.

Price history charts, barcode lookup, household sharing, and multi-warehouse comparison were on the old roadmap. They are still not built.

The Railway / Neon / R2 deployment sketch in earlier notes was not run here.
