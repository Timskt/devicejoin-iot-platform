#!/bin/bash
# PostgreSQL restore script for DeviceJoin IoT Platform
# Usage: ./scripts/restore.sh <backup_file.sql.gz>

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
DB_USER="${DB_USER:-devicejoin}"
DB_NAME="${DB_NAME:-devicejoin}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Restoring from $BACKUP_FILE"

export PGPASSWORD="${DB_PASSWORD:-}"

gunzip -c "$BACKUP_FILE" | psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME"

if [ $? -eq 0 ]; then
  echo "[$(date)] Restore successful"
else
  echo "[$(date)] Restore FAILED!"
  exit 1
fi

unset PGPASSWORD
