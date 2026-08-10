#!/usr/bin/env bash
# Instala pastas, permissões e cron de backup diário — Dádiva Go
# Uso (no VPS, como root):
#   cd /opt/dadiva && git pull && bash deploy/install-backups.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="${ROOT}/deploy"
OUT_DIR="${DADIVA_BACKUP_DIR:-/var/backups/dadiva}"
LOG_FILE="${DADIVA_BACKUP_LOG:-/var/log/dadiva-backup.log}"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
chmod +x "$DEPLOY"/backup-postgres.sh "$DEPLOY"/backup-uploads.sh
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

CRON_PG="15 2 * * * ${DEPLOY}/backup-postgres.sh >> ${LOG_FILE} 2>&1"
CRON_UP="0 3 * * * ${DEPLOY}/backup-uploads.sh >> ${LOG_FILE} 2>&1"

TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'backup-postgres.sh' | grep -v 'backup-uploads.sh' >"$TMP" || true
printf '%s\n' "$CRON_PG" "$CRON_UP" >>"$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "[install-backups] Pasta: $OUT_DIR"
echo "[install-backups] Log:   $LOG_FILE"
echo "[install-backups] Cron instalado:"
crontab -l | grep backup-
echo
echo "[install-backups] A correr teste imediato (postgres)…"
"$DEPLOY"/backup-postgres.sh
echo "[install-backups] A correr teste imediato (uploads)…"
"$DEPLOY"/backup-uploads.sh
echo
echo "[install-backups] Ficheiros:"
ls -lh "$OUT_DIR"
echo "[install-backups] OK"
