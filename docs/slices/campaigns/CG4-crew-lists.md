# CG4: Crew lists for rounds, the round on the calendar, and fert/chem dates from the list

> Assumes 00-RULES-CG, CG1–CG3 merged, and the scheduling rules (`docs/scheduling/Rules.md`). Schema: additive only.
>
> **How High Plains runs a round (Randy, Nov 10):** the office tells a crew the round has started and gives it a list. The crew works through its list as fast as it can within the round's window; nobody is held to a per-property day or timer. A big round can be split between two or more crews, each with its own list. The list is a **priority order** the office can rearrange until each property is done. Fert/chem is the exception that needs per-property dates, because customers get a notice for their date.
>
> The risks here: breaking today's chemical notice flow; a property on two crews' lists; inventing a second planned date.

## Pre-flight (run first; if anything fails, stop and report, don't build around it)

- `docs/slices/campaigns/STATUS.md` shows **CG1, CG2 and CG3 merged**.
- `registerCampaignReconciliation` and the hourly campaign sweep are registered at startup; generated items return `contractState`.
- `campaign_crews` (with `crew_id` → `crews`, `leader_user_id`, `display_order`), `campaign_crew_members`, and `campaign_items.assigned_campaign_crew_id` exist.
- The team endpoints (`POST /api/campaigns/:id/crews`, `PATCH /api/campaigns/:id/items/:itemId/crew`, `POST /api/campaigns/:campaignId/items/bulk-assign-crew`) still reject non-extra-billable campaigns with "Crews are only supported on extra-billable campaigns".
- No code creates visits with `source_type = 'campaign_item'` yet.

## Facts (verify)

- **Chemical items today:** the office or chemical manager sets `target_date` per item (`backup_date` is prefilled from it on the item page), `time_window_start/end`, product and applicator, then sends the **pre-notice per item** (`send-pre-comm` / `chemAction: send_pre_communication`). The notice uses target date, backup date, time window, the label (required) and the applicator's license. Steps: `pre_communication → work_in_progress → work_completed → post_communication → completed`, shown as columns on `CampaignDetail.tsx`.
- **Field access today** on general/chemical campaigns is by `campaigns.assigned_to_id` / `assigned_to_id2` only; extra-billable campaigns also allow members of the item's assigned team.
- There is no ordering field on items.
- Visits (`visits`) are one crew, one Colorado day; the Scheduling board draws crew lanes per day and already shows route visits.

## Decisions this slice builds (Randy, Nov 10)

1. **Crew lists on every round**, generated or hand-built (not only extra-billable). One or more crews per round. On generated rounds every team must be linked to a standing crew (`crew_id` NOT NULL); unlinked legacy teams stay allowed only on extra-billable.
2. **Priority order per crew list**, rearrangeable by the office until the property is completed or skipped.
3. **No pre-dated trips.** The round shows on the board as a window per crew. A finished visit is recorded when a property is completed.
4. **New arrivals go to last round's crew** for that service, at the bottom of its list; with no history (or that crew isn't on this round), they land in **Unassigned**.
5. **Fert/chem keeps target date, backup date, time window and per-property notices exactly as today.** The target date stays the only place that date lives. Added on top: set dates for several properties from the crew list at once, and dated properties show on that crew's calendar day.

## 1. Schema

```sql
ALTER TABLE campaign_items ADD COLUMN IF NOT EXISTS crew_position integer;   -- 1 = top of its crew list; NULL when unassigned
CREATE INDEX IF NOT EXISTS campaign_items_crew_position_idx ON campaign_items (assigned_campaign_crew_id, crew_position);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_at timestamp;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_by_id varchar REFERENCES users(id) ON DELETE SET NULL;
```

- Also replace CG1's `visits_campaign_item_open_unique` with **one done visit per item**: `CREATE UNIQUE INDEX visits_campaign_item_done_unique ON visits (campaign_item_id) WHERE campaign_item_id IS NOT NULL AND status = 'done'` (drop the old index if it exists).
- Positions are dense per team (1..n). Every write that changes a list renumbers it inside the transaction.

## 2. Teams on rounds

- Lift the "extra-billable only" checks on the three team endpoints for **all** categories. Keep every other check (company, roles admin/office for team edits, leader in company).
- **Generated rounds:** `POST /api/campaigns/:id/crews` requires `crewId`; `name`/`color` are projected from the standing crew (see `crewProjection.ts` / `crewLinks.ts`), and the leader defaults to the crew's supervisor. Members follow the standing crew's membership as extra-billable linked teams already do; don't create a second roster.
- **Remove a team:** its unfinished items go to Unassigned (positions cleared); completed/skipped items keep the team for history. Fert/chem items keep their target date; one whose pre-notice was already sent shows "Notice sent, no crew" until it's reassigned.

## 3. Assigning and ordering

- `PATCH /api/campaigns/:id/items/:itemId/crew` gains `position` (optional; default bottom).
- `POST /api/campaigns/:campaignId/items/bulk-assign-crew` keeps working and appends in the given order.
- **New:** `PUT /api/campaigns/:id/crews/:crewId/order` with the full ordered list of that team's **unfinished** item ids; rejects ids not on the team or already completed/skipped. Completed and skipped items drop out of the priority order (position NULL) and are listed under "Done".
- **New:** `POST /api/campaigns/:id/copy-split-from/:otherCampaignId` (admin, office): for each unassigned item here, if the same property was on a team linked to standing crew X in the other round and this round has a team for crew X, assign it there in the other round's order. Offered on generated rounds as "Copy crew split from <previous round of this service>".
- **New arrivals (hook into CG2's item-creation helper, used by reconcile):** find the property's item in the most recent earlier generated round of the same `service_key`; if its team's `crew_id` has a team on this round, assign at the bottom; else leave unassigned.
- A property is on **at most one** team per round (it's one item); moving it between crews is a reassignment.

## 4. Starting a round

- **"Start round"** button on a round (admin, office): sets `started_at`/`started_by_id`. Before it's started, crew members don't see the round in their lists; after, they do. It doesn't send messages (you notify crews the way you do today; push to the phone comes with Phase 4).
- Starting is allowed with unassigned items; the button warns "5 properties not on any crew list".

## 5. Who can see and complete what

- Crew members and the leader of a team on a **started** round can open that round, see their team's list in priority order, and complete or skip their items, through the same endpoints and checks extra-billable teams use today. `assigned_to_id`/`assigned_to_id2` access stays as is.
- Reordering, assigning and team edits stay admin/office.
- Chemical actions keep their existing role checks (`chemEmailRoles`, `chemWorkRoles`) unchanged; team membership never lets a crew member send customer notices.

## 6. The round page: crew lists

On `CampaignDetail.tsx`, for rounds with teams, a **Crew lists** view (the default for generated rounds; the existing status columns remain a second view):

- One column per team (crew color, leader), plus **Unassigned**. Cards in priority order; drag to reorder within a column or move between columns; multi-select + "Move to…".
- Column header: **"12 of 18 done · 9 days left"**, and a **Behind pace** badge when the share done is more than 15 points below the share of the window elapsed (Colorado days, window start to end).
- Chips on cards: "Waiting on signature", "No longer in contract" (CG3), and for fert/chem the target date and step (Pre-notice / Notice sent / Work done…).
- Header actions: Add crew, Copy crew split from…, Start round.

## 7. Fert/chem dates from the list

- **"Set dates"** on a crew column: select properties (default: the next N unfinished, undated ones from the top), pick a target date, optional time window. Writes `target_date`, and `backup_date` with the **same rule the item page uses today** (find it in `CampaignItemDetail.tsx`; move it to a shared helper so both use one rule), through the existing item PATCH path so every existing side effect still runs.
- Changing the date of an item whose pre-notice was already sent shows the same warning/behavior the item page has today; don't add new notice logic.
- **Send notices** stays per item, exactly as now. A bulk "Send notices for selected" may call the existing per-item endpoint in sequence and report each result; it must not bypass any check (label required, recipient required, roles).

## 8. The Scheduling board

- **Round bars:** for each started round, in each lane whose crew has a team on it, draw a bar across the visible days inside the round's window: "Shrub trimming – June · 6 left". Clicking opens that crew's list. Bars don't take lane capacity.
- **Fert/chem dated properties:** an item with a `target_date` and a team shows as a card on that crew's lane on its target date (read-only projection of the item; clicking opens the item). Moving it to another day there updates `target_date` through the same path as §7. No planned visit is stored.
- **Queue:** a "Rounds" group listing started or upcoming rounds with **unassigned** properties ("Shrub trimming – June · 5 not on a crew list"), linking to the round page.

## 9. Recording the work

- When an item is **completed** (any existing path: the plain complete, `complete-work` / `complete-work-v2` for chemical, extra-billable flows excluded), insert in the same transaction one visit: `source_type = 'campaign_item'`, `campaign_item_id`, `customer_id` = the property, `crew_id` = the item's team's standing crew (NULL if unassigned), `visit_date` = the Colorado date of completion (`completed_at` / `work_completed_at`), `status = 'done'`, `service_key` = the round's, `title` = the round's title. Route every completion writer through one helper; a test per writer.
- **Reopen** (any path that returns an item to pending or an earlier chemical step): set that visit to `cancelled`.
- **Skipped** items create no visit.
- The Scheduling board shows these done visits like other done visits, so a crew's day shows what it actually finished.

## Tests

- Team endpoints accept general/chemical/irrigation campaigns; generated rounds reject a team without `crewId`; extra-billable behavior unchanged.
- Ordering: reorder renumbers 1..n; completed item leaves the order; moving between teams appends at the bottom unless a position is given; ids from another team rejected.
- New arrival goes to last round's crew at the bottom; no history → Unassigned; previous crew not on this round → Unassigned.
- Copy split assigns only unassigned items and keeps the source order.
- Unstarted round invisible to crew members; started round shows only their team's list; crew member can complete their item, can't reorder, can't send a chemical notice.
- Behind-pace badge math at window start, middle and end.
- Set dates writes target and backup through the shared rule; existing item-page date behavior unchanged (regression test on the item page path).
- Board: round bars only within the window and only in lanes with a team; dated fert/chem items appear on their target day; dragging one changes `target_date`.
- Every completion path creates exactly one done visit; reopen cancels it; a second completion after reopen creates a new done visit; skip creates none.

## Done when

In dev, a generated round can be split between two crews, reordered, started, worked by a crew member, and shows on the board as a window per crew; fert/chem items can be dated from a crew list and notices still send exactly as before; all tests green.

## Before you finish: update STATUS.md

Add one block to `docs/slices/campaigns/STATUS.md` for this slice: date, the migration file it added (or "none"), every new table, column, exported function and endpoint (exact names), any place you deviated from this slice and why, and anything left open. The next slice's pre-flight reads this, so the names must match the code.
