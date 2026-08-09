#!/usr/bin/env bash
# Backup volume Docker de uploads — Dádiva Go
# Uso:
#   chmod +x deploy/backup-uploads.sh
#   ./deploy/backup-uploads.sh
# Cron (03:00):
#   0 3 * * * /opt/dadiva/deploy/backup-uploads.sh >> /var/log/dadiva-backup.log 2>&1

set -euo pipefail

VOLUME="${DADIVA_UPLOADS_VOLUME:-dadiva_uploads}"
OUT_DIR="${DADIVA_BACKUP_DIR:-/var/backups/dadiva}"
KEEP_DAYS="${DADIVA_BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%F_%H%M)"
OUT_FILE="${OUT_DIR}/uploads-${STAMP}.tar.gz"

mkdir -p "$OUT_DIR"

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "[backup-uploads] ERRO: volume $VOLUME não existe." >&2
  exit 1
fi

echo "[backup-uploads] A arquivar $VOLUME → $OUT_FILE"
docker run --rm \
  -v "${VOLUME}:/data:ro" \
  -v "${OUT_DIR}:/backup" \
  alpine:3.20 \
  tar czf "/backup/uploads-${STAMP}.tar.gz" -C /data .

chmod 600 "$OUT_FILE"
find "$OUT_DIR" -name 'uploads-*.tar.gz' -type f -mtime +"$KEEP_DAYS" -delete
echo "[backup-uploads] OK ($(du -h "$OUT_FILE" | cut -f1))"
