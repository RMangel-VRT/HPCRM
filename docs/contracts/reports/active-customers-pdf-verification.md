# Active Customers PDF verification

Date: November 18, 2026.

## Scope and references

Implemented the full AC-PDF text brief in the existing CRM and API Server.
Inspected the merged Active Customers page, driver-free projection, loader,
authorization/access-role projection and tests, plus Contracted Services'
button, HTML, renderer and real-render tests. The available Contract Center
attention handoff confirms that Active Customers retains its existing
responsibility projection.

**Unavailable reference:** `High Plains - Active Customers - 2026-11-13.pdf`
was not among the supplied assets. No exact visual comparison was possible,
and no example-specific detail sentences were invented. Layout follows the
brief and the shared High Plains document kit. Issue details are concise,
localized statements supported by the projected facts.

No migrations, schema changes, responsibility/status/renewal changes, production
writes, publication, email delivery, filtered PDF variants or mobile work.

## Integration

- `GET /api/contract-center/active-customers.pdf?asOf=YYYY-MM-DD&lang=en|es`
  uses the existing authorization, shared single-date validation and exactly
  three company-scoped reads through `loadActiveCustomers`.
- Account managers use the existing AM1 `accessRole` projection to admin.
  Raw-role permissions were not expanded; super-admin behavior is preserved.
- Response: PDF bytes, `application/pdf`, exact attachment filename
  `High Plains - Active Customers - {asOf}.pdf`, `private, no-store`.
  Renderer unavailability is 503 with `DOCUMENT_RENDERER_UNAVAILABLE`;
  other errors use the existing safe Contract Center response.
- Client uses the selected date and explicit bounded language, never cards,
  search or line filters. PDF requests include initiating-company headers.
  Company/user/date/language/permission context changes unmount the request
  owner, abort it, and reject even late blob completions or switch-away-and-back
  responses. URLs are released after the browser starts its download.
- CSV export is unchanged and stays available during and after PDF failures.
- Reused page labels and report-only EN/ES additions have a driver-free shared
  authoritative source in `lib/db/src/activeCustomersText.ts`. Browser locale
  files reuse that source; the server never imports browser application runtime.
  Missing/unsupported/malformed languages safely fall back to EN.

## Report presentation

- Pure `activeCustomersReport` consumes the existing response, not database
  records or a second responsibility classifier. All supplied strings are
  escaped. All dates are calendar-only, formatted with a fixed UTC interpretation.
- Responsible customers are grouped deterministically by stable parent ID,
  then by localized name and ID. An optional projected `parentCustomerId`
  preserves identity without extra queries, schema changes or policy changes.
  Same-named parent groups cannot absorb each other's branches.
- Four figures use the three projection counts and **issue-row count**.
  Each applicable supported flag/no-contract marker creates its own attention
  row. `starting_soon` is not an issue type.
- All line states, season labels/ranges, renewal chips, CRM status chips,
  three sections and empty states are rendered. Notes do not infer commercial
  or renewal decisions not present in the response.
- History selects the latest available **ended/lapsed** end across both lines,
  using the page's latest-end convention but excluding upcoming starting
  terms from ended history. Future end on a selected ended term prints
  “Stopped early”; absent dates print an em dash.
- Shared `documentHtml`, fonts/logo, header, colors, Chromium renderer and stamp
  are reused. Landscape is report-local CSS. Only the stamp's optional
  `pageCountTemplate` was added; omitted templates retain the existing English
  count exactly. Footer space and last-page mountain reserve are preserved.

## Verification

**249 focused tests passed across eight files:**

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/services/documents/activeCustomers.test.ts \
  src/services/documents/activeCustomers.render.test.ts \
  src/routes/contractCenterLifecycle.test.ts \
  src/lib/activeCustomers.test.ts \
  src/routes/contractedServices.test.ts \
  src/services/documents/contractedServices.render.test.ts \
  --maxWorkers=1 --no-file-parallelism
# 199 passed
pnpm --filter @workspace/api-server exec vitest run \
  src/services/documents/render.test.ts --maxWorkers=1 --no-file-parallelism
# 8 passed: existing estimate/invoice/offline-render regressions
pnpm --filter @workspace/highplains-crm exec vitest run \
  --config vitest.config.ts src/pages/ActiveCustomers.rendered.test.tsx \
  --maxWorkers=1
# 42 passed
```

The report-only pure/render suites and page suite were rerun after strengthening
row-integrity and Spanish busy-state assertions: 10 and 42 passed respectively.
API coverage includes the allowed/denied roles, missing auth/company, initiating
company mismatch, cross-company reads, both query parsers, default/range edges,
repeated/bracketed/invalid dates, headers, complete grouped HTML, locale fallback,
read/render failures and 503. Page tests cover filters, current date, language,
busy/duplicate suppression, failures/retry/CSV, URL cleanup and stale response
privacy through company/account/logout/date changes and late blob reads.

Actual EN/ES PDFs were generated with 70 responsible rows, long names/management
names, inherited branches, multiple chips and overlapping issues, plus inactive
early-stop history. Both paginate to 16 landscape Letter pages, **792 × 612 pt**.
One-page empty EN/ES documents also render successfully. Assertions inspect
every footer/count, repeated headings, embedded Inter/images, body/footer
separation and intact ordinary rows by unique per-row markers appearing with
both line labels on the same page. Rasterized English first and Spanish last
pages were visually inspected: readable logo/type, wrapped names/chips,
indented branches, localized footer and no clipping/overlap.
Generated evidence and test/typecheck logs are ignored under
`generated-artifacts/active-customers/`; no generated assets enter Git/deployment.

`pnpm run typecheck:libs` passed. Broader API and CRM typechecks still fail.
An unchanged-HEAD source baseline has the same **694 API** and **186 CRM**
diagnostic location/code sets, with no additions/removals. API message differences
reflect archive source-vs-declaration paths and inferred union ordering; CRM
primary messages are identical. None of the new/changed feature files has a
reported type error. These pre-existing failures were not repaired or suppressed.

Both managed workflows restarted successfully; the API build verified its
shared Chromium runtime. The new Vite module transforms with HTTP 200, the
anonymous PDF request returns 401, and `git diff --check` passes. The preview
screenshot shows the expected signed-out login page, not an authenticated
screen; authenticated button interactions were checked in rendered-page tests.
Startup logs also contain unrelated existing QuickBooks token-format failures
for development sync fixtures; no credentials or QBO behavior were changed.
