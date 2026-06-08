#!/bin/sh
set -e

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[$TS] media-backup: start"

mc mirror --overwrite --remove --quiet "local/$S3_BUCKET" "/backups/$S3_BUCKET" \
  || echo "[$TS] media-backup: local mirror reported errors"

if [ -n "$BACKUP_REMOTE_ENDPOINT" ] && [ -n "$BACKUP_REMOTE_BUCKET" ]; then
  mc mirror --overwrite --quiet "local/$S3_BUCKET" "remote/$BACKUP_REMOTE_BUCKET/$S3_BUCKET" \
    || echo "[$TS] media-backup: remote mirror reported errors"
fi

LOCAL_SIZE="$(du -sh "/backups/$S3_BUCKET" 2>/dev/null | awk '{print $1}')"
echo "[$TS] media-backup: done (local: ${LOCAL_SIZE:-?})"
