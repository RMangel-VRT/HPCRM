#!/usr/bin/env bash
# Rehearse RV2's SQL migration and run its API integration tests without a managed database.
set -euo pipefail
cd "$(dirname "$0")/../../.."
scratch=$(mktemp -d /tmp/rv2-income.XXXXXX)
port=57483
role=rv2_test
pg_env=(env -i "PATH=$PATH" "HOME=$HOME" LANG=C.UTF-8)
connection=(-h "$scratch" -p "$port" -U "$role" -w)
psql_cmd=("${pg_env[@]}" psql -X -v ON_ERROR_STOP=1 "${connection[@]}")
cleanup() {
  if [[ -f "$scratch/cluster/postmaster.pid" ]]; then
    "${pg_env[@]}" pg_ctl -D "$scratch/cluster" -m fast -w stop >/dev/null
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
"${pg_env[@]}" initdb --auth=trust --username="$role" -D "$scratch/cluster" >/dev/null
"${pg_env[@]}" pg_ctl -D "$scratch/cluster" -l "$scratch/postgres.log" \
  -o "-c listen_addresses='' -c unix_socket_directories='$scratch' -p $port" -w start >/dev/null
identity=$("${psql_cmd[@]}" -d postgres -Atc \
  "select concat_ws('|', current_database(), current_user, inet_server_addr() is null, current_setting('port'), current_setting('unix_socket_directories'))")
[[ "$identity" == "postgres|$role|t|$port|$scratch" ]] || { echo "Disposable PostgreSQL identity check failed"; exit 1; }

"${pg_env[@]}" pnpm --filter @workspace/db exec drizzle-kit export \
  --sql --dialect postgresql --schema ./src/schema/index.ts > "$scratch/declarations.sql"
# Replay just RV2 and its prerequisite tables from real declarations. Do not
# pull a managed schema or replay the historical migrations into the fixture.
extract() {
  awk -v tables="$1" '
    $0 ~ "^CREATE TABLE \"(" tables ")\" " { block = 1 }
    block { print; if ($0 == ");") block = 0; next }
    $0 ~ "^ALTER TABLE \"(" tables ")\" " || $0 ~ "^CREATE INDEX .* ON \"(" tables ")\" " { print }
  ' "$scratch/declarations.sql"
}
prerequisites='companies|users|qbo_connections'
mirror='revenue_income_accounts|revenue_qbo_income_months|revenue_qbo_income_years'
for database in rv2_income_test rv2_declarations; do
  "${psql_cmd[@]}" -d postgres -c "create database $database" >/dev/null
  extract "$prerequisites" | "${psql_cmd[@]}" -d "$database" --single-transaction -f - >/dev/null
done
extract "$mirror" | "${psql_cmd[@]}" -d rv2_declarations --single-transaction -f - >/dev/null
migration=.migration-backup/migrations/0094_revenue_qbo_income.sql
dump_mirror() {
  "${pg_env[@]}" pg_dump "${connection[@]}" --schema-only --no-owner --no-privileges --table='revenue_*' "$1" |
    sed -E '/^\\(un)?restrict /d'
}
"${psql_cmd[@]}" -d rv2_income_test --single-transaction -f "$migration" >/dev/null
dump_mirror rv2_income_test > "$scratch/first.sql"
"${psql_cmd[@]}" -d rv2_income_test --single-transaction -f "$migration" >/dev/null
dump_mirror rv2_income_test > "$scratch/second.sql"
dump_mirror rv2_declarations > "$scratch/declared.sql"
diff -u "$scratch/first.sql" "$scratch/second.sql"
diff -u "$scratch/declared.sql" "$scratch/second.sql"
echo "RV2 migration is idempotent and matches the declaration catalog."

cd artifacts/api-server
"${pg_env[@]}" \
  "DATABASE_URL=postgresql://$role@localhost:$port/rv2_income_test?host=$scratch" \
  RUN_RV2_POSTGRES_TEST=1 "RV2_TEST_SOCKET=$scratch" \
  ./node_modules/.bin/vitest run src/services/qboIncome.postgres.test.ts --maxWorkers=1
