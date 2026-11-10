# Estimate setup and rate resolution

This implements the October 26 umbrella/catalog/rate-resolver revision and the
October 27 migration correction, not the superseded September designs.

## Layout and deployment

The referenced `estimate-builder-phase-2-mockup.html` was not supplied. The three
pages follow the attached brief's explicit layout and existing Estimates rail,
catalog dialogs and table components instead. No new artifact or dependency.

New URLs (admin and office):

- `/dashboard/estimates/catalogs/equipment-fees`
- `/dashboard/estimates/settings/rates`
- `/dashboard/estimates/settings/quickbooks`

Existing board, plants, hardscape and irrigation destinations remain unchanged.
Rate Card editing and QBO connection/write settings remain admin-only; office
users see permission guidance rather than a link suggesting edit access.

Apply `.migration-backup/migrations/0053_estimate_setup.sql` through the existing
strict migration command in development/post-merge. Number 0053 was checked as
unused; all historical filenames, including duplicate prefixes, are preserved.
The migration is guarded and seeds the six rows idempotently for existing
companies. Production schema uses the existing Publish schema process, not
startup DDL. The authorized umbrella read and binding operations provision any
missing company rows using idempotent DML, so new companies and production
databases with schema but no migration seed can obtain the six permanent rows.
There is no required startup seed and no new Postgres extension.

English descriptions were authored from the supplied brief because the mockup's
description copy is unavailable. Spanish display copy is translated in the UI;
CRM-owned permanent identities/labels remain canonical English in storage.

## Rate selection, overlaps and manual prices

Contract Center's shared `isTermInEffect`, `compareTermPriority` and
`selectInEffectTerm` are the pricing primitives: signed/active/renewed status,
inclusive start and end dates on the Colorado business day, latest start date
then descending term ID. Existing `selectCurrent` retains its display fallback
unchanged; estimates never price from that fallback.

Candidates must belong to the session company and customer's company-scoped
agreements; applicability uses the **term's** service line, not the agreement's
legacy hint. Card line applicability reuses Contract Center's `applies`:
landscape terms cover landscape/irrigation rates, snow terms cover snow,
`both` covers either and general rates apply to all terms. Across overlapping
agreements, latest start/descending ID chooses one governing term. Only then is
its exact case-sensitive key looked up. If that term lacks the key, use the
active card row, never another older term. This rule is intentional even when
an older agreement happens to have a negotiated rate.

For a key absent from the active company card there is no applicable card line:
choose the latest eligible term across the customer's service lines with the
same ordering, then perform exact-key lookup. Such custom term snapshots work
without adding a card row. A missing key in that governing term is unset rather
than an excuse to revive an older agreement's key.

A matching row owns the source even if cents are null. Text-only rows return
their price text for manual pricing; empty-price rows likewise remain contract
or card sources, not silent zeroes or fallback rates. No pricing table is
duplicated or written by the resolver. Preview loads customer, active card,
terms and snapshots in four bounded queries, independent of table cell count.

### Preview category rule

The actual seed uses `Labor` for landscape/irrigation labor, `Snow equipment &
labor` for snow equipment and `Repair limits`/material categories for other
rates. Include only active card rows with line landscape/irrigation/general and
category normalized to exactly `labor` or `equipment and labor`. Normalization
lowercases, trims/collapses whitespace, expands `&` to `and`, and treats hyphens
and underscores as spaces. Thus custom `Equipment & Labor`,
`equipment-and-labor` and `equipment_and_labor` work; arbitrary strings merely
containing “labor” do not. Snow, materials and repair-limit rows are excluded.

## QBO synchronization and failure recovery

All remote calls reuse `qboRequest` auth, retry and minorversion handling.
Pull explicitly requests `Active IN (true,false)` and accumulates every page
before touching the mirror. Batched upserts, missing-row deactivation and six
binding snapshots commit together. Pull/link/unlink/create share a transaction
advisory lock by company, including remote work, so a late older pull cannot
overwrite a more recent create/link. Other companies remain independent.

The picker searches only the company cache. Its freshness stamp is the latest
cached item fetch (including successful creates), not a guarantee that the full
remote list is unchanged. Empty cache has no stamp and offers Pull. Present
inactive items keep a refreshed snapshot; absent items retain their binding
and last name/type but clear `qboSyncedAt` and display a missing warning.
Unsupported remote types are never eligible for new links.

Remote creation is server-write-gated. CRM-only bindings and QBO reads are not.
Creation validates an active Income account, defaults Service for labor/fees
and NonInventory for plants/materials, checks escaped exact names including
inactive items and maps duplicate fault 6240 to 409. An active supported
duplicate offers link-instead via pull/link. No QBO failure permits a binding.

QBO and PostgreSQL do **not** share a distributed transaction. If QBO succeeds
but the local transaction fails, the response explicitly instructs pull/link
recovery. A later create attempt first performs the live exact-name precheck.
Never bypass that check to blindly retry a remote POST after an uncertain
network outcome. The same pull/link path is appropriate after a lost response.

## Tenant and money boundaries

Every new endpoint checks authenticated admin/office and active session
company. `X-Company-Id` is only an expected-company race guard, not authorization.
All ID operations are company-qualified. New page caches and dialogs isolate
company, user and role; search and preview requests are tenant-bound too.
Equipment rates are nullable integer cents: blank means null, not zero.
No-default PATCH validation modifies only supplied keys; explicit null clears
a rate. Case-insensitive label uniqueness is company-wide including inactive
rows and both kinds. Soft deletion and reactivation preserve the catalog row.
This catalog is not fleet equipment and will not restrict free-typed lines.

## Verification and known baseline issues

- 373 focused backend/service/schema/regression tests pass across 13 suites,
  including the existing QBO connection/customer/client, catalog, irrigation,
  Contract Center lifecycle and schema suites. Fifteen of these exercise the
  new services against real development PostgreSQL with disposable companies,
  including migration reruns, both-state pagination, failed later pages,
  transaction rollback after remote success, overlapping pulls, nullable cents
  and company-scoped rate reads.
- 207 rendered UI/navigation tests pass across ten suites (new setup pages and
  scoped selector, existing hardscape/irrigation pages and shared navigation).
  One old navigation assertion that Settings was empty was updated to expect
  the two newly required links.
- One signed-in browser pass verified equipment create/edit/reload, exact
  $123.45 persistence, label-only preservation, explicit null clearing and soft
  deactivate/reactivate. It also confirmed contract text pricing vs card
  fallback, all six QuickBooks rows, the cached picker, disabled create controls
  and disabled cleanup. Disposable fixture records were removed afterward.
- The API and CRM workflows start successfully; required-extension and
  schema-drift checks pass. `git diff --check` is clean.
- `pnpm run typecheck` was run with shared declarations refreshed first
  (`typecheck:libs` passes). The root check remains blocked by existing errors:
  auth callback return paths and `seedAllTicketTypes` import, the legacy
  `contractCenterCopy` fixture's missing `bidTicketId`, legacy route handler
  signatures, mailbox/plant tests, and API tests importing the frontend's
  untyped Drizzle-stub schema outside the API root directory. CRM has its
  existing schema-stub diagnostics and unrelated `App.tsx` type issues.
  No diagnostics were reported in the new setup/rate/QBO modules, pages,
  selector changes or tests. Scripts, mobile and sandbox typechecks pass.
  These baseline errors were not broadened into an unrelated refactor.
- Real QBO creation was **not** exercised: remote responses/faults were mocked
  while local persistence was real PostgreSQL. No live remote items or customer
  records were modified. A sandbox verification is proposed separately before
  production item writes.

The only reference-asset deviation is the unavailable HTML mockup and its
description wording, addressed above. No superseded September slice, estimate
builder/table, rate editing, fleet change or cleanup execution is included.
