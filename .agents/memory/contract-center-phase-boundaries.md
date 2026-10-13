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

The Phase 2 API, board/detail screens, create/renew flows, and legacy freeze must merge in that order. The legacy freeze must not merge until the owner confirms the old records are fixed.

**Why:** The user explicitly made sequential merges and the data-fix confirmation conditions of the switch-over, not optional release suggestions.

**How to apply:** Do not start a later slice against an unmerged predecessor, and do not treat successful API verification as permission to freeze legacy screens or run a production copy.

Legacy contract date-picker timestamps represent UTC calendar dates, not Denver instants. Midnight UTC and 06:00/07:00 UTC must recover the same stored calendar day.

**Why:** The user explicitly identified how the old date pickers stored dates; projecting midnight into Colorado would incorrectly move the contract date back one day.

**How to apply:** When importing legacy contract timestamps into date-only season fields, extract UTC components. Do not reuse the Colorado business-day conversion used for scheduling.

Legacy landscape payment months are an annual cycle independent of service months. Repeat that cycle over all inclusive calendar months for terms of at least twelve months; shorter service terms still bill twelve months from their start month.

**Why:** Production preview confirmed that multi-year and seasonal terms are common, and the entered amounts describe the real annual payment pattern. The former date-window/ambiguous-year placement assumption was incorrect.

**How to apply:** Preserve annual price as one cycle's sum, not the multi-year total. Current legacy snow is always time and materials: retain erroneous monthly amounts in notes only. This restriction does not apply to future snow contracts.

Merge legacy landscape and snow only with identical normalized dates and shared signed-document evidence, not dates alone.

**Why:** Randy confirmed that landscape and snow belong to one contract only when they share the same signed document.

**How to apply:** Match object path or filename plus size. Keep different-date or different/missing-document terms separate with two-sided review warnings as specified.

Exercise signed-term editing and lifecycle verification in an isolated development company with disposable users, customers and agreements.

**Why:** Edits to signed contracts deliberately leave attributable history. Using real customer agreements for a browser check would alter their audit trail, and documented development credentials can differ from the accounts in a fork.

**How to apply:** Seed only development fixtures, keep generated login details out of tracked files and logs, and remove the disposable company and users when verification ends. Never reset a real user's password to unblock a test.
