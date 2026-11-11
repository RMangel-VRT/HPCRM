# Estimate Builder: catalog search and custom saves

## Scope and audit

Implemented Slice 4.7 in the existing CRM and API Server, after inspecting the
integrated 4.5 version scope/PDF behavior and 4.6 categorized services implementation.
The attached written briefs and refined task plan govern this work. The named
`eb45-builder.png`, `eb47-custom-line.png`, and `eb47-custom-line-save.png` were
not supplied; no screenshot parity is claimed. No earlier slice was rebuilt.

The audit confirmed:

- `PickerBody` owned endpoint routing, response projection, selection and quantity.
  Labor is a customer-specific rate preview, filtered locally, not a material search.
- Services use the existing quick-item store, with active item **and** active
  same-company category checks. General catalog creation still permits explicit
  service umbrella overrides; custom-save specifically requires the category's
  current default.
- Quick-item labels are case-insensitively unique within a company across all
  three kinds. Hardscape names remain non-unique; only its SKU has uniqueness.
- `createLine` already runs under the company-qualified estimate lock and one
  transaction. Catalog insertion, reference snapshot, line insertion and the final
  totals/payload read now share that transaction. No global catalog-create helper
  is called from that transaction.

**No new search endpoint was necessary.** Section search reuses seven existing
endpoint contracts. Only the requested similarity-matches endpoint was added.
There are no schema changes, production writes, extension installations, startup
DDL, deployment hooks, new dependencies, PDF changes or publication.

## Shared frontend contracts

`src/lib/pickerSources.ts` is shared by the dialog and section search:

- `pickerQueryKey(type, scope, filters)` retains company/user/role/customer/query
  isolation; service category filtering remains local.
- `pickerFetch(type, filters, companyId, signal)` routes existing plant, hardscape,
  irrigation, rate preview and quick-item calls. Plants retain
  `inStockOnly=false&activeOnly=true`; material active/category/brand behavior is
  unchanged. Every request carries its initiating company and abort signal.
- `pickerRows(type, data, options)` returns rows, material categories/brands and
  service categories. Each row has a stable key, title/details/meta, optional
  warning/source badge/disabled reason and the normal reference-body fragment.
  `withFree` adds the existing free-entry row only inside typed pickers.
- `groupSearchRows(type, rows)` bounds each catalog/service-category group to five.
- `idPart(key)` injectively encodes punctuation, including underscores, for DOM
  IDs; punctuation-containing labor/plant keys cannot collide after sanitization.

Search uses 250 ms debounce and a two-character minimum. Its seven queries run
independently; a failed type retains its own retry/error group. Input changes
immediately suppress old rows and selection until the new debounced query matches.
Combobox/listbox semantics, active descendant, arrow navigation, disabled-row
rejection and Escape clearing are implemented. See all carries the query into
the correct picker. Result selection carries query and row key, waits for the
row, highlights it and focuses Quantity; selection does not insert a line.
The picker's existing explicit Add/Enter behavior remains.
Picker/search/category caches have finite freshness; match queries revalidate on
reopen. Successful catalog saves invalidate both builder projections and the
catalog management lists/category counts, not just the estimate detail.

`AddLineInitial` carries query, row key or custom-name prefill. `AddLineResult`
preserves a structured error through the new custom-save mutation path; existing
boolean mutation callers keep their contract. Builder remounts and guards isolate
scope/version navigation and removed sections.

`src/lib/customLine.ts` owns the exact custom unit list, chip-to-umbrella/save
target mappings, eligibility, match URL, reference body and conflict parsing.
Custom uses no default category and has no editable umbrella selector. Active
service-category defaults derive the umbrella. Name/unit/rate/quantity are
required. Equipment/fee/service free entries retain their earlier behavior apart
from required markers.

Checked saves request similar items after 250 ms and three characters. Errors
stay inline and retryable. Matching-item reuse keeps the entered quantity and
uses the catalog reference body, closing only on success. Duplicate errors keep
unsaved fields and use the existing item's **real kind**, never the selected
save target; inactive items or hidden service categories are not offered for reuse.
EN/ES include search, keyboard help, category/save guidance, matches and errors.

## API and atomic-save contracts

Driver-free contracts are exported from `lib/db/src/estimateContracts.ts`:
`saveToCatalogSchema`, `catalogMatchesQuerySchema`, `CatalogMatchesQuery`,
`CatalogMatchDto`, and the extended custom branch of `createEstimateLineSchema`.
Strict validation rejects `saveToCatalog` on every other line type.

`GET /api/estimates/catalog-matches` is registered ahead of `/:id`, behind
`estimateAccess` (admin/office, expected company, no-store). It validates target,
trimmed name length 3–500, and category presence **only** for services.
Plants/irrigation/labor and unknown/extra parameters return 400.

Matching returns an array of at most five
`{id,name,unit,priceCents,categoryName}` records. Price/category can be null.
SQL filters active items and company, plus active service-category membership.
The predicate is `similarity(lower(name),lower(query)) >= 0.3` **or** literal
case-insensitive containment, ordered by descending similarity, name, then ID.
Parameterized `strpos` handles `%`, `_` and backslash literally, not as wildcards.

`saveCustomCatalogItem(tx, companyId, customInput)` is called only after locked
estimate/version/section checks. It validates:

- Hardscape → `landscape_materials`; Equipment → `landscape_labor`;
  Fees → `fees_surcharges`.
- Service → active same-company category, share-locked through insertion, with
  its current default umbrella; mismatch returns 422 `UMBRELLA_MISMATCH`.
- Quick-item units come from the existing allowed list; labels retain its
  200-character limit. Invalid values return safe 422 errors. Hardscape accepts
  the custom unit without introducing a new name-uniqueness rule.

Hardscape insertion uses `general`, detail as description, null cost, entered
retail price, active state and no SKU. Quick items use the actual kind,
name as label, entered unit/rate, derived umbrella, active/default sort order and
service category only for services.

The helper returns a **typed reference request**, which goes through
`snapshotEstimateLine` using the same transaction. The inserted estimate line
uses that reference type, FK and ordinary `catalog`/`quick_list` provenance, not
a manually priced custom line. Snapshot detail remains exactly what a later
catalog pick produces.

If uniqueness fails, the whole transaction rolls back first. Only then does
`conflictingQuickItem` read the same-company label from the global connection.
409 `CATALOG_ITEM_EXISTS` preserves `existing.id/name` and adds actual
`kind/isActive/serviceCategoryIsActive` for safe typed reuse. It never reads an
aborted transaction or discloses a foreign-company item. Post-insert failures,
overflow, locked/void estimates and foreign sections leave no catalog side effect.
Unchecked one-off custom API behavior remains unchanged.

## Verification

### Baselines and tests

Evidence/log output is under ignored `/generated-artifacts/catalog-search/`,
excluded from Git and publication.

| Check | Baseline | Verified result |
|---|---|---|
| Existing API catalog/routes/setup/estimates persistence (six suites) | 117 passed, 13 failed / 130 | Same 117 passed, same 13 failed |
| Existing estimateMath | 32 existing cases | 32 passed, unchanged |
| New catalog matching/save DB integration | — | 17/17 passed |
| Existing CRM builder + slice35 + ServicesCatalog | 95/95 | 95/95 preserved |
| Existing CRM lifecycle | 31 existing cases | 31/31 passed |
| New CRM Slice 4.7 rendered tests | — | 19/19 passed |

The existing API failures are all `routes/catalog.test.ts`: its hardscape
authorization fixture receives 403 where assertions expect 409/200/201/400.
This pre-existing failure is not hidden or reported as passing. Combined API run
before the last two new tests: 164 passed, 13 unchanged failures / 177; the latest
new suite separately passes 17/17, giving 166 passed + 13 existing failures over
the 179-case union. CRM's final five-suite run passed 145/145. One old custom test was
intentionally updated from the removed default umbrella to required category
selection; it was not deleted.

Coverage includes matching threshold/low-similarity contains/tie ordering/literal
escaping/bounds/scoping/activity/invalid queries, each save target and provenance,
manual compatibility, hardscape duplicate names, category/unit/umbrella rejection,
changed category default, cross-kind and foreign-company duplicates, hidden
category conflict metadata, entered-quantity reuse, post-insert overflow rollback,
locked/void/section protection, fanout/group limits/partial failure, See all,
selection/focus/no-direct-add/Enter, keyboard/ARIA IDs, stale-query suppression,
custom prefill, exact units/chips/reasons, payloads/matches/retry/conflict and Spanish.
Additional rendered regressions verify delayed prior-company search results,
prior-company saves completing after a new dialog opens, and catalog-owner cache
invalidation after a save.

### Typecheck

Library declarations were built first, both before and after shared changes.
Both library builds pass. Independent leaf checks retain API **695** and CRM
**212** pre-existing diagnostics. File/location/error-code multisets have **zero
additions and zero removals**. Full typecheck is therefore not green; no check was
bypassed. Some existing inferred-type error message property ordering varies
between runs, so the delta compares diagnostic locations/codes, not message text.

### Extension verification

Development read-only verification returned `pg_trgm` **1.6**.
Production read-only verification was attempted but denied because this task
environment has no authenticated production-database access. Production
installation is **unverified**; schema/index declarations are not proof.

An authorized operator can run this exact read-only check in Production:

```sql
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'pg_trgm';
```

One row proves extension availability on the selected database; zero rows means
it is absent. No production installation or write was attempted.

### Browser evidence

The signed-in pass succeeded using a disposable development-only
company/admin/customer fixture; no existing user's credentials or permissions
were changed. Search returned populated Hardscape, Service, Equipment and Fee
groups without insertion. Search Aeration selection retained the query, selected
row and Quantity focus; Enter inserted exactly one service reference at quantity
2. Escape cleared/closed search. Custom footer prefilled Name with no category
selected and Add disabled.

Hardscape save showed Search Gravel as a similarity match. Reuse kept the
dialog open while pending and closed only after success, inserting the existing
hardscape FK at quantity 3 without a duplicate. A unique Equipment custom save
persisted as `equipment`/`quick_list` with a real quick-item FK and quantity 2.
After reload all three lines and the $635 total remained, still Draft.

No JavaScript page errors or failed authenticated requests were observed.
The initial signed-out `/auth` attempt returned 401 and redirected to `/login`;
fixture sign-in then succeeded. No horizontal overflow was measured at either
width; dialogs fit. All six captures were visually inspected:

| Screen | 1440×1000 screenshot | 1041×1000 screenshot |
|---|---|---|
| Populated section search | `ncp8gk` | `0e0p05` |
| Fresh category-led Custom | `juznbd` | `zco5mv` |
| Save checked with similar item | `nzlwvr` | `ozvtti` |

Additional evidence: selected Service picker `erh42h`, successful match reuse
`od5x8k`, and reloaded three-line builder `qhzgtg`. The browser supplies attached
image IDs, not supported local-file exports; no filesystem screenshot paths
are claimed. The final cache-freshness/invalidation adjustment was verified by
rendered tests after the browser run; it does not alter these captured layouts.
The disposable company, user, catalog/estimate/customer records and temporary
credential file were removed after verification.

## Changed files

- Shared contracts: `lib/db/src/estimateContracts.ts`.
- API: `src/routes/estimates.ts`, `src/services/estimates.ts`;
  new `src/services/estimateCatalogSaves.ts` and its integration test.
- CRM: `src/components/estimates/AddLineButtons.tsx`, `AddLineDialog.tsx`;
  new `SectionSearch.tsx`, `CustomLineForm.tsx`, `RequiredMark.tsx`;
  new `src/lib/pickerSources.ts`, `customLine.ts`; `src/pages/EstimateBuilder.tsx`;
  `src/i18n/locales/en.ts`, `es.ts`; updated builder rendered test and new
  `src/pages/EstimateBuilder.slice47.rendered.test.tsx`.
- This integration report. No artifact metadata or package changes.

Nothing was published.
