---
name: Contract Center seasonal history and rollout
description: Business rules for preserving seasonal contract history and legacy behavior during the staged rebuild.
---

An agreement represents one customer and one contract line; each season has a separate term with its own scope, rate snapshots, billing, documents and history. Renewals must never overwrite a past season.

**Why:** The Contract Center requirements explicitly preserve historical seasonal terms rather than treating renewal as an edit to the previous contract.

**How to apply:** Later renewal and editing work must target the intended term, creating a new term for a new season instead of mutating past-season data.

The foundation, rate-card and legacy-copy slices are additive only. Existing contract screens, endpoints, builder and reports continue to use legacy records until the planned later switch-over.

**Why:** The user specified a staged rollout, with each foundation slice merged before the next begins; introducing shared behavior changes early would invalidate that separation.

**How to apply:** Keep new catalogs and new records independent of the legacy service catalog and contract definitions. In particular, the new standard cleanup quantities are intentionally supplied separately, not a request to revise the legacy defaults.

Legacy contract date-picker timestamps represent UTC calendar dates, not Denver instants. Midnight UTC and 06:00/07:00 UTC must recover the same stored calendar day.

**Why:** The user explicitly identified how the old date pickers stored dates; projecting midnight into Colorado would incorrectly move the contract date back one day.

**How to apply:** When importing legacy contract timestamps into date-only season fields, extract UTC components. Do not reuse the Colorado business-day conversion used for scheduling.

Legacy billing month numbers have no year. Treat partial months as overlapping a term, and do not guess when the same calendar month overlaps both edge years.

**Why:** A mid-month November-to-November season includes parts of two Novembers. Choosing only the first day inside the term silently assigns the old charge to the later year; excluding a unique partial starting month loses its amount.

**How to apply:** Resolve unique overlapping calendar months; flag ambiguous years for review and retain their unplaced amount in readable notes rather than assigning it to either year.
