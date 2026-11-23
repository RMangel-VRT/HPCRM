#!/usr/bin/env bash
# Compare the RV3 migration and both declarations, then test the API against
# a private socket-only PostgreSQL server. No managed database is used.
set -euo pipefail
cd "$(dirname "$0")/../../.."
scratch=$(mktemp -d /tmp/rv3-planning.XXXXXX)
port=57484
role=rv3_test
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

# The browser declaration uses a driver-free stub. Compare the table blocks
# after removing TS-only annotations, then compare the real catalog below.
extract_declarations() {
  sed -nE '/^export const revenue(Plans|Targets) = pgTable/,/^\]\);/p' "$1" |
    sed -E 's/\(t: any\)/(t)/; s/\.\$type<RevenueStream>\(\)//'
}
extract_declarations lib/db/src/schema/schema.ts > "$scratch/server.ts"
extract_declarations artifacts/highplains-crm/src/shared/schema.ts > "$scratch/browser.ts"
test -s "$scratch/server.ts"
diff -u "$scratch/server.ts" "$scratch/browser.ts"

"${pg_env[@]}" pnpm --filter @workspace/db exec drizzle-kit export \
  --sql --dialect postgresql --schema ./src/schema/index.ts > "$scratch/declarations.sql"
extract_sql() {
  awk -v tables="$1" '
    $0 ~ "^CREATE TABLE \"(" tables ")\" " { block = 1 }
    block { print; if ($0 == ");") block = 0; next }
    $0 ~ "^ALTER TABLE \"(" tables ")\" " || $0 ~ "^CREATE INDEX .* ON \"(" tables ")\" " { print }
  ' "$scratch/declarations.sql"
}
for database in rv3_planning_test rv3_declarations; do
  "${psql_cmd[@]}" -d postgres -c "create database $database" >/dev/null
  extract_sql 'companies|users' | "${psql_cmd[@]}" -d "$database" --single-transaction -f - >/dev/null
done
extract_sql 'revenue_plans|revenue_targets' | "${psql_cmd[@]}" -d rv3_declarations --single-transaction -f - >/dev/null
migration=.migration-backup/migrations/0095_revenue_plans_and_targets.sql
dump_planning() {
  "${pg_env[@]}" pg_dump "${connection[@]}" --schema-only --no-owner --no-privileges \
    --table=revenue_plans --table=revenue_targets "$1" | sed -E '/^\\(un)?restrict /d'
}
"${psql_cmd[@]}" -d rv3_planning_test --single-transaction -f "$migration" >/dev/null
dump_planning rv3_planning_test > "$scratch/first.sql"
"${psql_cmd[@]}" -d rv3_planning_test --single-transaction -f "$migration" >/dev/null
dump_planning rv3_planning_test > "$scratch/second.sql"
dump_planning rv3_declarations > "$scratch/declared.sql"
diff -u "$scratch/first.sql" "$scratch/second.sql"
diff -u "$scratch/declared.sql" "$scratch/second.sql"
echo "RV3 migration is idempotent and matches both declarations."

cd artifacts/api-server
"${pg_env[@]}" \
  "DATABASE_URL=postgresql://$role@localhost:$port/rv3_planning_test?host=$scratch" \
  RUN_RV3_POSTGRES_TEST=1 "RV3_TEST_SOCKET=$scratch" \
  ./node_modules/.bin/vitest run src/routes/revenuePlanning.postgres.test.ts --maxWorkers=1
