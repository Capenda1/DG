#!/usr/bin/env bash
# Backup PostgreSQL (Docker) — Dádiva Go
# Uso (VPS):
#   chmod +x deploy/backup-postgres.sh
#   ./deploy/backup-postgres.sh
# Cron diário (02:15):
#   15 2 * * * /opt/dadiva/deploy/backup-postgres.sh >> /var/log/dadiva-backup.log 2>&1

set -euo pipefail

CONTAINER="${DADIVA_PG_CONTAINER:-dadiva-postgres}"
PG_USER="${POSTGRES_USER:-dadiva}"
PG_DB="${POSTGRES_DB:-dadiva}"
OUT_DIR="${DADIVA_BACKUP_DIR:-/var/backups/dadiva}"
KEEP_DAYS="${DADIVA_BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%F_%H%M)"
OUT_FILE="${OUT_DIR}/postgres-${STAMP}.sql.gz"

mkdir -p "$OUT_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "[backup-pg] ERRO: container $CONTAINER não está a correr." >&2
  exit 1
fi

echo "[backup-pg] A dump $PG_DB → $OUT_FILE"
docker exec "$CONTAINER" pg_dump -U "$PG_USER" "$PG_DB" | gzip -c > "$OUT_FILE"
chmod 600 "$OUT_FILE"

find "$OUT_DIR" -name 'postgres-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete
echo "[backup-pg] OK ($(du -h "$OUT_FILE" | cut -f1))"
