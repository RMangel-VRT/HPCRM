# CG1 audit against the current repository

Audited: 2026-11-10. **Audit only; CG1 was not implemented.**

Read `00-RULES-CG.md`, `STATUS.md`, `CG1-catalog-programs-schema.md`,
the memory index and relevant ownership, contract, scheduling, migration,
company-isolation and schema-validation notes. Compared the slice with the
server/client schemas, catalogs, campaign routes/storage, visits API contracts,
Settings navigation, ownership map and master scheduling design.

No application code, schema, contract data, slice source file or status ledger
was changed. Database queries were SELECT-only. No migrations, generation,
backfills, seeds, publication or browser tests were run.

## 1. Pre-flight

**PASS.** None of the slice's pre-flight prerequisites failed.

| Check | Evidence/result |
| --- | --- |
| Status ledger exists; no CG slice merged | `STATUS.md` lists CG1–CG5 as `not started`. |
| Latest migration is 0072 or later | Latest numbered file is `0073_customer_documents.sql`. Next unused numeric prefix at audit time is **0074**. Preserve existing duplicate-numbered migration filenames. |
| No service-program table | Development `to_regclass('public.service_programs')` returned NULL; no matching table definition was found in the repository. |
| No `campaigns.source` | Development `information_schema.columns` check returned false; neither schema copy declares it. |
| No `visits.campaign_item_id` | Development column check returned false; neither visit table definition declares it. Other tables already have columns with that name; those are not visit links. |
| Existing coverage resolver | `artifacts/api-server/src/lib/contractCoverage.ts` exports `coverageResolver`. |
| Exact Routes service set | `lib/db/src/routeContracts.ts` exports `routeService` containing exactly `mowing`, `pet_station`, `winter_visits`, `irrigation_inspection`. The proposed catalog route classification matches. |

Additional production prerequisite: a SELECT against the production database
returned **0** visits with `source_type = 'campaign_item'`. This is a point-in-time
observation, not a guarantee that remains valid until migration.

Reproducible development inspection:

```sql
SELECT
  to_regclass('public.service_programs') AS service_programs,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns'
      AND column_name = 'source'
  ) AS campaigns_source,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits'
      AND column_name = 'campaign_item_id'
  ) AS visits_campaign_item_id;
```

Production query, SELECT-only:

```sql
SELECT count(*)::int AS campaign_item_visits
FROM public.visits WHERE source_type = 'campaign_item';
```

## 2. Incorrect or outdated statements

### F1 — The catalog has 25 entries, not 24

Both `artifacts/api-server/src/shared/contractCatalog.ts` and
`artifacts/highplains-crm/src/shared/contractCatalog.ts` contain 25 entries.
The existing server `contractCatalog.test.ts` explicitly expects 25.
CG1's classification table itself also totals 25:
4 route + 8 campaign + 3 on-request + 5 event + 5 none.
Do not remove an entry to satisfy the prose count.

The facts paragraph also omits the existing `wordModule` field and describes
`optionalPriced` too broadly: it is an optional property, populated on only some
entries, not a field set on every catalog entry.

### F2 — The latest migration reference is stale

`0072_contract_payment_schedules.sql` is no longer the latest file;
`0073_customer_documents.sql` exists. The pre-flight's “or later” is correct,
but the facts paragraph is dated. Allocate a new free number, currently 0074;
do not rename historical migrations, per `migration-filename-stability.md`.

### F3 — There is already a second physical catalog copy

CG1 names only the API's catalog while requiring shared validation and a
single service registry. The CRM imports its own
`src/shared/contractCatalog.ts`; the two files are byte-identical at audit time,
but they are separate source files, not one re-export.
Adding scheduling metadata only on the API side leaves the client unaware;
independently maintaining two new campaign-service arrays worsens the existing
duplication. The implementation plan needs an explicit shared-catalog strategy,
not an assumption that the server file is already universally imported.

### F4 — “Where the Crews and Routes settings sit” does not match navigation

`components/nav/settingsNav.ts` puts Crews in **Company**, with an admin-only
rail entry. Routes is a separate `/dashboard/routes` destination in
`components/nav/navConfig.ts`, not a Settings page. Settings currently has no
Scheduling section.

`App.tsx` permits admin/office at `/dashboard/settings/crews`, but the Settings
rail/tab resolver filters that entry to admin. Following Crews literally would
not provide the required office-readable Service timing page. The slice needs
to distinguish a **new** Scheduling settings section from an existing one, and
name the intended destination/office navigation behavior.

### F5 — Campaign edit field names and existing writable surface differ

The actual endpoint is `PATCH /api/campaigns/:id`. Its request fields are
camelCase (`windowStart`, `windowEnd`), not the SQL snake_case used by the
slice's guard list. Its current explicit patch allow-list does not include
`category` or `subtype`, much less the proposed identity fields.

Do not expand manual editing accidentally while adding guards. Detect prohibited
supplied fields before an allow-list discards them; otherwise a generated shape
edit can return success while silently ignoring the request instead of the
specified 409. Clarify whether “rejects changes” means any supplied locked field
or only a different value, since existing clients can resubmit unchanged fields.

### F6 — Customer item responses do not have one uniform join shape

The hook's `i.campaign?.serviceKey` fallback really exists in
`hooks/useCustomerServices.ts`. The first registered customer-items handler in
`routes/routes.ts` calls `getCampaignItemsByCustomerId`, which returns nested
`campaign` objects. However, the same effective Express route is registered
again later with `:customerId`, and again with `:id`, using flattened projections.
The first responding handler normally shadows those later registrations.

`storage.ts` also has `getCampaignItemsByCustomer`,
`getCampaignItemsByProperty` and `getCampaignItemsGlobal`, which project
campaign data into flat fields. Updating only the nested join does not fulfill
“wherever campaign items are returned with their campaign.”
This is an existing route duplication, not permission to add another handler.
Inventory and deliberately cover existing projections without an unrelated
route cleanup.

## 3. Conflicts, missing integration rules and ownership risks

### C1 — The governing ownership map disagrees about chemical target dates

`docs/ownership/data-ownership-map.md` lists
`campaign_items.target_date` as being retired in favor of visits.
The newer CG rules explicitly preserve chemical target/backup dates and forbid
a second planned date for the same application. The master design also says
placing an item creates a visit, whereas the newer rules say round visits are
recorded only on completion.

Treat the explicit November CG decisions as the newer direction, but record the
exception in the ownership contract before implementation. Otherwise a later
slice can “finish” the older migration by recreating competing promised dates.
This audit does not change either source document.

### C2 — A service standard is a new default-count fact, not contract scope

CG1 correctly gives `service_programs` ownership of fallback timing, but its
standard row also supplies a count when the contract is silent. The rules table
says the program must never copy contract counts/months, while the new table
necessarily stores `rounds` and `month_spread`.

Clarify that these are **company defaults**, not independently editable copies
of any property's agreed scope. The ownership map has no service-program owner
row yet. Add that ownership classification when implementation is authorized.
Never write the resolved count/months into seasons, legacy service plans,
presets, campaign items or a separate standard-count settings field.

Existing `scope_presets`/`scope_preset_lines`, service-plan templates and
`customer_service_plans` are not a fallback scheduling owner. The ownership map
marks those legacy demand holders as retired/frozen or dead candidates; their
presence is not a reason to reuse their counts as demand.

### C3 — Existing item service identity can override the new canonical identity

The customer Services hook selects:
`i.servicePlanCategory ?? i.campaign?.serviceKey ?? null`.
`campaign_items.service_plan_category` already exists, and manual item creation
derives it from legacy campaign category/subtype logic in `routes.ts`.

For generated rounds, persisting a separately mutable legacy service category
creates two service identities; the hook gives the old one priority. Specify
whether generated items leave it NULL and derive identity from the campaign, or
whether it is an explicitly maintained compatibility mirror. Do not rewrite
manual history or treat a legacy category as contract entitlement.

### C4 — Generated campaign deletion remains an unguarded membership mutation

The slice blocks item POST/DELETE and shape PATCH but says nothing about
`DELETE /api/campaigns/:id`. It currently permits admin/office and calls
`storage.deleteCampaign`; the campaign-items FK cascades deletion.

Therefore “membership follows contracts” is bypassable by deleting the parent
campaign, even if direct removal is blocked. The new visit FK would block some
deletions only after linked visits exist; it protects neither unworked rounds
nor all chemical progress. Decide whether generated campaigns must be archived
instead, and define a guard/test for this path.

### C5 — Shared visit validation is not the complete visits API contract

Both schema copies expose `visitFields` and `insertVisitSchema`, as stated.
But `routes/visits.ts` has separate create/patch bodies and parses output through
`@workspace/api-zod` (`ListVisitsResponse`, `UpdateVisitResponse`, etc.).
`lib/api-spec/openapi.yaml` and `lib/api-zod/src/generated/api.ts` reserve the
`campaign_item` source but do not expose `campaignItemId`.

Changing only Drizzle and the CRM schema leaves response validators capable of
stripping the new field. Clarify whether CG1 must update the existing visit
response spec/generated types as well. Do not introduce a new API framework or
enable generic manual creation of campaign visits: CG4 owns their producer.

### C6 — The visit FK changes existing delete behavior

`visits.customer_id` is `ON DELETE SET NULL`, while
`campaign_items.customer_id` is `ON DELETE CASCADE`. A new
`visits.campaign_item_id ... ON DELETE NO ACTION` means deleting a customer whose
item has a linked visit will fail rather than retain history automatically.
Deleting a campaign or an individual referenced item is similarly restricted.

History retention is consistent with the memory rules, but existing deletion
flows need an intentional policy and a clear rejection/archive path before
campaign visits are produced. Do not “fix” this by clearing the link or
cascading away visits. No such production data exists today according to the
source-type query; this is a prospective integration problem.

### C7 — Do not broaden the shared coverage resolver globally

`coverageResolver` currently accepts **year**, not month; it filters to
`signed`, `active`, `renewed`, chooses a governing overlapping term and then
checks its included scope. It preserves own-property precedence even when that
term excludes the requested service. `loadContractCoverage` is the shared
operational loader used by Routes.

The CG rules explicitly acknowledge an extension is needed, but adding `sent`
unconditionally would change Routes' operational eligibility. Campaign-specific
status/month options must preserve existing callers' defaults. No second
resolver, service-level parent fallback, display-selector fallback or merging
of own and parent entitlements is acceptable.

This is primarily the CG2 boundary, not work to implement during CG1.

### C8 — Missing source-of-truth enforcement for generated identity

The proposed SQL enforces source membership and non-NULL identity, but not:

- first-of-month `round_month`;
- positive `round_seq`;
- `service_key` belonging to campaign-classified services;
- prohibition on extra-billable contract-generated rounds;
- company agreement between a visit, its item and its campaign.

The source-type check also permits a non-campaign visit to carry an item link.
The generic campaign create endpoint currently builds a manual campaign from
explicit fields, but updating insert schemas can accidentally make identity
writable through other callers. Name the exclusive generated-identity writer
and reject supplied ownership fields on manual paths. Decide which invariants
belong in SQL versus shared validation; do not mistake the sample SQL for a
complete ownership boundary.

### C9 — Standard-row switching needs concurrency semantics

A transaction plus the partial unique index prevents two standards from being
committed, but clearing other rows and upserting a new one does not by itself
guarantee two concurrent edits both succeed. A uniqueness conflict may abort a
request. Specify company/service serialization or an explicit retry/conflict
response; do not return an unhandled database error.

The standard editor and ordinary count row refer to the **same** record.
Rendering both must not create independently saved copies of its twelve months.
Clearing the standard should ordinarily keep its timing row with
`isStandard = false`; DELETE removes the row and is a different operation.

### C10 — Program SQL is weaker than the stated validation

`CHECK (array_length(month_spread, 1) = 12)` alone does not enforce a
one-dimensional, one-based, nonempty array of twelve non-NULL values:
PostgreSQL CHECK accepts NULL results, including the empty-array length result.
It also does not enforce nonnegative entries, monthly maximum 4, sum = rounds,
or a campaign service key.

The slice explicitly assigns those latter rules to shared Zod, so their SQL
absence is not itself a contradiction. It is a protection gap to decide
explicitly, especially if future writers bypass HTTP validation. Mirror any
chosen SQL constraints/indexes in Drizzle; a migration-only constraint is not
sufficient evidence that Publish will preserve it.

### C11 — Company and role isolation need the existing conventions

The slice's role allow-list matches the intended admin/office split, but
Contract Center authorization also uses `user.accessRole`, checks an active
company and rejects mismatched `X-Company-Id` headers. The memory note on company
switches explains why company-scoped cache keys alone cannot prevent a delayed
write from targeting the newly selected company.

New program reads/writes must use the session company, the existing
expected-company guard, company/user/role-scoped query keys and reset transient
editor state. Never accept an authoritative company ID or updater ID from the
body. Clarify the existing super-admin override rather than inferring a new
role model from the words “admin-only.”

### C12 — Existing schema and patch pitfalls remain applicable

Shared Zod should be a genuinely shared module, not two independent validators
or an import of a server/pg-dependent module into the browser. The frontend
Drizzle stub does not infer full insert validation automatically
(`frontend-drizzle-stub-strips-fields.md`).

Default-bearing `.partial()` schemas can write omitted fields
(`zod-partial-defaults-and-bundled-dynamic-imports.md`); generated-campaign
guards and allowed PATCHes must preserve provided-field semantics.
No dynamic relative server imports should be introduced as a shortcut for
sharing a catalog with bundled production code.

## 4. Open questions and underspecified behavior

These are questions, not facts disproved by the audit:

1. **What is the exact GET response shape?** Define `countsInUse` per-service
   keys, count rows, total distinct-season counts, missing-month counts and
   `noCount`, plus the program DTO's casing. “Used by” and “without stated
   months” are not interchangeable counts.
2. **What qualifies as missing months?** Tests mention NULL/zero spreads while
   the main precedence prose only says “blank.” Define an all-zero spread as
   absent or explicit zero work, consistently for statistics and later demand.
   Existing coverage treats it as no positive months. Do not mutate contracts
   to normalize this during CG1.
3. **What happens to invalid stated counts?** Contract quantity validation
   permits zero and negative integers and does not cap positive values at 24.
   It also does not require quantity to equal the sum of scope months.
   Service programs only support 1–24. Specify gap/warning behavior for zero,
   negative, oversized or inconsistent values; never reinterpret a stated zero
   as a blank count or silently repair scope.
4. **Which seasons are counted?** The slice specifies included lines and four
   statuses with an inclusive not-ended date. Define DISTINCT season counting
   where duplicate service lines exist (there is no term/service unique
   constraint), and whether mismatched term/service lines or overlapping
   superseded candidates should be shown as raw entered seasons or effective
   governing demand. Parent seasons must not be multiplied by branch count.
   Do not invent active-customer or review-flag filters.
5. **What about `up_for_renewal`?** It is a stored status in `TERM_STATUSES`, but
   neither the existing resolver nor CG's explicit four-status list includes
   it. Confirm intentional exclusion rather than adding it silently.
   Non-renewal flags must not end an otherwise eligible worked season.
6. **How are no-count seasons represented in timing usage?** A program standard
   is used when quantity is NULL, but some such seasons already have stated
   months. Production aggregates below demonstrate this. The standard's
   “used by” count must distinguish default-count usage from default-timing
   usage; no standard still means a count gap under the written precedence.
7. **How can an admin clear or create a standard?** Define unsaved count
   selection, validation before persistence, choosing a count absent from both
   saved rows and counts-in-use, clearing the standard without deleting timing,
   deleting a used or standard row via API, and losing unsaved edits.
   UI-only Delete restrictions do not define server behavior.
8. **How should the standard/count UI avoid duplicate editors?** Both refer to
   one `(company, service, rounds)` row. Save must check integer bounds and
   maximum 4 per month as well as the running sum, not enable on sum alone.
9. **Where is the new Settings destination?** Confirm the path and new section
   versus placement in Services. Office needs a visible rail entry and fully
   read-only controls, not just a protected route. The exact header/path choice
   is not established by current code.
10. **What is a shape edit?** Decide unchanged locked-field resubmissions,
    unsupported snake_case aliases and source/identity fields on manual
    campaigns. Preserve allowed status, assignee, description and template
    updates without inadvertently exposing previously unwritable fields.
11. **Can generated rounds be deleted or season-reassigned?** Besides DELETE,
    `PATCH /api/campaigns/:id/season` independently updates `seasonId`.
    Clarify whether that is organizational grouping or engine-owned identity,
    and whether the separate path needs a guard.
12. **Which visit states are allowed for campaign items?** The proposed checks
    permit planned/in-progress/skipped linked visits and permit a done plus a
    cancelled visit, as the test requires. The producer rule says completion
    creates a done visit only. Clarify producer-only policy versus stronger
    database invariants, future return trips and generic visit edit/delete
    protections; CG1 must not implement CG4 prematurely.
13. **Is the optional-notes convention universal?** The schema stores free-text
    notes and `included`; no type/check/import rule found in the inspected
    current code guarantees the literal “Optional, on request.” Treat it as
    audit-input convention, not a machine-readable entitlement flag or a claim
    about every record. The explicit scheduling classification is essential.
14. **Which production claims should be rechecked at implementation?**
    The no-existing-campaign-visits check must be rerun before applying its
    constraint. “Chemical default 12 matches no contract” is too broad without
    a scope/date qualifier; the limited current-eligible aggregate supports
    that statement only for the records selected below.

## 5. Additional read-only evidence

A production aggregate over included `chemical`, `fall_aeration`, `crabgrass`
and `winter_watering` scope lines, joining terms in the four specified statuses
with `end_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Denver')::date`,
returned the following. These are **scope-line counts**, not distinct-season
or property counts; no customer identities were queried or recorded.

| Service | Stated quantity | Scope lines | Without positive month entries |
| --- | --- | ---: | ---: |
| chemical | 3 | 24 | 24 |
| chemical | 4 | 3 | 3 |
| chemical | NULL | 7 | 5 |
| crabgrass | NULL | 16 | 16 |
| fall_aeration | 1 | 2 | 0 |
| fall_aeration | NULL | 14 | 14 |
| winter_watering | NULL | 23 | 23 |

This confirms that included on-request services really exist, missing counts
and missing timing are distinct, and catalog defaults cannot safely be used as
contract demand. It does not authorize any production repair or backfill.

## 6. Confirmed compatible facts and boundaries

- Scope lines really have `service_key`, `included`, nullable integer `quantity`
  and nullable integer-array `month_spread`, and reference `agreement_terms`.
  Zod requires twelve nonnegative entries when a spread is supplied; SQL alone
  does not establish that every historical row satisfies it.
- Campaign category/subtype/status, dates and `season_id` match the slice.
  New source/service/round columns and service programs are genuinely absent.
- Both visit schemas already reserve `campaign_item`; no item FK exists.
- `scopeServiceByKey` uses exact matching, so `other:*` returns undefined.
- The proposed eight campaign keys all exist; the four route keys exactly
  match `routeService`. No route-set mismatch requires stopping.
- Defaults in the catalog are editor prefills, not permission to seed programs.
  Company timing can be a distinct owned fact without copying agreed scope.
- Standing crews and campaign team membership are deliberately distinct;
  `assigned_campaign_crew_id` points to `campaign_crews`, not directly to
  standing `crews`. Keep the existing nullable standing-crew link and intentional
  None choices; do not add another roster in CG1.
- `companyToday` and `addCalendarDays` exist and implement Colorado-date
  semantics. Not-ended comparisons include the whole end date.
- Additive numbered SQL migrations, matching server/client schemas, no startup
  DDL, no production writes and no catalog/default backfill agree with memory.
- The master design's legacy-planner import instructions and its old document
  paths are historical. The later ownership/Routes notes explicitly cancelled
  that import. They must not be reintroduced as CG work.
- The rules reference ownership and scheduling packs by older rule names;
  only the CG rules file was found by the `docs/slices/` rules-file search.
  Use the repository's current documentation map rather than inventing missing
  rules files or assuming those references are current paths.

## Disposition

**Pre-flight passed, but CG1 is not implementation-ready without resolving the
ownership/deletion boundaries and the response/navigation details above.**

Only this audit report was added. `STATUS.md` intentionally remains
`not started`: an audit is not a merged implementation and must not satisfy
CG2's predecessor gate. No implementation verification report was fabricated,
and the slice source files were not edited. Stop here as requested.
