# Estimate Builder Slice 4.10 — Services and Equipment & Fees CSV

## Scope and predecessor

Implemented in the existing API Server and High Plains CRM. The complete
attached 4.10 brief and assigned plan govern this implementation.
The integrated 4.9 code and `unified-estimate-units.md` handoff were inspected
before dependent edits. This slice imports the **existing**, driver-free
`normalizeEstimateUnit` from `lib/db/src/estimateUnits.ts`; it adds no unit list,
alias, formatter, picker change, relabel, CHECK, migration or boot step.

The existing `parseCsv`, `writeCsv`, `dollarsToCents` and `centsToDollars`
utilities are reused. There is no independent tokenizer or floating-point
money conversion. Existing company/lower(label) and company/lower(name) unique
indexes remain authoritative. No new tables or schema changes were needed.

No publication, production query/write, QuickBooks operation or upload of
Randy's catalog was performed. Browser uploads use synthetic rows in a
disposable development company, not a business company.

## HTTP contracts

Both endpoints are under `/api/quick-items`, before the existing ID routes:

| Request | Required query | Response |
|---|---|---|
| `POST /api/quick-items/import-csv` | `scope=services` or `scope=equipment-fees` | JSON import result |
| `GET /api/quick-items/export-csv` | same | UTF-8 `text/csv; charset=utf-8` attachment |

`X-Company-Id` is **required** for both CSV endpoints. It is an expectation,
not an authorization grant; data always uses the authenticated session company.
The existing `estimateAccess` guard runs before upload parsing and requires
admin/office access. It applies `Cache-Control: no-store`, including denied
requests. No global catalog permissions were changed.

Import accepts:

- `multipart/form-data`, one file named **`file`**, maximum **5 MiB**;
- raw `text/csv` or `text/plain`, maximum **5 MiB**;
- JSON `{ "csv": "<CSV text>" }`, subject to the application's existing
  global JSON-body limit (Express default 100 KiB), with an additional 5 MiB
  CSV-byte guard. The UI uses multipart, not JSON.

The multipart handler bounds files, fields and field size. Oversize/bad
multipart requests return a clear JSON 400. The global JSON parser can reject
large JSON before reaching this router; it was deliberately not widened for
unrelated application routes.

Import success:

```json
{
  "inserted": 2,
  "updated": 1,
  "categoriesCreated": ["New service category"],
  "skipped": [
    { "line": 5, "reason": "Unknown unit: pallet" }
  ]
}
```

`categoriesCreated` is an explicit list of actual committed category names,
not a numeric count. `line` is the starting **physical** CSV line, including
the header and any embedded quoted line breaks.

**Counting convention:** every successfully matched same-kind row counts as
`updated`, including an unchanged row and a repeated name within the same file.
An unchanged row does not execute UPDATE or change its timestamp. This matches
Hardscape's counters; `updated` does not imply a commercial value changed.
Every successful new name counts as `inserted`. Parser, collision, inactive
association and individual persistence failures count only as skipped.

Header/body errors fail the whole request before writes. Data-row and
individual database failures return 200 with diagnostics; later rows proceed.
Database details are never included in save-failure reasons. File-level
statuses are 400 (bad body/header/scope/company expectation/upload), 401
(signed out), 403 (denied/no active company), 409 (company expectation changed),
422 (export cannot roundtrip an unknown unit/missing category/unknown umbrella),
or the existing safe 500 for unexpected setup failures.

Export filenames are:

```text
services-catalog-YYYY-MM-DD.csv
equipment-fees-catalog-YYYY-MM-DD.csv
```

The date follows the existing company-day helper. Export has no search,
category, active or kind-filter inputs: it always includes **all** company
items in the selected catalog, including inactive items and services associated
with inactive categories. Scope filtering is enforced on the server, both
during parsing and before export conversion. Unknown units in the *other*
catalog cannot prevent this catalog's export.

## CSV conversion

The exact seven-column set is:

```csv
kind,category,name,unit,price,posts_to,active
```

As in Hardscape, headers may be reordered and matched after trimming and case
normalization; duplicates, missing/extra columns, empty files and malformed
headers are rejected. Export always writes the order above, CRLF records,
necessary CSV escaping, and no BOM. Import accepts a leading BOM and uses
the shared parser's quoting/recovery behavior.

- `kind`: trimmed/case-normalized `service`, `equipment` or `fee`. Services
  accepts only service; Equipment & Fees accepts only equipment and fee.
- `category`: required for services, trimmed and at most 100 characters;
  must be blank for equipment/fees. Matching is company-scoped SQL `lower()`,
  exactly like the unique index.
- `name`: trimmed, nonempty, at most 200 characters. Matching uses the existing
  company-wide case-insensitive label identity, across all three kinds.
- `unit`: canonical or legacy alias through 4.9's single normalizer. Unknowns
  are skipped with a row reason. Export normalizes mapped units and **fails
  visibly with 422** for an unmapped stored unit. No unknown mapping is guessed
  and no partial/misleading roundtrip file is downloaded.
- `price`: exact nonnegative dollars, at most two decimals and PostgreSQL
  integer cents range. `$` and correctly grouped thousands use the existing
  converter. Blank or case-insensitive `Variable` explicitly writes null;
  numeric `0` writes zero. Export uses `Variable` for null and exact two-decimal
  dollars otherwise, including `0.00`.
- `posts_to`: a trimmed, case-insensitive **existing** umbrella key or canonical
  display name from `UMBRELLA_DEFAULTS`. Export writes canonical display names,
  independent of UI locale. No umbrella creation or QBO API is involved.
- `active`: trimmed/case-insensitive true/false, yes/no, or 1/0. Explicit values
  are required; export uses true/false.

## Per-row database behavior

`services/quickItemCsv.ts` owns the shared transactional upsert, not the
ordinary CRUD route or a second catalog implementation.

1. Each valid row starts its own transaction and company-scoped transaction
   advisory lock, serializing imports in that company.
2. Find and lock a company/lower(label) match. A different kind is rejected
   before category resolution; its row is never modified or converted.
3. For services, create a missing category with `ON CONFLICT DO NOTHING`,
   using this row's normalized unit and umbrella defaults. Then resolve the
   company/case-insensitive category under SHARE lock.
4. Existing category spelling, defaults, active state, order, ID and timestamps
   are never overwritten. Inactive categories are allowed **only** when the
   matched existing service already has that exact association. New/reassigned
   services must use an active category; import never reactivates categories.
5. Insert a new item, or update only unit/rate/umbrella/category/active on a
   same-kind match. Preserve ID, stored name spelling, sort order, creation time
   and all unrelated fields. General Services umbrella overrides are valid;
   the stricter Custom-save category-default umbrella rule is not imposed.
6. Return a created-category name only after commit. Any failure rolls back
   that row, including its newly created category.

The unique constraints also protect against ordinary non-import writers.
If an ordinary create wins between the import's read and insertion, retry
the **entire transaction** up to two times. The retry rechecks kind and category
eligibility rather than blindly updating on conflict. Failed attempts cannot
leave orphan categories. Unrecoverable row failures do not poison later rows.
Concurrent category deactivation is observed through row-lock waits and
eligibility rechecking.

Only catalog defaults are written. No estimate-line/version/snapshot table is
updated. Imported null quick-item rates retain the existing snapshot behavior:
the captured zero-price `quick_list` line reports `needsPrice`; no category
rate or other commercial default is substituted. This slice does not change
the existing builder's zero-price semantics.

## UI and asynchronous scope

`QuickItemCsvControls` is reused by both existing pages without rewriting their
catalog lists or dialogs. It follows Hardscape's outline buttons, hidden file
input, 5 MiB check, independent pending states, result toast, dismissible result
panel, expandable skipped-line list, and upload-input reset. Created category
names appear in their own list. Shared fetch/company-header/filename/error
helpers and existing Hardscape translations are reused.

New hints, category labels and CSV diagnostic prose are translated in EN/ES.
CSV column names, kind values, umbrella display names and `Variable` remain the
canonical interchange format, not localized commercial data.

The existing pages remount by user/company/role scope. On unmount, late imports
cannot show a toast/result and exports abort. Downloads check both scope and
abort after reading the blob, honor Content-Disposition, remove their anchor
and revoke the object URL. Failed exports never generate a download.

Successful imports invalidate only the initiating company's quick-item lists,
category counts/lists, `estimate-picker` queries (including section search)
and `estimate-catalog-matches`. An import that committed after navigation still
refreshes that originating company's caches, without displaying old-scope UI.

## Verification

Local evidence is under ignored `generated-artifacts/quick-item-csv/`.
New database tests use a disposable PostgreSQL database, actual historical
setup/services/unit migrations, and the production upsert/snapshot functions.
They do not run broad seeders or migrations against shared company data.

| Check | Result |
|---|---|
| Quick-item conversion/API plus shared CSV contracts | 93 passed |
| Isolated PostgreSQL row-upsert/snapshot suite | 12 passed |
| New rendered CSV suite plus existing Services suite | 31 passed |
| Existing setup routes and canonical Hardscape HTTP suite | 35 passed |
| Existing old Hardscape API suite | 6 passed, 13 known baseline failures |
| Existing old Hardscape rendered suite | 12 passed, 11 known baseline failures |
| Library typecheck, before edits | Passed; no library source changed |
| API typecheck baseline and delivery | 695 existing diagnostics, no new file/error-code counts |
| CRM typecheck baseline and delivery | 212 existing diagnostics, no new file/error-code counts |
| Managed API/CRM restart, proxied health and Services Vite transform | Served successfully, HTTP 200 |
| Authenticated real browser, Services and Equipment & Fees in EN/ES | Passed; actual uploads, downloads and exported-file reimports |

The old Hardscape failures match the predecessor's recorded unchanged-source
baselines. API fixtures supply `activeRole` but omit the gate's `accessRole`,
producing 403. The old rendered fixtures also omit access information and have
obsolete rail assumptions. Neither Hardscape application authorization nor
unrelated tests were changed to hide these failures. Its separate canonical
HTTP suite and shared CSV regressions pass. Whole-project typechecks and those
old suites are **not green**.

New coverage includes all kinds and scopes, exact/reordered/BOM headers,
physical lines and malformed quoting recovery, all predecessor aliases,
unknown units, invalid kinds/categories/umbrellas/active/price/name values,
null/zero/max cents, recoverable save failures, unchanged and repeated-name
reimports, category defaults/case matching, cross-kind collisions, inactive
association retention and rejection, tenant/role/expectation guards, upload
bounds, scoped full exports, identity/timestamp preservation, snapshot
preservation, simultaneous imports, and ordinary-create/category-update races.
Concurrency tests observe actual PostgreSQL blocking rather than assuming a
sleep means the writer reached its lock.

Rendered tests exercise both actual pages in both languages, real multipart
request bodies, download cleanup, server failures, pending/retry states,
created names, skipped diagnostics, scoped list/picker/search invalidation,
and company/user/role switches during pending imports and exports.

The real browser signed into an isolated temporary development company and
confirmed its company identity before writing. Services imported two valid rows
and skipped an unknown unit plus a wrong-scope fee; Equipment & Fees imported
equipment/fee rows and skipped a service. The browser inspected actual exports
for exact headers, canonical units, null/zero prices, umbrella display names
and inactive state, then reimported those downloaded files. Each reimport
reported zero inserted, two updated, zero skipped and no new category/duplicate.
It also uploaded additional synthetic rows and an unknown-unit row in Spanish
on both pages, verified translated completion feedback/created-category and
skipped-line labels/reasons, and downloaded both Spanish-page exports.
Four EN/ES page screenshots were returned; no feature-impacting console errors
were observed. Downloads are retained only in ignored local evidence, not Git.
The temporary browser company, user, catalog items and categories were removed
after verification.

The standalone unsigned-in screenshot tool timed out while taking its image;
it is not counted as signed-in evidence. The successful authenticated browser
screenshots and actual file operations supply the requested page confirmation.
Startup still emits unrelated pre-existing QuickBooks fixture-token warnings;
the API health request and the tested catalog requests served successfully.

Reproducible focused checks:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/quickItemCsv.test.ts src/routes/quickItemCsv.test.ts \
  src/services/quickItemCsv.integration.test.ts src/lib/csv.test.ts \
  src/routes/estimateSetup.test.ts src/routes/catalogUnits.test.ts \
  --maxWorkers=1 --no-file-parallelism
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/QuickItemCsv.rendered.test.tsx src/pages/ServicesCatalog.rendered.test.tsx
```
