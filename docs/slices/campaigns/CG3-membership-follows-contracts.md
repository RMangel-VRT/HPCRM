# CG3: Membership follows contracts

> Assumes 00-RULES-CG, CG1 and CG2 merged. No schema. After this slice, a switched-on year (one Randy has generated) stays in step with the Contract Center without anyone pressing Generate again.
>
> The risk here: a late or failed reconcile silently leaving a property out of a round, or a reconcile racing a contract write.

## Pre-flight (run first; if anything fails, stop and report, don't build around it)

- `docs/slices/campaigns/STATUS.md` shows **CG1 and CG2 merged**.
- `lib/campaignDemand.ts` exports `campaignDemand`; `lib/campaignReconcile.ts` exports `reconcileCampaigns`.
- `coverageResolver` accepts a `statuses` option and has `forMonth`.
- The `campaign_generation_years` table exists; the preview and generate endpoints exist.
- There is **no** `registerCampaignReconciliation` or campaign sweep yet.

## Facts (verify)

- `lib/contractQuestionFlags.ts` already has the pattern to copy exactly:
  - `registerContractQuestionReconciliation(app)`: after a successful (2xx) POST/PUT/PATCH/DELETE on contract, customer, user and import paths, it queues a per-company job on `res.finish`, capturing the company at request entry.
  - `scheduleContractQuestions(companyId)`: a per-company promise chain so a late commit is never lost.
  - `startContractQuestionSweep()`: on startup, then hourly.
- `reconcileCampaigns(tx, companyId, year, opts)` and `campaign_generation_years` come from CG2.

## 1. Triggers

- **After contract writes:** register `registerCampaignReconciliation(app)` beside the contract-questions one, with the same path filter **plus** `/api/service-programs`. For the company it queues `reconcileCampaigns` for **every switched-on year whose Dec 31 hasn't passed** (Colorado date), one transaction per year, `dryRun: false`, `userId: null`.
  - Use the same queue-behind-in-flight structure, as its own queue (campaign jobs must not wait on question jobs or vice versa).
  - Failures are logged with company and year; the sweep retries.
- **Nightly / hourly sweep:** `startCampaignReconcileSweep()` started where `startContractQuestionSweep()` is started, hourly, for every company with switched-on years. This catches date-driven changes (a sent season expiring into nothing, a round passing).
- **Not triggered by campaign or item edits** (the engine never reacts to its own output).

## 2. Run status (no new table)

Keep the last report per company and year in memory, and log each non-empty report at info level (`created`, `added`, `removed`, `keptNotOwed`, `missed` counts). The Generate screen's status line reads "Kept in step with contracts · last checked 2:14 pm" from the most recent run (if the process restarted, from the year row's `enabled_at` until the next sweep).

## 3. What the office sees

Derived on read (no stored flags):

- **On a generated campaign's item list and item page:**
  - "Waiting on signature" chip when the property's covering term for that round is `sent`.
  - "**No longer in contract**" warning when the item is pending, the property is not a member of the round any more, and the engine kept it (it has a visit, ticket, chemical progress, checklist work or photos). Actions: open the contract; **Skip** with reason "No longer in contract" (existing skip flow; `skip_reason` text); or leave it.
- **On the Generate screen:** a "Needs a decision" panel listing the kept-not-owed items across the year, and the `missed` list (owed, but the round had passed when the contract arrived).

Expose this by adding `contractState: 'member' | 'waiting_on_signature' | 'not_owed'` to items returned for `source = 'contract'` campaigns, computed with the CG2 engine for the item's round (batch per request; don't run the engine per item).

## 4. Edge rules (confirm in tests)

- **A season marked lost or cancelled:** future-round pending items without work are removed; started work stays and shows "No longer in contract".
- **A renewal signed for next year:** next year's rounds gain the property only once that year is switched on.
- **A sent season becomes signed:** nothing changes except the chip disappears.
- **Scope edited** (e.g. clean-ups 2 → 3, months changed): the next reconcile adds/removes items accordingly; a new month creates its round if missing.
- **Program row edited:** program-timed members move between rounds; items with work started stay where they are and show "No longer in contract" in their old round, while the new round gains the property. (The office then skips the old one.)
- **A property's parent changes:** coverage follows on the next reconcile.

## Tests

- A 2xx contract write queues one reconcile per switched-on, not-yet-ended year; a 4xx queues none; a campaign edit queues none.
- Two contract writes in quick succession → two queued runs in order, final state correct, no duplicate items (lock + idempotency).
- Sweep with no switched-on years does nothing.
- `contractState` correct for member / sent / kept-not-owed, computed once per request.
- Each edge rule above as an integration test.

## Done when

Editing a contract's scope in dev changes the generated rounds within one request cycle, the sweep runs hourly, the chips and warnings show, all tests green.

## Before you finish: update STATUS.md

Add one block to `docs/slices/campaigns/STATUS.md` for this slice: date, the migration file it added (or "none"), every new table, column, exported function and endpoint (exact names), any place you deviated from this slice and why, and anything left open. The next slice's pre-flight reads this, so the names must match the code.
