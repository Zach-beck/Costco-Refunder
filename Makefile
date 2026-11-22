.PHONY: setup dev local stop test refund clean

# One-command full setup
setup:
	./scripts/setup.sh

# Start everything (infrastructure + app). Needs Docker.
dev:
	docker compose up -d
	yarn dev

# Local app: embedded database, no Docker, no Costco login
local:
	yarn dev:local

# Compare a receipt file to a price file
refund:
	yarn refund --receipt fixtures/sample-receipt.txt --prices fixtures/public-prices.csv --as-of 2026-11-15

# Stop infrastructure
stop:
	docker compose down

# Run all tests
test:
	yarn test

# TypeScript type checking
typecheck:
	yarn typecheck

# Reset database (drop and recreate)
db-reset:
	docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS receipt_rewind;"
	docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE receipt_rewind;"
	yarn db:migrate
	yarn db:seed

# Clean build artifacts
clean:
	yarn clean
	rm -rf node_modules packages/*/node_modules
