# FIX-CG generated round page verification

Date: 2026-11-11. Scope: client-only generated-round editing correction.

## Pre-flight and integration

- Used the explicitly supplied
  `attached_assets/Pasted--FIX-CG-The-campaign-page-treats-generated-rounds-corre_1794414693553.txt`,
  repository Campaigns rules, complete status ledger, slice-pack workflow,
  master scheduling design and CG3/CG4 verification handoffs. No removed
  numbered specifications were restored or edited.
- Workspace `main` starts at `a5bb028b`, the integrated CG4 implementation,
  immediately after merged CG3 `3f4beefa`, CG2 and CG1. A fresh
  `git fetch origin main` still reports the remote mirror at CG3; it was not
  used to reset or overwrite the newer workspace main. The inherited CG4
  ledger's awaiting-merge wording is preserved rather than inventing a remote
  merge observation. All CG4 crew-list/calendar/access work is retained.
- `campaignWriteConflict` still rejects every supplied generated shape field,
  including unchanged title/dates and snake-case aliases, season assignment,
  membership additions/removals and deletion. It permits description,
  assignees, notification template and status. No guard changes were needed.
- The actual detail GET spreads the complete campaign row into its response.
  `CampaignDetailData extends Campaign` already inherits `source`, `serviceKey`
  and `roundMonth` from the existing frontend schema. No duplicate fields or
  schema edits were needed.
- The existing edit dialog still sent title/dates and exposed membership,
  Delete and Assign Season after CG4; the fix remained necessary.
- Inspected `CampaignsList.tsx`: rows only navigate to detail, with no row
  edit/delete actions. Its separate create dialog remains untouched.
- Verified `/dashboard/contracts` is the actual `ContractCenterPage` route.

## Changed files and behavior

1. `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
   - Derives generated identity only from `source === "contract"`.
   - Adds the exact “From contracts” badge and requested focus/hover tooltip.
   - Hides generated Delete/Assign Season; displays an existing season as
     read-only text. Keeps existing Edit role gating and Archive/Reactivate.
   - Generated Edit displays title/window dates as plain text, keeps
     description/both assignees/chemical template editable, hides membership
     controls, avoids fetching customer choices, and links the exact
     contract-scope explanation to Contract Center.
   - Generated save skips manual title/date validation and every membership
     mutation. Its payload is exactly `description`, `assignedToId`,
     `assignedToId2`, plus `notificationTemplateId` for chemical only.
     Blank description/unassigned/default-template values retain explicit
     `null` conventions. Manual validation/full payload/add/remove stay intact.
   - Edit/Delete/Assign Season errors reuse the existing
     `parseApiValidationError` helper. A nonblank string `message` wins over
     `error` codes in the existing `HTTP status: JSON` Error format. Missing,
     malformed, whitespace-only and non-string messages use safe local
     fallbacks. No transport or parser changes.
2. `artifacts/highplains-crm/src/pages/CampaignDetail.rendered.test.tsx`
   - 14 rendered cases exercise generated chemical/nonchemical exact payloads,
     changed and nullable values, no membership requests, read-only fields,
     badge/tooltip, action visibility, Contract Center note/link, inherited
     crew-list mount, reactivation, office Edit gating, manual controls/full
     payload/add/remove, all three manual validation branches and server
     message/fallback handling for all three affected mutations.
   - Uses real Radix dialog/select/tooltip components; only unrelated crew-list
     internals are stubbed (their existing rendered suite was run separately).
3. `docs/slices/campaigns/STATUS.md` — dated FIX-CG evidence block.
4. This verification report.

## Automated verification

```sh
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/CampaignDetail.rendered.test.tsx
```

**Passed: 1 file, 14 tests.**

```sh
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/CampaignGenerate.rendered.test.tsx \
  src/components/CampaignContractNotice.test.tsx \
  src/components/campaigns/GeneratedRoundView.test.tsx
```

**Passed: 3 files, 18 tests.** Preserves Generate/contract-notice/CG4 crew-list
rendered regressions; Generate requests in rendered tests are mocked.

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/routes/servicePrograms.integration.test.ts
```

**Passed: 1 file, 10 tests.** Existing CG1 PostgreSQL/API guards were rerun
unchanged, including the generated allowed-PATCH regression (status,
description and assignee) and forbidden shape/season/membership/deletion.
The suite uses disposable development companies and cleans them up.
It does not replace the legacy PATCH persistence check in the admin journey.

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/highplains-crm run typecheck
```

Library declaration refresh **passed**. Initial leaf check found 219 errors,
including seven stale generated-client declaration errors; after refresh the
CRM leaf check reports **212 existing diagnostics**. A TypeScript compiler-host
comparison substituting HEAD's original CampaignDetail into the same refreshed
program reports **212 baseline / 212 current, zero added or removed
diagnostics**. Neither changed campaign file has a diagnostic. This is not a
claim that the broad CRM typecheck is green.

`git diff --check` passed. Ignored command logs and the diagnostic comparison
are retained under `generated-artifacts/fix-cg/`.

## Running development app

Restarted the managed CRM workflow once after the code batch and started the
previously stopped API workflow. Both serve requests; proxied `/api/healthz`
and `/src/pages/CampaignDetail.tsx` return **200**. Vite transforms the changed
JSX successfully. Existing Browserslist/PostCSS notices and unrelated
QuickBooks fixture-token warnings remain; no campaign startup failure.

### Admin browser journey

One signed-in development browser pass **passed**, using a unique disposable
company/admin/two chemical managers, generated chemical and manual general
campaigns, notification-template fixture and customer. No real-company record
was edited.

- Generated page displayed the exact badge/hover tooltip, Archive and Edit,
  but no Delete or Assign Season. Edit had plain-text title/dates, editable
  permitted fields and the Contract Center link, without membership controls.
- Changed description, swapped both chemical-manager assignees and selected
  the company-default template. Captured the single successful PATCH with
  exactly `description`, `assignedToId`, `assignedToId2`,
  `notificationTemplateId: null`. No membership POST/DELETE. Reload confirmed
  description, both assignees and template choice persisted.
- Manual campaign retained editable title/dates, Add Properties, pending-item
  removal, Delete and Assign Season. Added then removed only the fixture
  customer through UI. Saved edited title/description with the full manual
  payload and unchanged dates; reload confirmed persistence.
- Signed out and removed the matching fixture session, company and three
  users. Cascaded company cleanup removed three memberships, two campaigns,
  nine notification-template rows and one customer. Zero fixture campaign
  items remained; all scoped counts were zero afterward.
- Nonblocking existing dialog-description and password-autocomplete warnings
  were observed. No changed-flow failure was reported.

Browser findings are in ignored
`generated-artifacts/fix-cg/browser/findings.md`. Screenshot evidence IDs:
`6toson` (generated edit), `ga54i1` (exact tooltip), `6ug3c4` (persisted generated
page), `dvgxal` (manual add), `xq7huq` (manual remove), `n5tva2` (persisted manual
page). The generated edit and saved-page images were also visually inspected.
A separate signed-out screenshot attempt timed out during capture; no image
was produced by that attempt. The signed-in browser evidence, rendered tests,
successful Vite transform and health request provide the actual verification.

## Boundaries

**No migration.** No schema, API, server guard, engine, role, shared transport,
list-page, crew-list or calendar changes. No production writes, publication,
real-company Generate runs, generation opt-ins, historical backfills, CG4/CG5
implementation or user-controlled specification edits.

Separate follow-up suggestions cover the pre-existing background-refetch draft
reset and missing Archive/Reactivate failure feedback; neither is silently
changed by this narrowly scoped fix.
