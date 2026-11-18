#!/usr/bin/env bash
# Back up VaaniLaunch's data: a consistent copy of the SQLite database (taken while the app keeps
# serving) plus the uploaded photos and the signing secret. Run on the VPS from the project folder:
#   ./scripts/backup.sh            -> backups/vaanilaunch-<timestamp>.tar.gz
# Restore: stop the app, unpack the archive into the app_data volume, start the app.
set -euo pipefail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
docker compose exec -T app python -c "from app import db; db.backup('/data/backup.db')"
docker compose exec -T app tar -C /data -czf - backup.db uploads secret.key > "backups/vaanilaunch-${stamp}.tar.gz"
docker compose exec -T app rm -f /data/backup.db
echo "backups/vaanilaunch-${stamp}.tar.gz"
