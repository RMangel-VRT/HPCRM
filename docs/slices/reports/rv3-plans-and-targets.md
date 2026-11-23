# RV3 handoff — yearly plans and income targets

- `GET /api/revenue/plan/:year` returns `planDefaults(year)` with `saved: false` when there is no row. A saved response includes the assumptions, goal, and row metadata with `saved: true`. The `PUT` returns the same shape. It updates only provided fields; `goalCents: null` clears the goal.
- `GET /api/revenue/targets/:year` and its `PUT` return `{ year, streams, annual, saved }`. Every planning stream has 12 months in calendar order. Missing months read as zero; explicitly saved zeroes still count as saved. The `PUT` accepts `{ streams }` with only the supplied streams and atomically upserts their 12 monthly rows.
- The routes share the RV2 Revenue access guards. Office can read. Only admin access can save, and a supplied `X-Company-Id` must match the session's active company. The year is an explicit four-digit calendar year from 2015 through 2100; no host-timezone conversion is involved.
- RV4 can reuse `loadRevenuePlan`, `loadRevenueTargets` and `saveRevenueTargets` in `artifacts/api-server/src/services/revenuePlanning.ts`. The five streams come from `@workspace/db/revenue-streams`; `other` and `exclude` are QuickBooks mapping choices only.

Run `bash artifacts/api-server/scripts/test-rv3-postgres.sh` with the PostgreSQL tools on `PATH`. It starts a private socket-only server, applies migration `0095` twice, checks the resulting catalog against the declarations, and runs the planning HTTP integration tests. It does not connect to a managed database.
