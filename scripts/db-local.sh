#!/usr/bin/env bash
# Local Postgres for the integration suite. Postgres 16 + pgvector ship
# in this sandbox image; they were installed all along and never started.
set -e
PGDATA=/var/lib/postgresql/etyme-data
BIN=/usr/lib/postgresql/16/bin
if ! su postgres -s /bin/bash -c "$BIN/pg_ctl -D '$PGDATA' status" >/dev/null 2>&1; then
  [ -d "$PGDATA" ] || su postgres -s /bin/bash -c "$BIN/initdb -D '$PGDATA' -U postgres --auth=trust"
  su postgres -s /bin/bash -c "$BIN/pg_ctl -D '$PGDATA' -l '$PGDATA/log' -o '-p 5432 -k /tmp' start"
fi
psql -h localhost -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='etyme'" | grep -q 1 \
  || psql -h localhost -U postgres -c "CREATE DATABASE etyme;"
echo "postgres ready on localhost:5432"
