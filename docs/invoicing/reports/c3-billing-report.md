Billing ownership audit: High Plains Property Maintenance has exactly **one active billing-tagged membership (admin)**; no billing-owner-count anomaly was found.

# C3 billing handoff report

## Production read-only evidence

Audit date: **2026-10-12**. Stranded/unassigned/owner-total aggregate timestamp: **19:07:04.885132 UTC**. Pending-by-assignee refresh: **19:19:44.9522 UTC**; billing-role refresh: **19:19:48.802995 UTC**; Mike's active-role confirmation: **19:19:49.405 UTC**. Production queries used authorized read-only access, not development data or historical reports. Only SELECTs were issued. There were no production repairs, writes, migrations, or publishing.

| Company | Stranded billable RFB jobs | Pending Invoice charges | Unassigned pending charges | Active billing-tagged memberships |
| --- | ---: | ---: | ---: | --- |
| High Plains Property Maintenance | 0 | 11 | 0 | 1 admin |

Pending charges by assignee: **Mike Durrill: 11**; **Unassigned: 0**. This was the only company returned by the production company audit.

Mike's identity was resolved against the documented account and its **active company membership** using a company-membership/user join. Read-only evidence confirms **role `admin`, active status, billing tag present** for High Plains Property Maintenance. The new sidebar rule therefore **does not hide Billing from Mike**. No assumption was made from the old test-login role label.

Stranded selection excludes Invoice types and contract Tasks, includes `invoice_required` jobs or existing type-helper eligibility, and considers only outgoing `invoice_for` links to existing company-scoped Invoice counterparts. The final audit includes capability-flag precedence (explicit `requires_invoicing=false` does not make an ordinary Project eligible by type alone), legacy identity fallback only for unkeyed types/statuses, and deleted/foreign/non-Invoice link exclusions. Unassigned zero is an actual aggregate result, not inferred from an unavailable query.

## Delivered behavior and call sites

- **Membership contexts:** login, registration, session deserialization, switching companies, initialization and mobile bearer context return `activeTags`, default `[]`. Session identity retains the selected company, so subsequent deserialization cannot restore another company's tags.
- **Billing authorization:** server `canSeeBilling` and client `canViewBilling(user)` allow admin/office or an active billing tag. `isBillingPerson` is tag-only. Sidebar visibility is deliberately separate: admin always, office only without billing tag. Tagged field users retain authorized billing access; untagged field users are denied.
- **Shared array endpoint:** `/api/pending-invoices` is uncapped, with `kind` on every row, default all/mine scope, pending plus stranded recovery, and read-only recent final Invoice history. Mine includes own/unassigned charges and every stranded job, not another user's assigned Invoice.
- **Bulk/scoped relationships:** statuses, links, counterparts and customers are bulk-loaded with a row-count-independent query budget. A stale, deleted, foreign-company or non-Invoice counterpart cannot hide a recoverable charge.
- **Assignee names:** the charge query bulk-resolves only the necessary users through company-scoped memberships. Tagged field viewers do not need administrative directory access, and that directory's permissions are unchanged. Deleted/unavailable assignees are not falsely labeled Unassigned.
- **Calendar:** Recent includes exactly 30 Colorado calendar dates including today, from midnight 29 dates ago inclusive to tomorrow midnight exclusive. Both boundaries are resolved independently across DST on UTC hosts. Sorting is newest completed first.
- **Recovery:** manual invoice creation additionally accepts non-Invoice RFB `invoice_required` jobs, requires billing access, preserves billing-user assignment, duplicate 409, link creation and comment copying, and carries the job's work-completed date.
- **Status-only invoicing:** shared dialog uses the Dashboard's no-QuickBooks-sync wording and optional invoice number. PATCH preserves sparse-body defaults protections. The additional billing-tagged field permission requires a non-completed Invoice currently at stable Pending Invoice, a target at stable Invoiced that is final in the same type's status set, and only status/optional number keys. It cannot reopen completed unassigned invoices or grant number-only/ordinary edits. Existing role/assignment permissions are preserved.
- **Detail access:** a tagged field manager can open company Invoice rows (including unassigned/recent) and eligible stranded RFB rows. Ordinary other-assignee jobs, contract Tasks and jobs with valid company Invoice counterparts do not acquire new detail access. Foreign ticket data is rejected before billing checks.
- **Parent outcome:** existing C2 sibling-aware propagation remains. The PATCH reports the actual parent outcome. Only a verified Task final-status write claims the job is Done; sibling-held parents get closed/waiting wording; standalone and other parent types get generic Invoiced feedback. The parked concurrent sibling race is not changed.
- **Operational Tickets:** List, By Type and By User hide Invoice tickets in any status and non-Invoice RFB jobs by default. A non-persisted toggle restores the muted With billing List section or normal board columns; Invoice columns disappear when hidden. Legacy `?view=billing` redirects to the dedicated page.
- **My Tickets:** conditional To invoice/Other tickets tabs exist only outside landscape-supervisor My Work, use the authorized mine query for count/discovery, default billing people to To invoice, and preserve `?tab=` with browser navigation. Tab-less users retain a non-clickable removed-jobs line. Billing work is removed from ordinary-ticket views.
- **Billing page:** `/dashboard/billing` is protected by billing authorization, shows all charges with Assignee, waiting/recent modes, saved per-viewer grouping, age warning at five days, warm stranded rows and recovery. Recent rows show invoice number/date without mutation buttons.
- **Entry points:** billing-tagged login/default landing is To invoice. English/Spanish navigation keys added. Sidebar badge shares the all/waiting query. Dashboard adds navigation only; tagged field managers can reach To invoice without changing their owner queue.
- **Safe returns:** billing and validated My Tickets tab origins are supported alongside existing operational list origins; untrusted paths/queries are rejected.
- **Cache contracts:** pending keys include company, viewer, scope and view. Both mutations invalidate pending-invoices by prefix, tickets/my, tickets and dashboard/action-queue. Type/status queries in BillingView are company-keyed.

### Changed source files

API:
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/mobileAuth.ts`
- `artifacts/api-server/src/lib/billing.ts`
- `artifacts/api-server/src/lib/invoiceCompletion.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`

CRM:
- `artifacts/highplains-crm/src/App.tsx`
- `artifacts/highplains-crm/src/hooks/use-auth.tsx`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/landing.tsx`
- `artifacts/highplains-crm/src/lib/protected-route.tsx`
- `artifacts/highplains-crm/src/lib/ticketListReturn.ts`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/pages/BillingPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/LoginPage.tsx`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`, `es.ts`
- CRM `package.json` focused billing test script

Test files added/updated: API `auth.billing.test.ts`, `lib/billing.test.ts`, `lib/invoiceCompletion.test.ts`, `routes/pendingInvoices.test.ts`, `routes/manualInvoice.test.ts`, `routes/taskBilling.test.ts`, `routes/billingDetail.test.ts`; CRM `lib/billing.test.ts`, `lib/landing.regression.test.tsx`, `lib/ticketListReturn.test.ts`, `components/BillingView.count.test.tsx`, `components/BillingAccess.regression.test.tsx`, `pages/BillingHandoff.rendered.test.tsx`.

## Equivalent counts versus intentional scope differences

All waiting headers and the sidebar badge reuse the same company/viewer/all/waiting query. To invoice tab/header reuse mine/waiting. Every stranded job and every unassigned charge belongs to both scopes; the only assignment difference is other people's assigned Invoice charges in all but not mine. For a billing viewer owning all assigned charges, mine and all agree.

Production evidence at the audit timestamp implies **11 mine charges for Mike and 11 all charges**, with no stranded/unassigned additions. This is a projection of audited charge populations; production was not published or run against the new endpoint.

The Dashboard Billing chip remains an **independent action queue**, including its existing items/actions/count and workload eligibility. Its count is not forced to equal a charge list. A difference with mine/all is legitimate and does not mean a lost invoice. `dashboardQueue.ts` and its aggregation are unchanged.

## Automated verification

Refreshed workspace declarations before recording leaf-package baselines. Root `pnpm run typecheck` fails both before and after on the same generated `File` and `Blob` missing-name diagnostics in `lib/api-zod`; this pre-existing failure prevents the root command from reaching leaf packages.

Compared leaf checks independently against an untouched HEAD source snapshot using the refreshed declarations. File/error-category counts, normalized for snapshot paths and shifted line numbers:

| Check | Baseline | Final | New diagnostic categories/counts |
| --- | ---: | ---: | ---: |
| API TypeScript | 739 | 739 | 0 |
| CRM TypeScript | 225 | 225 | 0 |

Existing diagnostic messages can mention the new context field or work-date property, but their error categories and counts are unchanged. No pre-existing typecheck issues were repaired.

Full Vitest verification with `TZ=UTC` (before the final targeted redirect/assignee fixes; those fixes are covered by the subsequent focused runs below):
- API baseline: **768 passed, 7 failed**, 44 files.
- API full verification: **801 passed, the same 7 failed**, 47 files.
- Existing failures: one plant-enrichment partial-run case and six mailbox OAuth reconnect/email-mismatch cases.
- CRM baseline: **41 passed, 7 failed**, 10 files.
- CRM full verification: **58 passed, the same 7 failed**, 14 files.
- Existing failures: five `useTabParam` cases and two CrewAssignmentBoard selection-reducer cases.

Focused billing/auth/recovery tests pass, including assignment boundaries, tags, scoped/deleted links, contract exclusion, thousands of uncapped rows and fixed query budget, actual manual recovery handler, sparse Invoice PATCH number/default preservation, sibling outcome confirmation, UTC evening/DST cutoffs, real Passport login/me/switch/deserialization, rendered operational filtering/counts, office+billing sidebar/route regression and actual login/default redirect components. Final targeted checks: **pending-invoices 33/33**, **CRM `test:billing` 28/28 across six files**; these include the legacy redirect mount-order regression, platform-admin visibility and scoped assignee-name access. The last independent leaf checks still have 739 API and 225 CRM diagnostics with no new categories/counts.

The completion check identified missing detail access for tagged field managers and an overly broad new status-only exception. Both were corrected. The final handler-level access/recovery run passed **175/175 tests across five files**. It covers unassigned/other-assignee/recent Invoice reads, stranded reads, deleted/foreign/non-Invoice/valid counterpart boundaries, ordinary-job/contract denial, company isolation, and rejected reopen/number-only/non-final/foreign-status/extra-field PATCHes. The revised API leaf check remains **739 diagnostics, zero new categories/counts**. These server fixes were confirmed with real-handler HTTP tests, not an additional full browser pass.

Customer `TicketListView`, Phase 2 `schedulingStatusSet`, scheduling calculations, automatic invoice creation and Dashboard server queue code were not modified. Existing corresponding tests remain part of the full suite.

## Design reference and dev browser evidence

The approved name “High Plains Billing Flow” was not found as a browsable/current source reference in the mockup artifact. The explicit sheet layout and existing CRM styling were used without a redesign.

The documented dev login was rejected with HTTP 401. No existing account password or Mike membership was changed. The same browser tester continued using authorized temporary isolated development fixtures.

### Completed browser handoff/recovery

- Office+billing fixture logged in to `/dashboard/tickets/my?tab=invoice`; reloading `/api/auth/me` retained office and the active billing tag. There was **no Billing sidebar entry or badge**. Direct Billing access succeeded.
- Billable Task → RFB produced exactly one linked Invoice. Both fixtures disappeared from the operational List/By Type/By User and from Other tickets. The visibility toggle restored both in the board and `With billing (2)` List section; reload reset it off.
- The legacy billing URL initially exposed a redirect-versus-list-normalization effect race. It was fixed by redirecting **before mounting** operational URL-normalization effects. A rendered regression and the resumed browser route confirmed the destination `/dashboard/billing`.
- With one linked pending Invoice and one stranded job, both server scopes returned **2**, the Billing all/header showed **2 charges waiting**, and To invoice/tab/header showed the same two rows and **2**. This verifies equivalent charge-population counts without altering the independent Dashboard queue.
- Other → browser Back restored To invoice; browser Forward restored Other. Invoice detail used the validated return marker and its Back control returned to To invoice with rows restored.
- Mark invoiced dialog stated **status-only/no QuickBooks synchronization**, accepted the test invoice number, removed the row from Waiting, and displayed its persisted number and Denver date **10/12/2026** in Recently invoiced. Database evidence confirmed stable `invoiced` and the linked Task's final `closed_won` (Done).
- Warm stranded row had the required subtitle/action. Create invoice produced **one** normal Invoice row and **one** invoice-for relationship, not a duplicate stranded/Invoice pair. Invoicing that recovered charge with another number also completed its Task. The captured toast explicitly and truthfully said its linked job **is Done**.
- Both invoices appeared in recent API results and **0** charges remained waiting. The main-invoice toast was not present in its immediate screenshot; the same mutation/toast path was captured on the recovered Invoice, with independent persisted number/status/parent evidence for both.
- No nested-link/button DOM warning was observed. One transient 502 resource load was seen during the initial board navigation; the board subsequently rendered and toggle checks passed. An initial unauthenticated screenshot timed out; the final post-restart login screenshot succeeded. Authenticated Billing/recent/dialog/toast screenshots were captured and examined.
- All isolated test companies, accounts and tickets were removed; exact cleanup checks confirmed **0 remaining fixture companies/users/tickets**. No existing business records/accounts were modified.

Companion tagged-admin/untagged-office/untagged-field permissions and sidebar cases were covered by rendered/API regressions rather than another browser pass. Customer history, scheduling and landscape-supervisor My Work were verified by unchanged call sites and the corresponding existing/rendered regression suites, not a new browser traversal. Dashboard queue data had `total: 1` for the initial one-charge fixture; its server aggregation, counts and actions stayed untouched and its full tests passed. The billing-panel navigation was verified in code; the resumed browser pass did not re-check that panel's visual aggregation.

No remaining access blocker applies to the completed dev journey or production audit. The existing whole-project test/typecheck failures described above remain outside scope.
