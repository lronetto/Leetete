#!/bin/sh
set -e

echo "[backup] installing mc + ca-certs + tzdata"
apk add --no-cache --quiet curl ca-certificates tzdata >/dev/null
curl -sSLo /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x /usr/local/bin/mc

if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
  cp "/usr/share/zoneinfo/$TZ" /etc/localtime
  echo "$TZ" > /etc/timezone
fi

echo "[backup] configuring mc aliases"
mc alias set --quiet local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

if [ -n "$BACKUP_REMOTE_ENDPOINT" ] && [ -n "$BACKUP_REMOTE_ACCESS_KEY" ]; then
  echo "[backup] remote target configured: $BACKUP_REMOTE_ENDPOINT"
  mc alias set --quiet remote "$BACKUP_REMOTE_ENDPOINT" "$BACKUP_REMOTE_ACCESS_KEY" "$BACKUP_REMOTE_SECRET_KEY"
else
  echo "[backup] no remote target — local-only mirror"
fi

mkdir -p /backups /var/log

SCHEDULE="${BACKUP_SCHEDULE_MEDIA:-0 3 * * *}"
echo "[backup] schedule: $SCHEDULE"
mkdir -p /etc/crontabs
echo "$SCHEDULE /scripts/media-backup-run.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
echo "" >> /etc/crontabs/root

echo "[backup] running initial mirror"
/scripts/media-backup-run.sh || echo "[backup] initial mirror failed — will retry on schedule"

echo "[backup] starting crond"
exec crond -f -l 6
