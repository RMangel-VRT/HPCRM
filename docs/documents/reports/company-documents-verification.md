# Company Documents verification

## CD1 — Storage and API

- Allocated the next unused migration, `0088_company_documents.sql`; only this new migration was applied to development. No production DDL, startup DDL or publication.
- Guarded additive two-table migration, deferred current-file FK, live role uniqueness, mirrored browser schema, explicit browser-safe DTOs, Colorado calendar status.
- Session/user/company/intent/target-bound signed grants; real content validation reuses customer conversion; accepted paths are fresh private identities, never signed PUT destinations. Generic object opening rejects the entire company-document namespace. Staging cleanup failure does not undo a successful committed finalize.
- 23 focused tests passed in `companyDocuments.test.ts` and `companyDocuments.integration.test.ts`: all canonical roles and routes, hidden office documents and historical files, cross-company/mismatch/intent/session denial, create/replace replay, actual SQL history retention/role conflicts/license-only writes, strict PATCH, safe headers and date thresholds.
- Migration replay executed twice inside an isolated transactional schema, with current-file references exercised; fixtures rolled back.
- Development migration runner reported the pre-existing changed-applied-file warning for `0074_campaign_service_timing.sql`; no existing migration was changed or replayed.

## CD2 — Page and license move

- Responsive page, category groups/search/pins, license card, preview/history drawer, upload/edit/replace/archive dialogs, footer navigation and manage-only amber indicator.
- Replacement suggests one year after Colorado today (leap-day clamped), not one year after the old expiry. Pin defaults on in UI only.
- Settings Company profile no longer queries or writes the license number; chemical warning links point to Company documents. Template reads allow office and canonical account managers in the current implementation.
- 78 rendered/navigation tests passed across `CompanyDocuments.rendered.test.tsx`, `SettingsLicenseMove.rendered.test.tsx`, and `navConfig.test.ts`. Includes admin/field/account-manager, license present/absent, template warning, license PUT/date PATCH, search/group/pin, starter presets, replacement date, Spanish/error text, and exact Settings save payload.
- Existing frontend typecheck baseline reported 186 errors both before and after CD2; none in new CD2 modules. Existing Settings errors and four `estimatesRail.test.tsx` failures were reproduced without CD2 edits.

## CD3 — Pre-implementation communications audit

- `emailSyncService.ts` sent-folder RFC dedup query scopes `company_id` and `provider_message_id` only; it does not filter `customer_id`, so null-customer company-document sends deduplicate.
- Inbox requests inbound direction; sent company-document records are outbound. Unsorted reads `unsorted_emails`, not unassociated `communications`. Customer tabs apply an explicit customer ID. Global All/Sent can legitimately show these outgoing records.
- There was no null-customer routing conflict requiring a broader refactor. To eliminate the gap before provider stamping, the send path persists its RFC ID before contacting Gmail, preserving that ID on failed/ambiguous delivery.
- Existing document-settings reads remain admin-only. A manage-only `/api/company-documents/email-options` read projects only company name and document-settings phone, without changing existing settings permissions.
- Real external email was not authorized and was not sent. Transport tests used mocks.

### CD3 implementation and evidence

- Current live document/file identities, safe filenames and byte sizes are snapshotted in `communications.attachments_json` before Gmail is invoked. Communications owns all send facts; there is no new send table. Existing `from_name` records the sender's send-time display name; the history DTO exposes that snapshot as `sentByName` (the existing `sentByName` join is not a writable column).
- Connected/sync-enabled active-company mailboxes are checked against the existing shared/own visibility rules. The compose dialog loads property-manager suggestions on demand, defaults shared before own, uses document-settings phone and company name, and exposes expired/expiring chips, validation and actionable mailbox/send failures.
- Both declared and actual attachment bytes are capped at 20 MB; To/Cc total and live document count are each 1–10. Every To address must match exactly one customer and all must resolve to the same customer; otherwise the communication remains unassociated.
- MIME attachment media upload uses Gmail's size-capable transport with retries disabled. Plain-text and HTML messages without attachments retain **byte-for-byte** legacy output, tested with fixed time and randomness. Tests exercise RFC ID preservation, 76-column attachment encoding, filename header safety, 20 MB rejection, failed delivery stamping and no retry.
- `hasSyncedCommunication` shares the existing company + RFC Message-ID check with the sent-folder importer. Real-DB tests prove a null-customer company-document send deduplicates using that RFC identity, not Gmail's internal message ID. Send-history reads exercise JSONB document matching and company isolation.
- Before CD4 began: **35 backend checks** passed across route, transport, email-service and integration suites; **12 page checks** passed including multi-document compose, shared-mailbox default, phone interpolation, exact submitted payload and visible no-retry failure.

## CD4 — Expiration flags and final verification

- Added `document_expiring` to canonical taxonomy and the web mirror, with English/Spanish display labels. Manual mobile taxonomy/creation excludes the system tag; the native composer source is unchanged. Current web tag consumers are inbox filters/detail displays, not manual creation pickers.
- Reconciliation uses the **same company advisory gate as document writes**, reads all historical reminder keys (including resolved/dismissed), preserves active human workflow states, resolves obsolete open keys before inserting the desired stage, and uses `onConflictDoNothing()` as a second guard.
- Source keys include document ID, expiration date and stage. Boundaries 61/60/15/14/0/−1, no-date/archived documents, exact resolution reasons, stage hand-off with a dismissed destination, human acknowledged/in-progress states and unrelated/malformed source keys have focused tests.
- A real-DB synthetic-company integration test ran five concurrent reconciles, then exercised dismissal suppression, stage hand-offs, renewal, clearing and archival. Only that fixture company was mutated and it was removed afterwards.
- Startup/hourly sweep is registered beside contract-question reconciliation. Only successful create/replace/patch/archive HTTP responses enqueue post-commit reconciliation; request-entry company is captured. Tests prove a later company switch cannot redirect it and failed writes, upload-url requests, license-number writes and email sends do not schedule it.

### Final automated checks

| Check | Result |
| --- | --- |
| Focused API/storage/email/expiry and customer-document compatibility suites (10 files) | **73 passed** |
| Additional private-namespace isolation test plus route rerun after replay-response adjustment | **22 passed**, including the new isolation test |
| Documents page, Settings license move, sidebar/navigation (3 files) | **80 passed** |
| PDF preview authorization/pagination/cleanup/failure fallback | **2 passed** |
| Migration idempotency | Passed: new migration replayed twice in isolated schema; no existing filenames altered |
| Frozen dependency install | Passed; original package/snapshot resolutions were compared structurally and preserved |
| `PORT=23878 BASE_PATH=/ pnpm --filter @workspace/highplains-crm run build` | Passed; separate lazy PDF module and worker asset emitted (existing large-chunk warnings remain) |
| `pnpm run typecheck` | Fails with **694 existing repository diagnostics**, same count as the CD1 snapshot; no new company-document or expiry module errors |
| `pnpm --filter @workspace/highplains-crm run typecheck` | Fails with **186 diagnostics**, matching the measured pre-feature CRM baseline; no new feature-module errors |
| `git diff --check` | Passed |

Evidence logs are retained locally in ignored `generated-artifacts/company-documents/`. Typecheck is **not** represented as passing: existing examples include auth return-path errors, Settings legacy typing and the unrelated `routes.ts` relative Gmail import. The full repository's pre-existing type debt was not broadened into this feature.

### Authenticated verification

- The documented demo admin was absent in this development fork. An isolated disposable company and canonical lowercase test account were used instead; no real user's credentials or membership were changed.
- Real UI upload → reload → PDF download → PNG replacement → reload verified a new current file and downloadable earlier PDF. Replacement suggested one year after **Colorado** today (the test ran after UTC midnight but before Denver midnight).
- Name/pin edit persisted without changing category/visibility. The field-role check hid Office documents and upload controls while retaining Everyone documents. The admin role was restored only on the disposable membership.
- Archive removed the live row, retained both file rows, and made archived open routes return 404. The no-connected-mailbox compose state showed its connection link, preselected the document and disabled Send. No send was attempted.
- Desktop and 390px page/drawer screenshots were inspected. No document-level horizontal overflow; the narrow table scrolls within its own container.
- The first browser check found Chromium blocking the sandboxed PDF iframe. **Fixed without weakening file-route CSP:** authorized bytes now render into a lazy PDF.js canvas; images use short-lived blob URLs. A targeted follow-up confirmed a nonblank two-page PDF, Next/Previous pagination and a decoded PNG, with no runtime or failed-request events. Preview unmount aborts the request, destroys the PDF and revokes image URLs. The upload dialog also received its missing accessible description.
- All disposable companies/users/rows and all five synthetic file objects from browser verification were removed. No customer/business record was changed.
- API and CRM workflows restarted successfully. Existing QuickBooks test-fixture token decode warnings, dependency/Browserslist warnings and earlier generic development logs are unrelated to this feature; no company-document startup failure was observed.

### Remaining limits and release safety

- **Real Gmail delivery is unverified by design:** external sending was not authorized and the disposable company had no connected mailbox. MIME, delivery outcomes, snapshots and sent-folder deduplication were verified with mocks and database tests, not claimed as live delivery.
- No native mobile screens/composer changes, SendGrid attachments, automatic send retries, customer-specific COIs, personal licenses, startup DDL, destructive migrations or publication were introduced.
- The guarded additive migration was applied to development only. Production schema changes remain in the normal Publish process; none were run directly.
