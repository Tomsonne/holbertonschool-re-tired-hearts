#!/bin/sh
# Exécuté une seule fois, à la création du volume PostgreSQL :
# crée la base utilisée par les tests bout en bout de l'API.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE "${POSTGRES_DB}_test" OWNER "$POSTGRES_USER";
SQL
