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
