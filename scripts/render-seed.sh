#!/bin/bash
# ───────────────────────────────────────────────────────
# KIMY — Seed para Render (ejecutar UNA SOLA VEZ)
# ───────────────────────────────────────────────────────
# Uso:
#   1. Abrir Render Shell: Dashboard → kimy-api → Shell
#   2. Ejecutar: bash scripts/render-seed.sh
# ───────────────────────────────────────────────────────
set -e

echo "=== KIMY Database Seed ==="
echo "Seeding initial data..."
npx tsx packages/database/seed.ts
echo "Seed complete!"
echo "Users created: admin@kimy.edu / coordinador@kimy.edu / asesor1@kimy.edu / estudiante1@kimy.edu"
echo "Password for all: Kimy2026!"
