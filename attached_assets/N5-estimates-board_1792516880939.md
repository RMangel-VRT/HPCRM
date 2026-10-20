# N5: Estimates board

> Assumes `00-RULES-N.md` and N1–N4. **Line numbers are from GitHub `a77f060`**; find code by its content. **No schema change.**
>
> What bites hardest here:
> - **This is a view of existing tickets, not a new list** (Randy's one-source-of-truth rule). Nothing new is stored.
> - **Stages come from `statusKey` only.**
> - **Never use `storage.getTickets()`.** It scans every ticket in the company and filters in memory. Query the open estimate tickets directly.

## What Randy gets

Under **Business**, a new first item: **Estimates / Estimados**. It shows every bid that's still open, grouped by stage. Once a customer approves and the job moves to Needs scheduling, it leaves this board and lives in Work like any other job.

## 1. Server: `GET /api/estimates/board`

**Where:**
- A new module, `routes/estimatesBoard.ts`, exporting `registerEstimatesBoardRoutes(app)`.
- Register it next to `registerDashboardQueueRoutes(app)` (routes.ts ~L2628).
- **Guard:** authenticated, and `activeRole` is admin or office. Otherwise 403.

**The query:**
- Resolve the company's ticket types with `findSeededTicketType` for `estimate_request` and `rfp_request`.
- Resolve their statuses (`getTicketTypeStatuses`) and keep only the open-bid statuses below, matched **by `statusKey`**.
- Then make **one** query: `tickets` where `companyId = user.activeCompanyId` and `currentStatusId IN (those ids)`.
- Bulk-load the customers (`getCustomersByIds`) and the assignee names. No per-row queries.

**Stages:**

| Stage key | en / es | Estimate Request `statusKey`s | RFP Request `statusKey`s |
|---|---|---|---|
| `new` | New / Nuevo | `new` | `new` |
| `estimating` | Estimating / Estimando | `estimating` | `reviewing`, `waiting_info`, `site_visit` |
| `proposal` | Proposal / Propuesta | `proposal_draft` | `proposal_draft` |
| `sent` | Sent / Enviado | `proposal_sent` | `proposal_sent`, `awaiting_response` |
| `decision` | Decision / Decisión | `decision_received` | `decision_received` |

Keep the stage map in one exported constant, `ESTIMATE_STAGES`. Statuses after Decision (Needs scheduling onward, Awarded onward, Closed – Lost) are not on the board.

**Days in stage:** for each ticket, the `createdAt` of its latest `ticket_status_history` row whose `toStatusId` equals the current status. Get them all in one grouped query over the ticket ids. If there's no history row, use the ticket's `createdAt`. Count whole Colorado calendar days with `lib/companyDay` (F2); never use `setHours` or ISO slicing.

**Response:**

```ts
{ stages: { key: StageKey; tickets: {
    id: string; title: string; typeKey: "estimate_request" | "rfp_request";
    statusKey: string; statusName: string;
    customer: { id: string; name: string } | null;
    assignee: { id: string; name: string } | null;
    priority: string; estimateNumber: string | null; daysInStage: number;
  }[] }[] }
```

- Every stage is present, even when empty.
- Tickets in a stage are sorted with the most `daysInStage` first.
- `?type=estimate_request|rfp_request` filters the board. Anything else is ignored.

**Tests (vitest):**
- One Estimate Request in each of the five stages lands in the right column.
- A ticket at `ready_to_schedule` or `closed_lost` is absent.
- An RFP at `awaiting_response` goes to `sent`, and one at `awarded` is absent.
- Another company's tickets never appear.
- `daysInStage` runs under `TZ=UTC` and `TZ=America/Denver`: a status entered at 11 pm Colorado time yesterday is 1 day.
- `field_manager` gets 403.
- The query count does not grow with the number of tickets.

## 2. Client: `pages/EstimatesBoardPage.tsx`

- **Route:** `/dashboard/estimates`, allowed admin and office.
- **Rail (`SectionRail`):** the title is "Estimates," with one section:

  | Item (en / es) | Filter |
  |---|---|
  | All bids / Todas las ofertas | none |
  | Estimate requests / Solicitudes de estimado | `?type=estimate_request` |
  | RFPs / RFP | `?type=rfp_request` |

- **The board:** five columns, matching the stage keys, each headed with its count. Columns scroll sideways on narrow screens.
- **Each card shows:**
  - the title;
  - the customer name;
  - `TicketTypeBadge` (`components/TicketIdentity.tsx`) with the type hue on the card's left rail, following the ticket visual system (`shared/ticketVisuals.ts`);
  - the assignee;
  - the estimate number, if there is one;
  - **"N days"** in stage, in the warning color at 7 days or more.
- **The whole card is a link** to `/dashboard/tickets/:id`.
- **No drag and drop.** Status changes keep happening on the ticket, where the Proposal Maker dialog and the required fields live.
- **Empty state:** "No open bids." / "No hay ofertas abiertas."

## 3. Sidebar

- In `navConfig.ts`, add `estimates` as the **first** item in Business: href `/dashboard/estimates`, visible to admin and office.
- Update `navConfig.test.ts`, including the route-permission check.
- The model also lists Calendar; it still doesn't appear (rule 7).

## i18n

- `nav.estimates`
- `estimates.stage.{new,estimating,proposal,sent,decision}`
- `estimates.all`, `estimates.requests`, `estimates.rfps`, `estimates.days` ("{{count}} days" / "{{count}} días"), `estimates.empty`

## Report

- A screenshot of the board with dev data, in light and dark mode.
- A screenshot of each filter.
- The query count from the test.
