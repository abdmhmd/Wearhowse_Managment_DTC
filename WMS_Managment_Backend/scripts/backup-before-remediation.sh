#!/usr/bin/env bash
# ============================================================================
# backup-before-remediation.sh
# [PHASE 0 SAFETY NET] Full logical backup of the WMS database before any
# remediation phase mutates schema/data.
#
# Usage:
#   scripts/backup-before-remediation.sh            # uses backend/.env DATABASE_URL
#   DATABASE_URL="postgresql://..." scripts/backup-before-remediation.sh
#
# Output: backend/backups/pre-remediation_YYYYMMDD_HHMMSS.sql
# Restore example:
#   psql "$DATABASE_URL" -f backend/backups/pre-remediation_<stamp>.sql
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

URL="${DATABASE_URL:-}"
if [ -z "$URL" ] && [ -f "$ENV_FILE" ]; then
  URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
fi
if [ -z "$URL" ]; then
  echo "Error: DATABASE_URL not set and no backend/.env found." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/pre-remediation_${STAMP}.sql"

echo "Dumping database to $OUT"
pg_dump "$URL" --no-owner --no-privileges --file="$OUT"
echo "Backup OK: $OUT"