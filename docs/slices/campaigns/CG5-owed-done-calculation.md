# CG5: The shared owed / done calculation (customer Services page, later the fulfillment report)

> Assumes 00-RULES-CG and CG1–CG4 merged. No schema. This is what the customer pages work is waiting for ("Owed / Done / Next / Status" and "Not scheduled" on the Services page). Build the calculation once; the step 4 fulfillment report will call the same function across all properties.
>
> The risk here: inventing figures. Every number must come from contract scope, generated rounds, items and visits.

## Pre-flight (run first; if anything fails, stop and report, don't build around it)

- `docs/slices/campaigns/STATUS.md` shows **CG1 to CG4 merged**.
- Rounds have crew lists (`campaign_items.crew_position`, teams on generated rounds), and completing an item records a done visit with `campaign_item_id`.
- There is **no** `lib/serviceFulfillment.ts` or `GET /api/customers/:id/services` yet.

## 1. `lib/serviceFulfillment.ts`

```ts
export function serviceFulfillment(inputs, propertyId: string, termId: string, today: string): ServiceRow[]
```

For the given property and **season (term)**, one row per campaign service the term includes, plus one row per route service it includes:

| Field | Campaign services | Route services |
|---|---|---|
| `owed` | rounds the CG2 engine assigns this property inside the term's dates (contract or program timing); `null` with `gap` set when the engine reports `no_count`/`no_timing` | stated quantity on the scope line (Routes is pattern-based; no per-visit demand) |
| `done` | items in those rounds with `status = 'completed'` | route visits `done` inside the term |
| `skipped` | items `skipped` | route visits `skipped` |
| `next` | earliest pending round: its window, the crew it's assigned to, and for fert/chem its target date if set | next planned route visit |
| `status` | `on_track` · `overdue` (a round window ended with the item pending) · `not_scheduled` (an owed round has **no item**: year not generated, or `missed`) · `waiting_on_signature` · `gap` | `on_track` · `no_route` (included, no active stop) |
| `timing` | `contract` or `program` | — |

- **Seasons, not calendar years:** the caller picks the term (default: the term in effect today, else the next one). A Nov–Oct season counts its own rounds across both calendar years.
- On-request, event and `none` services are listed separately as "Also in this contract" with no counts.
- Manual campaign items for the property that fall in the term and carry no service key are returned as `otherWork` (title, window, status) and never counted as fulfilling a contracted service.

## 2. API

`GET /api/customers/:id/services?termId=` → `{ term, rows, alsoInContract, otherWork }`, with the existing customer-page role and account-manager boundaries (copy the authorization of the customer contract-summary route). Batch-load once per request.

## 3. Hand-off to the customer pages

Don't build the Services page UI here. Document in `docs/scheduling/` the response shape and statuses so the customer pages chat can wire **Owed / Done / Next / Status** and the **"Not scheduled"** warning onto the Services page that replaced Service Checklist, Annual Rollup and Service Plan.

The legacy `getServiceFulfillment` (`customer_service_plans`) is **not** touched here; its retirement follows the ownership map's order once the Services page reads this endpoint.

## Tests

- Owed counts match the engine for contract and program timing; a term crossing New Year counts both years' rounds.
- Not scheduled when the year isn't switched on; overdue when a round ended with the item pending; waiting on signature for a sent term.
- Route row uses the stated quantity and done route visits.
- A manual "Aeration" campaign item never counts toward the aeration row.
- Account manager outside the assignment → 403 (same as contract summary).

## Before you finish: update STATUS.md

Add one block to `docs/slices/campaigns/STATUS.md` for this slice: date, the migration file it added (or "none"), every new table, column, exported function and endpoint (exact names), any place you deviated from this slice and why, and anything left open. The next slice's pre-flight reads this, so the names must match the code.
