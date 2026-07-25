.PHONY: setup dev stop test clean

# One-command full setup
setup:
	./scripts/setup.sh

# Start everything (infrastructure + app)
dev:
	docker compose up -d
	yarn dev

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
	docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS costco_refunder;"
	docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE costco_refunder;"
	yarn db:migrate
	yarn db:seed

# Clean build artifacts
clean:
	yarn clean
	rm -rf node_modules packages/*/node_modules
