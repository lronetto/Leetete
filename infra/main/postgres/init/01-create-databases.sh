#!/bin/bash
# Cria os bancos e roles dedicados a cada app. Rodado pelo postgres entrypoint
# uma única vez, no primeiro boot. Subsequente: ignorado (init scripts só
# rodam quando PGDATA está vazio).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE "${WEDDING_DB_USER}" WITH LOGIN PASSWORD '${WEDDING_DB_PASSWORD}';
    CREATE DATABASE "${WEDDING_DB_NAME}" OWNER "${WEDDING_DB_USER}";
    GRANT ALL PRIVILEGES ON DATABASE "${WEDDING_DB_NAME}" TO "${WEDDING_DB_USER}";

    CREATE ROLE "${GITEA_DB_USER}" WITH LOGIN PASSWORD '${GITEA_DB_PASSWORD}';
    CREATE DATABASE "${GITEA_DB_NAME}" OWNER "${GITEA_DB_USER}";
    GRANT ALL PRIVILEGES ON DATABASE "${GITEA_DB_NAME}" TO "${GITEA_DB_USER}";
EOSQL

echo "[postgres-init] roles + databases criados para wedding (${WEDDING_DB_NAME}) e gitea (${GITEA_DB_NAME})"
