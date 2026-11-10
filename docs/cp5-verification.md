# CP5 — Customer Documents delivery and release evidence

## Scope and pre-change evidence

- Read the full CP5 attachment, customer-page slice pack, ownership map/audit and relevant memory before implementation. Git history confirms CQ7/AM1/CP1–CP4 predecessors are integrated; CP4's existing frame, primitives, styling and customer-page ownership rules are retained.
- Live development **read-only** query before edits: `SELECT count(*) AS document_count FROM customer_map_documents;` returned **0**.
- Migration `0072_contract_payment_schedules.sql` was already present. CP5 uses **0073_customer_documents.sql**.
- No production writes or publication were performed. Production evidence is deliberately not inferred from development.
- Randy's **pre-release production read-only query**, before the rename:

  ```sql
  SELECT count(*) AS document_count FROM customer_map_documents;
  ```

## Ownership and migration

`customer_documents` is the same physical table as the old customer map-document store, renamed in place. No replacement table, copy, drop/recreate, or object-path relocation is used. Both schema copies describe the same owner. `term_documents` stays the sole contract-file owner; KML layers remain separate.

The actual development migration command `pnpm --filter @workspace/scripts run migrate` applied one new file, with 85 prior files already tracked. No startup DDL was added. The configured extension/schema-drift workflow reports `pg_trgm` present and schema in sync.

Nonempty PostgreSQL preservation tests execute the entire migration SQL in a transaction-isolated fixture namespace (only schema qualification is substituted), twice. They verify:

- the table OID, original IDs, names, byte sizes, creation instants and exact object paths survive;
- foreign-key references to the renamed table still resolve;
- existing rows receive `map`; known PDF MIME is backfilled, ambiguous historical `image` remains NULL;
- uploader deletion sets NULL; note length is enforced in PostgreSQL;
- already-present nullable columns/partially applied metadata are repaired without replacing data;
- competing old/new stores and a missing owner fail explicitly, never merge/drop/create a fallback;
- all fixture schema/data changes roll back.

**Release caution:** Publish must recognize the old/new tables as a **rename**. Randy must inspect the comparison and reject any drop/create proposal. The numbered SQL migration is the development/post-merge mechanism; no custom production migration script or deployment hook was added. Historical audit names/counts remain dated evidence, not current schema instructions.

## API and storage lifecycle

Canonical base: `/api/customers/:customerId/documents`. The `/map-documents` base uses the **same handlers**, retained for one release.

- GET list, optional stable category filter; POST upload-url; POST finalize/create; PATCH name/category/note; DELETE; scoped GET `/:id/open` with optional `download=1`.
- Authenticated same-company customer readers can list/open parent or property uploads. Writes use normalized AM1 `accessRole`: admin/office, including account managers projected to admin. The server checks customer, company and document together and rejects stale company headers/query guards.
- Server-owned identity, uploader, size, MIME and timestamps cannot be supplied through metadata updates. PATCH accepts only supplied allowlisted fields.
- Lists return scoped open/download URLs, not raw storage paths. Retrieval reauthorizes each request. The generic raw-object route cannot bypass accepted customer rows or Contract Center's privileged boundary.
- Direct signed PUTs land in private `map-documents/{company}/{customer}/pending/…`. Finalization reads **bounded actual bytes**, not filename, client MIME, or storage metadata. Allowed extensions are prechecked; actual PDF/JPEG/PNG/HEIC/HEIF/Office content is validated. JPEG/PNG are decoded/re-encoded; HEIC/HEIF reuses `heic-convert` to JPEG. DOCX/XLSX inspect ZIP package relationships, main XML and content types with entry/expansion bounds; generic ZIPs and macro packages are rejected.
- A 25 MiB actual-byte maximum applies. Per-file failures use EN/ES-mapped `DOCUMENT_*` codes.
- Accepted files are saved to a separate private path **never exposed by a signed PUT**, preventing overwrite after validation. Existing accepted legacy paths are unchanged. ACLs retain the existing private/company-member convention.
- Signed session-bound upload grants prevent parallel batch requests from losing grants through session overwrite races; the stable finalization ID serializes retries and avoids duplicate rows.
- Invalid/rejected pending objects have no accepted row and cannot be retrieved through the CRM. Interrupted/invalid pending uploads may remain private storage garbage; they are not accepted documents.
- Deletion locks the scoped row, validates its customer-only namespace, refuses other customer/term references, deletes storage **before** the row, and propagates cleanup failures. Missing objects are idempotent (`ignoreNotFound`); all other errors retain the row for retry. If the DB fails after successful object removal, retry safely finishes the row removal. A staging-cleanup failure after a committed create is reported as a failure; the same grant can retry idempotently and the list remains the source of truth.

## Contract projection

The privileged-only bulk projection uses CP1's actual selection separately for current, upcoming and previous periods: own agreements first, parent agreements only when that period has no qualifying own terms. Independent simultaneous agreements remain independent.

Contract Center explicit `covers_through_term_id` projects a document through intervening/later same-agreement start dates; coverage is never inferred from imported files or copied rows. Results deduplicate by source document and link to its owning agreement/term. All six existing Contract Center kinds are preserved/localized (`signed`, `review`, `clean`, `their_form`, `clarifications`, `other`), rather than collapsing current kinds into the brief's shorter examples. Field roles neither request nor receive contract-file data/URLs. There are no customer-page contract-file upload/delete controls.

## UI and call sites

- `customerPages.ts`: one shared Documents label, after Notes for regular/branch/parent, with Branches otherwise unchanged.
- `CustomerDetail.tsx`: SectionTitle/lead and a single privileged Upload action; Documents page integration.
- `components/customer/documents/`: focused page, shared model, scoped queries/mutations, real-progress batch uploader, per-file progress/errors, metadata sheet, category selector, row/type icon, edit/delete dialogs, lightbox, read-only contract section, and Map PDFs card.
- `PropertyPage.tsx`: only adds the side-column Map PDFs card, maximum five map-category files, plus All documents. Existing KML/map layers and Dashboard Open map are unchanged; no Dashboard card was added.
- `en.ts` / `es.ts`: all new labels, actions, categories, errors, kind labels and empty states.
- `lib/db/src/customerDocumentContracts.ts`: driver-free shared DTO/validation contract consumed by API and CRM (no independent mutable document store or copied DTO).
- `lib/db/src/schema/schema.ts` and CRM `shared/schema.ts`: synchronized table and metadata declarations; source compatibility aliases resolve to the same canonical table.
- `routes/customerDocuments.ts`, `services/customerDocuments.ts`, `customerDocumentContent.ts`, `customerDocumentObjects.ts`, `customerDocumentGrants.ts`, `customerContractDocuments.ts`, `customerDocumentRawAccess.ts`: lifecycle, content validation, cleanup, grants, live projection and raw-access protection.
- `routes/routes.ts`: removes the former independent map-document route implementations and registers shared handlers; protects raw-file retrieval.
- `storage.ts`: setup-reset SQL now names `customer_documents`; retained source compatibility methods resolve through the same table alias. HTTP mutation/deletion goes through the new validated lifecycle, not those old row-only helpers.
- `docs/data-ownership-map.md` / `data-ownership-audit.md`: current owner and projection boundaries, without rewriting historical production audit facts.
- `0073_customer_documents.sql`: numbered guarded migration.
- Tests: new API route/content/object/raw-access/contract-projection/PostgreSQL integration suites; new rendered Documents tests; existing `CustomerSubNav.test.tsx` updates expected order only.
- Memory: records the non-obvious parallel session-grant/accepted-PUT-path constraints.

## Verification and baseline delta

Logs are under ignored `generated-artifacts/cp5/`, excluded from Git and deployment.

### Typechecking

- `pnpm run typecheck:libs`: **passes** before and after.
- Root library-first `pnpm run typecheck`: **697 → 693 API diagnostics**, then stops at the pre-existing failing API leaf.
- The reduction is four old not-all-code-paths-return errors removed along with the old handlers. Two existing diagnostic messages only reorder union/property printing; there are **no new diagnostic categories or CP5-file errors**.
- Separate CRM leaf: **210 → 210 diagnostics**, none in the new Documents surface. Existing failures include the frontend drizzle stub, ProposalDraft and ScheduleSummary. These unrelated baselines were not weakened or suppressed.

### Vitest

- Selected API predecessor baseline: **163 passed / 3 failed**, 12 files. The same three failures remain after CP5:
  - `customerListBatch.cp4.test.ts`: expected 11 queries, actual 12;
  - same suite's foreign-page case: expected 6, actual 7;
  - `customerListSummary.cp4.integration.test.ts`: expected annualCents 300000, actual NULL.
- Integrated API run after implementation: **202 passed / the same 3 failed**, 17 files. New CP5 route/content/raw-access/contract/projection/migration/repository tests account for **39 passing tests**.
- Additional final storage-cleanup/stream-bound tests: **2 passing tests**; the updated migration/repository integration tests also pass. Total new CP5 API coverage: **41 passing tests**.
- Frontend predecessor baseline: **171 passing tests**, 16 files (CP1–CP4, CQ7, customer navigation/header/property/maps paths).
- Integrated frontend after implementation: **186 passing tests**, 17 files. Two subsequent rendered company/user-switch tests also pass, alongside all 15 original CP5 cases: effective total **188 passing tests**, including **17 new**.
- Maps behavior is covered by existing customer/property rendered suites with the map viewer stubbed; no separately named KML maps suite exists in this checkout.
- Real PostgreSQL tests cover company/customer isolation, partial updates, references and retry behavior. API role tests cover every current membership role, including account manager normalization.

### Live HTTP and browser verification

The documented demo account was absent in this fork (read-only count 0), not an auth regression. An isolated disposable development company/account/property was used rather than resetting an existing user's password.

The browser continuation uploaded three accepted files before its test process failed unexpectedly. Resuming that same tester also failed unexpectedly. **Populated responsive browser screenshots and the full browser interaction pass are therefore not claimed as verified.** The general screenshot tool also timed out. No second independent tester was launched.

Independent authenticated HTTP verification against the running app and real App Storage passed:

- parallel PDF + two PNG uploads succeeded; renamed invalid PDF was rejected by actual content;
- metadata persisted; scoped open/download worked; stale-company URL failed with 409;
- category filtering and the old map-document alias returned the canonical rows;
- all six accepted fixture files (browser and HTTP runs) were deleted through the scoped API;
- actual GCS object lookups confirmed the stored files were gone, and their old scoped URLs returned 404;
- temporary company/user and the generated fixture credentials file were removed;
- the remaining isolated fixture-prefix pending objects were cleaned separately.

Evidence: `generated-artifacts/cp5/live-http-check.log`. API health and the Vite-transformed Documents module both returned HTTP 200. The gap is visual/browser verification, not the real API/storage lifecycle; rendered EN/ES/navigation/lightbox/action tests remain passing.

## Mobile feasibility — report only

The existing mobile property screen **cannot currently list/open these customer files using its existing flow**:

- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx` has `MapSheet`/visual-scope maps, not customer-document DTOs.
- `GET /api/m/properties/:id` in `crewsAndMobile.ts` projects visual-scope sheets and property facts, not `customer_documents`.
- Mobile authentication is bearer-token `requireMobileAuth`; these web endpoints use authenticated web sessions. Opening the returned web URL in `Linking` would not transfer the mobile bearer token.

A separate mobile slice should reuse the canonical owner/read projection and add a company/property-scoped **read-only bearer-authenticated map list and file-download path**, plus a small Map PDFs surface on the existing property screen. Download/open must explicitly handle authorization (authenticated native download to a local viewer, or an approved short-lived authorized retrieval mechanism), file type, empty/error states and offline expectations. It must not create another document store, expose contract files, add upload/delete permissions, or change mobile navigation without separate scope. No mobile screens, endpoints or navigation were implemented here.

## Follow-up/release cautions

- Keep `/map-documents` aliases for this release; retire only in a later release after caller/traffic verification.
- Mobile map access is separate work as described above.
- Run Randy's production count before release and preserve the rename in Publish's comparison.
- Existing API/frontend typecheck and the three predecessor test failures remain baseline issues, not claimed passes.
