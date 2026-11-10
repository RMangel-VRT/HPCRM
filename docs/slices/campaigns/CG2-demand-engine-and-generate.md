# CG2: Demand engine and the "Generate campaigns" screen

> Assumes 00-RULES-CG and CG1 merged. Schema: one small additive table. No scheduling-board changes (CG4), no automatic triggers (CG3): in this slice the engine runs only when someone presses Preview or Generate.
>
> The risks here: duplicate rounds or items; deleting work someone started; quietly guessing timing.

## Pre-flight (run first; if anything fails, stop and report, don't build around it)

- `docs/slices/campaigns/STATUS.md` shows **CG1 merged**, and lists its migration file.
- The `service_programs` table and its zod validation exist in `schema.ts` and the client schema copy.
- `contractCatalog.ts` exports `campaignServices()` and every entry has `scheduling`.
- `campaigns` has `source`, `service_key`, `round_month`, `round_seq`; `visits` has `campaign_item_id`.
- `GET /api/service-programs` and Settings → Service timing exist.
- There is **no** `campaignDemand`, `reconcileCampaigns` or `campaign_generation_years` yet.

## Facts (verify)

- `lib/contractCoverage.ts` `coverageResolver(data)(customerId, serviceKey, year)` returns `{ term, scope, window, months }` for **one year**, statuses `signed | active | renewed` only, own property before immediate parent, `compareTermPriority` (newest start first).
- `loadCustomerContractInputs` (in `lib/customerContractSummary.ts`) loads customers, agreements, terms and scopes for a company in one go; the contract-questions sweep uses it inside a transaction. Reuse it, and make sure the call loads `scope` (it's optional on `CustomerContractInputs`).
- The existing "add items" endpoint (`POST /api/campaigns/:id/items` in `routes.ts`) shows the fields a new item needs (`customer_name`, `customer_city` are NOT NULL; chemical items start at `workflow_step = 'pre_communication'`). Factor the row construction into one helper both paths use.
- Campaign windows are calendar dates; campaign pages and the customer Services hook read `window_start`/`window_end`.

## 1. Coverage per month (extend, don't fork)

Extend `coverageResolver` with an options argument, keeping the current call signature and behavior as the default:

```ts
coverageResolver(data, { statuses?: TermStatus[] })   // default ['signed','active','renewed']
resolver.forMonth(customerId, serviceKey, month /* 'YYYY-MM-01' */)
  → { term, scope } | null
```

- A term covers a month when `term.start_date <= last day of month` and `term.end_date >= first day of month`.
- With `statuses` including `sent`: **a signed/active/renewed term beats a sent term** covering the same month, regardless of start date; within each group, `compareTermPriority`.
- Own property's term wins over the parent's even when it excludes the service (current rule; keep it).
- Unit-test the old signature is unchanged (Routes depends on it).

## 2. The engine: `lib/campaignDemand.ts` (pure)

```ts
export function campaignDemand(inputs: CustomerContractInputs & { programs: ServiceProgram[] },
                               year: number, today: string): DemandReport
```

For each **non-parent** property × each `campaignServices()` key × each month of `year`:

1. `forMonth(property, key, month)` with statuses `signed, active, renewed, sent`. No term or no included scope line → nothing owed.
2. **Rounds this month:**
   - If the scope line's `month_spread` has any value > 0 → **contract timing**: `n = month_spread[m]`.
   - Else count = `scope.quantity`, or, if blank, the service's **standard** row's `rounds` (CG1). **Never the catalog's `defaultQuantity`.** No count → gap `no_count`. Program row for `(key, count)` → **program timing**: `n = program.month_spread[m]`. No program row → gap `no_timing` (once per term × service, not per month).
   - Record `count: 'contract' | 'standard'` on the member so the screen can show "standard count".
3. For `seq = 1..n`: the property is a member of round `(key, YYYY-MM-01, seq)`, recording `{ propertyId, termId, termStatus, timing: 'contract' | 'program' }`.

Also report, once per term × service:
- `count_mismatch` (info): contract months sum ≠ stated quantity.
- `on_request_only`: never; on-request services aren't campaign services, so they're simply skipped.

```ts
interface DemandReport {
  rounds: { serviceKey; roundMonth; roundSeq; members: Member[] }[];   // sorted by month, then catalog order
  gaps: { propertyId; termId; serviceKey; kind: 'no_count' | 'no_timing' | 'count_mismatch'; count?: number }[];
}
```

The engine is pure and synchronous; unit tests drive it with fixtures (see Tests).

## 3. Reconcile: `lib/campaignReconcile.ts`

```ts
export async function reconcileCampaigns(tx, companyId: string, year: number,
  opts: { dryRun: boolean; userId?: string; today?: string }): Promise<ReconcileReport>
```

Under the company advisory lock (00-RULES-CG):

1. Load inputs + programs, run `campaignDemand`.
2. Load existing `source = 'contract'` campaigns for the year with their items, visits, tickets and chemical progress.
3. For each demanded round:
   - **Round already over** (`window_end < today`): never add. Members without an item go in the report as `missed` ("owed, but the round has passed").
   - Campaign missing → **create** it:
     - `title` = `"{year} {campaignName} – {Month}"`, plus `" ({seq} of {n})"` when the month has more than one round;
     - `window_start`/`window_end` = first/last day of the month;
     - `category`/`subtype`: `chemical` → `chemical`; `irrigation_open` → `irrigation` + `spring_turn_on`; `irrigation_winterization` → `irrigation` + `winterization`; everything else → `general`;
     - `source = 'contract'`, `service_key`, `round_month`, `round_seq`, `status = 'active'`, `created_by_id = userId`.
   - Member without an item → **add** it with the shared row helper (`customer_id` = the property; `service_plan_category` left NULL: that column is legacy).
4. For each existing pending item whose property is **no longer** a member of that round:
   - **Remove** it only if all hold: `status = 'pending'`, round not over, no visit (any status), no `ticket_id`, no chemical progress (`chem_pre_sent_at`, `chem_work_completed_at`, `chem_post_sent_at` all NULL), no checklist completions, no photos.
   - Otherwise **keep** it and report `kept_not_owed` (CG3 shows this on the item).
5. A generated campaign left with **no items** whose round hasn't started is deleted; otherwise left alone.
6. Completed/archived generated campaigns still receive new members (report `added_to_closed_round` so the office sees it).
7. `dryRun` rolls back and returns the same report.

```ts
interface ReconcileReport {
  year; created: Round[]; added: ItemRef[]; removed: ItemRef[]; keptNotOwed: ItemRef[];
  missed: ItemRef[]; addedToClosedRound: ItemRef[]; gaps: DemandReport['gaps'];
  waitingOnSignature: number;  // members whose covering term is 'sent'
}
```

## 4. Years that are switched on

```sql
CREATE TABLE IF NOT EXISTS campaign_generation_years (
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  enabled_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  enabled_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year)
);
```

The first successful Generate for a year inserts its row. CG3 keeps switched-on years in step automatically.

## 5. API

- `GET /api/campaign-generation/:year/preview` (admin, office) → `reconcileCampaigns(..., { dryRun: true })` plus the property/term names and contract links the screen needs, and **manual campaigns whose windows overlap the year** (id, title, category, window) so duplicates can be spotted.
- `POST /api/campaign-generation/:year` (admin) → real run; inserts the year row; returns the report.
- Year must be the current Colorado year or the next one.

## 6. Screen: Campaigns → "Generate from contracts"

A button on the Campaigns list (admin and office see it; only admin can press Generate) opening a full page.

- **Header:** year switcher (this year / next year; default next year from Oct 1 on). Status: "Not generated yet" or "Kept in step with contracts since Nov 12".
- **Rounds, grouped by service** in catalog order. Each round row: name ("Shrub trimming – June"), window, members count, "2 waiting on signature", and the change this run would make: **New round**, **+3 / −1**, or **No change**. Expanding a row lists its properties (property name, season label, "waiting on signature" chip, "program timing" and "standard count" chips).
- **Can't be scheduled** panel (the gaps), above the rounds when it isn't empty:
  - `no_timing`: "Fert/chem × 3: no timing set · 29 seasons" → link to Settings → Service timing.
  - `no_count`: "Fert/chem: no count on 6 seasons and no standard set" → list of property/season with contract links, and a link to Settings → Service timing to set a standard.
  - `count_mismatch`: property, season, "contract months add to 2, count says 3" → contract link.
  - `missed`: property, round → "Round already passed; schedule by hand if still owed."
- **Hand-built campaigns this year** panel: the overlapping manual campaigns with links, and the line "Generated rounds don't replace these. Archive any that duplicate a generated round."
- **Generate** (admin): confirm dialog with the totals ("Create 34 rounds and 412 items"), then the report as a success summary.

## Tests

Engine (pure, fixtures):
- Contract months used when stated; program months used only when the line has none; contract months beat a program row for the same count.
- No program row → one `no_timing` gap per term × service, no rounds.
- `quantity` NULL uses the standard row's count and months; no standard → `no_count` (never the catalog default: a chemical line with NULL quantity and no standard must not produce 12 rounds).
- A stated quantity beats the standard even when the standard has a different count.
- A term ending Oct 31 contributes no November round; a term starting Nov 1 contributes November and December rounds of its start year.
- Signed term beats an overlapping sent term; sent term alone makes the property a member with `termStatus = 'sent'`; draft/lost/cancelled never.
- Branch covered only by its parent → member; branch with its own term excluding the service → not a member even if the parent includes it; parents never members.
- On-request (`fall_aeration`, `crabgrass`) and route services never produce rounds even when included.
- Two rounds in one month → seq 1 and 2, titles "(1 of 2)", "(2 of 2)".

Reconcile (integration, dev DB):
- Run twice → second run creates nothing.
- Removing aeration from a sent season → its pending item is removed; the same item with a planned visit, a chemical pre-communication, or `completed` status is kept and reported.
- Round over → no new items, `missed` reported.
- Empty unstarted round → campaign deleted; started round left.
- Manual campaigns and their items are untouched in every case.
- Office POST → 403; preview for a year two ahead → 400.

## Done when

Preview and Generate work in dev against the CC fixtures, the gaps panel shows real gaps from fixture data, all tests green. **Do not run Generate against production**; Randy does that after reviewing the production preview.

## Before you finish: update STATUS.md

Add one block to `docs/slices/campaigns/STATUS.md` for this slice: date, the migration file it added (or "none"), every new table, column, exported function and endpoint (exact names), any place you deviated from this slice and why, and anything left open. The next slice's pre-flight reads this, so the names must match the code.
