# Signed renewal import: development verification

## Scope and release status

This adds an admin-controlled renewal mode to the existing audit import, not a
replacement for normal Renew. It creates seasons on existing agreements and
never replaces earlier seasons, changes agreement import references or writes
frozen legacy records. No production data was imported, no signed customer
documents were audited, and nothing was published.

**Migrations: none. Packages or lockfile changes: none.**

The revised [audit rollout](contract-center-audit-rollout.md) remains
authoritative; the historical Copy-after-publish instruction is superseded.
Dashboard/revenue/report/ticket/mobile consumers remain outside this slice.

## Mode-specific limits and document schemas

| Mode | Uploaded aggregate | ZIP expanded bytes | ZIP entries | Documents |
| --- | --- | --- | --- | --- |
| Audit (`contracts.csv`) | 10 MB | 30 MB | 20 | Existing legacy `document_id` references only; no PDF uploads |
| Renewal (`renewals.csv`) | 40 MB | 60 MB | 60 | ZIP PDFs under `files/`, at most 15 MB each; `contract_ref,file,kind` |

MB means 1,048,576 bytes. Entry counts include directory and README entries.
Multipart uploads allow at most six file parts, with no text fields. Uploading
both main tables gives exactly:
`Import either contracts.csv or renewals.csv, not both.`

No disk extraction occurs. Both modes reject traversal, backslashes/unsafe
complete paths, symlinks, encryption, unsupported file types and duplicate
tables. ZIP declarations and actual streamed bytes are bounded. Strict CSV
headers, UTF-8, quoting, record size, integer money and file/row diagnostics
remain enforced. Renewal PDF bytes must have a PDF header; references must
resolve to an accepted PDF from the same ZIP. The expanded renewal allowance
does not admit larger audit imports or audit-mode PDFs.

## Behavior verified

- Admin/superadmin access and active-company scoping on current export and
  import; office, supervisors and other non-admin roles receive 403.
- Both exports share the exact 18 `contract_center.csv` columns, including
  customer/parent names, read-time display status, renewal links, signed
  timestamps, readable payment lines and document counts.
- Current export covers every company season, sorted by customer then start
  date, with first-cycle January–December dollars from `recoverPayments`,
  rate differences/custom rates, and the unchanged rate-card export. Existing
  audit batching, document streaming and spreadsheet-safe CSV encoding remain.
- Required/unique references, company-owned non-parent sources, date ordering,
  allowed statuses, signed dates, existing-renewal conflicts, duplicate sources,
  exact draft/sent conflict wording and shared child-row validations.
- Source-context gaps/overlaps, name mismatches, scope distribution warnings
  and signed-without-signed-document warnings retain file/row context.
- Blank optional season/snow fields carry forward. Payments are supplied anew
  and are required except for snow-only T&M. Scope copies unchanged when absent
  and replaces entirely when supplied. Rates begin with `renewalRates`, and
  partial overrides—including existing custom rates—alter only supplied cells.
  The recorded percentage does not automatically increase any money.
- Signed dates use noon America/Denver; dates remain strings and money exact
  integer cents. Annual totals and repeated billing use the canonical builders.
- Real requests parse their own uploads. Each customer has one transaction,
  ordered agreement locks and fresh under-lock source validation/carry-forward.
  History records creation and signed-source renewal through `writeTerm`.
- Same-start imported history is recognized before renewal conflicts. Repeated
  imports create no seasons, documents, history or storage writes.
- PDFs use unique private paths, version 1, importing-admin attribution and the
  existing authorized object-download flow. Failed customers roll back database
  changes and remove only their newly allocated objects. Earlier committed
  customers survive. Save/cleanup exceptions are not echoed to clients, and
  cleanup failure is explicitly reported instead of falsely reporting success.
- Sent/draft imports leave the original season completely unchanged. Signed
  imports change only its status/history/update timestamp, preserving older
  fields, scope, billing, rates and documents. Legacy rows are unchanged.
- Settings keeps file/company Preview invalidation, grouped diagnostics and
  inline confirmation, adds mode labels/actions and created-season links, and
  refreshes affected board/detail/customer queries.

## Checks and results

- Final renewal parser/planner/export and opt-in real PostgreSQL suites:
  **70 tests passed across two files**. Includes ZIP boundary/security checks,
  every specified error/warning category, carry-forward, export ordering and
  first-cycle recovery, authorization/tenancy, signed/sent/draft writes,
  idempotency, concurrent requests, under-lock eligibility/source changes,
  per-customer rollback, object cleanup and sanitized storage failures.
- Audit/lifecycle/board compatibility pass, including the opt-in real
  PostgreSQL audit suite: **98 tests passed across four files**.
- Full API suite: **1,306 passed, 7 failed, 21 skipped**. The two additional
  export assertions added afterward pass in the final 70-test focused run.
  Failures are the unchanged plant-enrichment partial-run test and six mailbox
  OAuth reconnect/mismatch tests.
- Full CRM suite: **184 passed, 8 failed**. Existing failures: two crew-selection
  reducer tests, five tab-query routing tests and one rate-card group/count test.
- Root `pnpm run typecheck`: exits nonzero with **735 existing API diagnostics**.
  Independent CRM typecheck: **221 existing diagnostics**. Neither reports an
  error in the changed renewal/audit/Settings/persistence files. These baseline
  counts match the prior audit verification; unrelated type repairs are not
  included.
- Schema drift and required `pg_trgm` checks passed. API bundle/startup and CRM
  startup passed. `git diff --check` passed.

Complete check output is ignored generated output under
`generated-artifacts/contract-renewal/`, not deployable assets.

## Disposable-development browser verification

One signed-in browser pass used a dedicated disposable company, admin, customer,
agreement and expired source season. No real customer agreement was edited.

1. Downloaded current contracts from Settings › Contracts; ZIP contained the four
   required CSVs and the fixture source/payment IDs.
2. Uploaded the renewal ZIP through the file input. Preview showed **Renewal
   import**, **add renewal**, the source-season description, **one term**, **zero
   errors**, **$1,236**, and **2026-10-01 – 2027-09-30**.
3. Confirmed Import through the inline UI. Success linked the new 2026–27 season
   to its existing agreement.
4. Detail showed the new stored Signed season as read-time Active, the prior
   season Renewed, attributable import history, carried Fixture service scope,
   General labor at **$123.45/hour**, and **$103 in each month**.
5. Documents showed the signed `fixture.pdf`; its authorized `/objects` download
   returned 605 bytes beginning `%PDF-`.
6. The agreement left Up for renewal and appeared under Signed; its all-contracts
   row correctly showed Active.
7. Reupload Preview returned **Already imported; skipped**, zero agreements/terms,
   one warning, zero errors, and disabled Import. Selecting the file again cleared
   Preview and Import eligibility.

The browser observed one non-blocking resource 404 during a Settings tab
transition; the panel and complete requested journey continued successfully.
Screenshots captured successful results, duplicate Preview and contract detail.
The fixture and its uploaded storage objects were removed after verification.

## Changed files

### API

- `artifacts/api-server/src/lib/contractAuditData.ts`
- `artifacts/api-server/src/lib/contractAuditExport.ts`
- `artifacts/api-server/src/lib/contractAuditFiles.ts`
- `artifacts/api-server/src/lib/contractAuditPlan.ts`
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractRenewalPlan.ts`
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`
- `artifacts/api-server/src/objectStorage.ts`
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`

### Tests and disposable fixtures

- `artifacts/api-server/src/lib/contractRenewal.test.ts`
- `artifacts/api-server/src/lib/contractRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`
- `artifacts/api-server/src/lib/contractRenewalBrowserFixture.ts`

### CRM and documentation

- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `docs/contract-center-audit-rollout.md`
- `docs/contract-center-renewal-verification.md`

The supplied signed-renewal requirements attachment is retained unchanged as
input; it is not a generated deliverable. No other artifact, schema, package
manifest, lockfile or migration was changed.
