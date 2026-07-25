#!/bin/bash
set -e

echo "=== Costco Refunder — Setup ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v yarn >/dev/null 2>&1 || { echo "ERROR: Yarn is required. Run: npm install -g yarn"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required. Install from https://docker.com"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ is required. Current: $(node -v)"
  exit 1
fi

echo "[1/6] Installing dependencies..."
yarn install

echo ""
echo "[2/6] Starting infrastructure (PostgreSQL, Redis, MinIO)..."
docker compose up -d

echo ""
echo "[3/6] Waiting for services to be healthy..."
sleep 3

# Wait for PostgreSQL
for i in {1..20}; do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  echo "  Waiting for PostgreSQL..."
  sleep 2
done

echo ""
echo "[4/6] Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
else
  echo "  .env already exists, skipping"
fi

echo ""
echo "[5/6] Running database migrations..."
yarn db:migrate

echo ""
echo "[6/6] Seeding warehouse data..."
yarn db:seed

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start development:"
echo "  yarn dev"
echo ""
echo "  Web:  http://localhost:5173"
echo "  API:  http://localhost:3001"
echo "  MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo "To stop infrastructure:"
echo "  docker compose down"
echo ""
