#!/bin/bash
# PostgreSQL backup script for DeviceJoin IoT Platform
# Usage: ./scripts/backup.sh [backup_dir]
# Cron: 0 2 * * * /app/scripts/backup.sh /backups

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30
DB_USER="${DB_USER:-devicejoin}"
DB_NAME="${DB_NAME:-devicejoin}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/devicejoin_$TIMESTAMP.sql.gz"

echo "[$(date)] Starting backup to $BACKUP_FILE"

export PGPASSWORD="${DB_PASSWORD:-}"

pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "[$(date)] Backup successful: $(du -h "$BACKUP_FILE" | cut -f1)"
else
  echo "[$(date)] Backup FAILED!"
  exit 1
fi

# Cleanup old backups
find "$BACKUP_DIR" -name "devicejoin_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"

unset PGPASSWORD
