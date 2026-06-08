#!/bin/sh
# Inicializa o bucket usado pela stack wedding_photo. Roda como container
# one-shot depois que o MinIO ficou healthy.
set -e

mc alias set --quiet local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

mc mb --ignore-existing "local/$WEDDING_BUCKET"
mc anonymous set download "local/$WEDDING_BUCKET"
mc cors set "local/$WEDDING_BUCKET" /cors.json 2>/dev/null || \
  echo "[minio-init] cors set ignorado (versão antiga do mc?)"

echo "[minio-init] bucket '$WEDDING_BUCKET' pronto (anonymous download + CORS)"
