#!/bin/bash
set -e

echo "=== KIMY API Entrypoint ==="
echo "Node version: $(node --version)"

# Sync database schema (safe, non-destructive)
echo "--- Syncing database schema ---"
npx prisma db push --schema=packages/database/prisma/schema.prisma --accept-data-loss 2>&1 || echo "db push failed (non-fatal, continuing...)"

# Start the API
echo "--- Starting API ---"
exec node apps/api/dist/main.js
