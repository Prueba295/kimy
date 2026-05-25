#!/bin/bash
set -e

echo "=== KIMY API Build Script ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install all dependencies (monorepo)
echo "--- Installing dependencies ---"
npm install --no-package-lock

# Build shared-types (types only, no build script needed)
echo "--- Linking shared-types ---"

# Build ai-engine (needs compilation to dist/)
echo "--- Building @kimy/ai-engine ---"
cd packages/ai-engine
npm run build
cd ../../

# Generate Prisma client
echo "--- Generating Prisma client ---"
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build the NestJS API
echo "--- Building @kimy/api ---"
cd apps/api
npm run build
cd ../../

echo "=== Build complete ==="
