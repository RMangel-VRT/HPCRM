# Hardscape catalog — operations and verification

## Scope and references

Implemented the Oct 26 REV 2 hardscape slice from
`attached_assets/Pasted--Replit-Prompt-Estimate-Builder-Slice-2-1-Hardscape-Cat_1793056607696.txt`.
The referenced `estimate-builder-phase-2-mockup.html`,
`estimate-builder-design-spec.md`, and Oct 26 addendum are unavailable in this
checkout. The existing CRM components and explicit REV 2 requirements were used
instead; no additional Phase 2 functionality or goods-list data was invented.

The catalog lives at `/dashboard/estimates/catalogs/hardscape`. Only active-company
admin/office users may access it. The shared Estimates rail preserves the three
board links, adds Hardscape Catalog and the existing Plant Library destination,
and reserves an empty, hidden Settings section. The Plant Library and board
content/behavior remain in their existing locations.

## API

All six endpoints require authentication, an active company, and an admin/office
role. Browser requests also send `X-Company-Id`: a stale-company request returns
409 before accessing the catalog. This is a race guard, **not** a substitute for
server-derived active-company authorization.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/hardscape-catalog` | `{items, categories}`; `search`, `category`, `includeInactive=true` query parameters |
| POST | `/api/hardscape-catalog` | Editable fields; creates with server company and fixed umbrella |
| PATCH | `/api/hardscape-catalog/:id` | Only provided editable keys; explicit null clears nullable values |
| DELETE | `/api/hardscape-catalog/:id` | Sets `isActive=false`; retains the row |
| POST | `/api/hardscape-catalog/import-csv` | Multipart `file`, `text/csv`, `text/plain`, or JSON `{csv}`; `{inserted, updated, skipped:[{line,reason}]}` |
| GET | `/api/hardscape-catalog/export-csv` | All active/inactive rows; dated attachment |

Editable fields: `sku`, `category`, `name`, `description`, `unit`,
`wholesaleCostCents`, `retailPriceCents`, `isActive`. Unknown/server-owned fields
are rejected. Duplicate company/SKU writes return 409; out-of-company IDs return
404. Pricing responses use private/no-store caching.

All data/category queries are company-scoped. Categories are distinct across
that company's active and inactive rows, with `general` always included.
List/export order is category, name, then ID.

## CSV rules

Exactly these eight unique headers are required (order may vary on import;
header whitespace/case and an initial BOM are normalized):

```csv
sku,category,name,description,unit,wholesale_cost,retail_price,active
```

- Export always uses the header order above, CRLF record separators, and
  RFC-style quoting of commas, quotes, embedded newlines and surrounding
  whitespace. Embedded quotes are doubled.
- Download filename: `hardscape-catalog-YYYY-MM-DD.csv`, dated in the company's
  Colorado timezone.
- SKU/name/category/unit are trimmed. Blank SKU becomes null; SKU matching and
  company uniqueness are **case-sensitive**. Category/name/unit must be nonempty.
  Description contents, including quoted whitespace and newlines, are preserved;
  exactly empty description becomes null in both CRUD and CSV.
- Blank prices are null, never zero. Dollar amounts allow an optional leading
  `$`, valid thousands grouping, and zero to two fractional digits (one or two
  when a decimal point is supplied). Surrounding whitespace is accepted.
  Negative/signed/exponent amounts, malformed grouping, trailing decimal points
  and more than two decimal places are rejected, not rounded.
  Maximum supported value is `21474836.47` dollars (PostgreSQL integer cents).
  Export uses plain dollar amounts with two decimals or an empty nullable cell.
- Active accepts `true/false`, `yes/no`, `1/0`, case-insensitively after trimming.
  Blank or other active values are invalid.
- Blank records are ignored. Skipped line numbers are physical file line
  numbers, including lines within quoted multiline records. Malformed record
  quoting is reported; an unterminated final quoted record is re-synchronized
  at physical lines so later valid rows are still attempted.
- Import upserts within the active company by SKU when present; otherwise by
  case-insensitive name. Names are not unique, so name matches prefer an
  identical editable record, then a SKU-less record, then the first ID. This
  preserves export/reimport for duplicate names without changing the eight-column
  format or adding unrequested name uniqueness.
- Each import row has its own transaction. Imports serialize matching rows
  within a company; a failed row never rolls back valid rows or stops the file.
  Unchanged matches count as updates **without** rewriting the record or its
  `updatedAt`.
- The file-picker workflow sends multipart bytes through the existing
  `apiRequest` layer. Maximum upload size is 5 MB, checked client/server.
  The existing JSON parser's smaller limit still applies to the optional JSON
  text-body form; use multipart or text/csv for larger files.

## Schema and release requirements

`0050_hardscape_catalog.sql` was free when checked and now contains the guarded
table/index migration. It includes the existing `pg_trgm` prerequisite and checks
for nonnegative prices and the fixed `landscape_materials` umbrella. Drizzle also
declares those checks, so schema promotion retains them. No startup DDL was added.

The development migration was applied with
`pnpm --filter @workspace/scripts run migrate`. The existing post-merge setup
already runs strict numbered migrations. Production schema changes remain under
the project's normal schema-promotion process; no production database was changed
by this task. The target database must already have `pg_trgm` installed, as
required by `replit.md` (the existing customer trigram index also depends on it).

Registration differs from the attachment's stale path: the feature module is
imported/registered in `routes/routes.ts`, alongside the existing board and
Contract Center registrations. No catalog handlers were added there.

The frontend mirror uses an explicit real Zod object and interface rather than
the non-inferencing frontend Drizzle stub, avoiding lossy form schemas.
`apiRequest` gained backward-compatible optional request headers/cancellation and
multipart support; existing three-argument JSON calls retain their behavior.

## Automated checks (Oct 26, 2026)

- Library declaration refresh (`pnpm run typecheck:libs`): **passed**.
- Numbered development migration: **passed**, one new migration applied.
- Schema drift and required-extension checks: **passed**.
- Focused backend catalog/CSV/PostgreSQL, existing QBO/customer importer and
  Estimates board tests: **passed** (the final full suite also includes these).
- New frontend catalog plus existing board rendered tests: **30 passed**.
  Existing SectionRail tests also pass in the full frontend suite.
- Full API suite: **1,534 passed, 31 skipped, 8 failed**.
- Full CRM suite: **435 passed, 8 failed**.
- Root typecheck: **failed**, not claimed as passing. It refreshed library
  declarations first, then reported 735 existing API diagnostics. The root command
  stops at the failed package. A separate CRM typecheck reports 221 existing
  errors (including old effect return paths and frontend stub inference), matching
  the baseline exactly with no added/removed diagnostics.

The unchanged starting commit was checked in a separate temporary worktree:
the same eight API test failures, the same eight CRM failures, and all 735 root
typecheck diagnostics reproduce. Normalizing workspace paths and shifted line
numbers shows **no added or removed root diagnostics**.

Existing failed API tests:

- `src/lib/plantEnrichment.test.ts`: final partial sync-run status assertion.
- `src/routes/mailboxAccounts.oauthReconnect.test.ts`: six failures caused by
  the existing mocked Drizzle SQL/index setup (the baseline fails at the existing
  customer trigram index, before any hardscape table exists).
- `src/shared/taskWebClient.test.ts`: stale navigation/source assertion.

Existing failed CRM tests:

- `src/components/CrewAssignmentBoard.test.ts`: two selection assertions.
- `src/hooks/useTabParam.test.ts`: five tests need a DOM test environment.
- `src/components/contracts/rateCardUtils.test.ts`: stale expected default count.

Detailed command output is retained locally in the ignored
`generated-artifacts/hardscape-checks/` directory, including baseline comparisons.
These pre-existing failures were not changed as part of the catalog slice.

## Browser verification

One authenticated browser pass completed successfully using an isolated fixture
company and admin/office/field users:

- Add a material with a new free-entry category and `$1,234.50` cost, leave retail
  price blank; edit description without changing other fields; deactivate, show
  inactive, reactivate; search name/SKU and filter category.
- Import quoted-comma names and an update alongside a negative-price row:
  **2 inserted, 1 updated, 1 skipped**, with line 4 and the reason shown.
  A later valid row still persisted.
- Export verified the dated filename, exact eight headers, and plain dollars;
  reimport of that exact file gave **0 inserted, 3 updated, 0 skipped**.
- Board All/Requests/RFP links and the unchanged Plant Library destination work.
  Horizontal rail/table navigation remains usable at 390×844.
- Office users can use the catalog; field users see Access Denied and all six
  API paths return 403. Signed-out users see login/API 401. A mismatched expected
  company returns 409 without data.

The tester removed all fixture catalog rows, memberships, users and company, and
confirmed none remained. No existing users or materials were modified.

An unrelated, non-blocking existing mobile sidebar behavior was observed: its
drawer stayed open after selecting Estimates and did not close on Escape; a
subsequent catalog-link navigation closed it. No sidebar behavior was changed by
this slice.
