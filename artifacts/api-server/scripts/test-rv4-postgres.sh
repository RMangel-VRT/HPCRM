#!/usr/bin/env bash
# Run the forecast endpoints against a private, socket-only PostgreSQL fixture.
set -euo pipefail
cd "$(dirname "$0")/../../.."
scratch=$(mktemp -d /tmp/rv4-income.XXXXXX)
port=57485
role=rv4_test
database=rv4_income_test
pg_env=(env -i "PATH=$PATH" "HOME=$HOME" LANG=C.UTF-8)
psql_cmd=("${pg_env[@]}" psql -X -v ON_ERROR_STOP=1 -h "$scratch" -p "$port" -U "$role" -w)
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
"${psql_cmd[@]}" -d postgres -c "create database $database" >/dev/null

# Use the actual column declarations. Keep just the needed tables so we can
# exercise cross-company joins without provisioning the entire application.
"${pg_env[@]}" pnpm --filter @workspace/db exec drizzle-kit export \
  --sql --dialect postgresql --schema ./src/schema/index.ts > "$scratch/declarations.sql"
awk '
  /^CREATE TABLE "(companies|users|customers|agreements|agreement_terms|term_billing_months|estimates|estimate_versions)" / { block = 1 }
  block { print; if ($0 == ");") block = 0 }
' "$scratch/declarations.sql" | "${psql_cmd[@]}" -d "$database" --single-transaction -f - >/dev/null
"${psql_cmd[@]}" -d "$database" --single-transaction \
  -f .migration-backup/migrations/0094_revenue_qbo_income.sql \
  -f .migration-backup/migrations/0095_revenue_plans_and_targets.sql >/dev/null
cd artifacts/api-server
"${pg_env[@]}" \
  "DATABASE_URL=postgresql://$role@localhost:$port/$database?host=$scratch" \
  RUN_RV4_POSTGRES_TEST=1 "RV4_TEST_SOCKET=$scratch" \
  ./node_modules/.bin/vitest run src/routes/incomeStreams.postgres.test.ts --maxWorkers=1
