#!/usr/bin/env bash
set -euo pipefail

NET="${INFRA_NETWORK:-infra-net}"

if docker network inspect "$NET" >/dev/null 2>&1; then
  echo "[network] '$NET' já existe"
else
  docker network create --driver bridge "$NET" >/dev/null
  echo "[network] '$NET' criada"
fi
