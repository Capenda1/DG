#!/bin/sh
set -e

echo "[entrypoint] Aplicar migrações Prisma…"
npx prisma migrate deploy

echo "[entrypoint] A iniciar API Nest…"
exec node dist/main
