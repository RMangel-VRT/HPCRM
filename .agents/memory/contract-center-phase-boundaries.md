---
name: Contract Center seasonal history and rollout
description: Business rules for preserving seasonal contract history and legacy behavior during the staged rebuild.
---

An agreement is one customer's continuing contract relationship; each season records its own line (Landscape, Snow or Both) and form, because each season is its own signed document. Renewals must never overwrite a past season.

Line and form exist only on `agreement_terms` (CC2-10 dropped the agreement columns).

**Why:** The Contract Center requirements explicitly preserve historical seasonal terms rather than treating renewal as an edit to the previous contract.

**How to apply:** Later renewal and editing work must target the intended term, creating a new term for a new season instead of mutating past-season data.

Imported historical seasons remain independent renewal-set members, even when their predecessor chain was inserted in one transaction. A multi-year set needs positive, matching year/range creation-note evidence for every member, in addition to chain and exact transaction timestamp equality. Explicit document coverage does not imply renewal-set membership.

**Why:** Audit import and legacy Copy also insert multiple historical seasons in one transaction; chain plus timestamp alone would wrongly remove their independent status and signed-document controls.

**How to apply:** Do not treat missing multi-year creation notes as permissive evidence of membership. Ordinary imported histories must remain one-year sets.

Parent-owned Contract Center agreements may cover direct branches while both parent and branch retain their own agreements. This exception does not relax operational parent restrictions.

**Why:** The owner has one signed bank agreement covering multiple branches, but those branches must remain separate operational customers for tickets, crews and scheduling.

**How to apply:** Keep the agreement on its actual owner. Show inherited coverage on direct branch pages only. Payment-line prefix matches against branch names or customer numbers are display hints, never billing ownership or allocation rules.

The foundation, rate-card and legacy-copy slices are additive only. Existing contract screens, endpoints, builder and reports continue to use legacy records until the planned later switch-over.

**Why:** The user specified a staged rollout, with each foundation slice merged before the next begins; introducing shared behavior changes early would invalidate that separation.

**How to apply:** Keep new catalogs and new records independent of the legacy service catalog and contract definitions. In particular, the new standard cleanup quantities are intentionally supplied separately, not a request to revise the legacy defaults.

The Phase 2 API, board/detail screens, create/renew flows, legacy freeze and audit import must merge in that order. The revised audit-import rules supersede the old data-fix-before-freeze and immediate-Copy gates.

**Why:** The revised authoritative requirements require frozen legacy records throughout the document audit, rather than repairing mutable records before freezing them.

**How to apply:** Do not start a later slice against an unmerged predecessor. Merge freeze before audit import, publish both together with owner approval, then export/audit/review/import. Never run Copy as the migration step.

An agreement's import reference does not imply that all its seasons or documents
belong to the audited upload. Post-audit renewals can share an imported agreement.
**Why:** Cascading replacement of that agreement would otherwise delete additions
that the auditor deliberately skipped.
**How to apply:** Protect non-imported seasons and direct document attachments
before replacing an imported agreement, including after acquiring write locks.

After the customer switch-over, dashboard metrics other than renewal lists, revenue, reports, tickets, snow events and the crew app intentionally continue reading frozen legacy data until their separate repointing slices.

**Why:** The owner explicitly requires the switch-over and downstream repointing to be separate releases; mixing them changes the copied billing state and expands the release risk.

**How to apply:** Keep those legacy consumers unchanged during the freeze. Production publication, signed-document auditing and imports are manual. Contracts created or renewed in Contract Center during the audit are skipped by the auditor and left untouched by imports.

Renewals come from the Contract Center (`loadRenewalsDue`); the legacy contracts table is frozen and must not feed the dashboard.
**Why:** Renewal eligibility and destinations belong to agreements and their current seasons, not frozen legacy contract IDs.
**How to apply:** Repoint renewal lists only; revenue, reporting, snow statistics and other legacy metrics remain separate work.

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

Payment preset rounding differs deliberately: twelve equal payments floor the first eleven shares; equal-over-selected-months rounds each ordinary share. Both reconcile the final paid month in start-month cycle order.

**Why:** The authoritative examples require $10,000 to become $833.33 × 11 + $833.37, but $2,400 over March–September to become $342.86 × 6 + $342.84. A single shared division-rounding rule cannot satisfy both examples.

**How to apply:** Preserve each preset's rounding convention and use calendar-indexed amounts; choose the final participating month from the term's cycle order, not the order of checkbox selection.

Imported multi-year agreements can be signed once for several stepped-price
seasons; all predecessors, including future predecessors, may already be stored
as renewed. Do not normalize those future seasons to signed for display tests.

**Why:** The current-season specification's simplified example says future years
are signed, but its explicit status rules and the owner's clarified acceptance
criteria require preserving realistic imported statuses and historical guards.

**How to apply:** Verify display behavior with renewed predecessors and a signed
final season. Keep display selection separate from renewal intent; an explicit
import source must not be replaced by whichever season is current.

Renewed field-edit restrictions were explicitly superseded: draft/sent seasons
are editable, and signed/active/renewed seasons remain editable through their
inclusive Colorado end date, including future seasons. This does not transfer
renewal-set status ownership away from year one.

**Why:** The owner clarified on October 29, 2026 that an in-effect renewed season
and a future signed season must not be treated as past/read-only merely because
another season is current or already signed.

**How to apply:** Keep field editability independent from display-current
selection and year-one-only lifecycle moves. Imported coverage is never inferred.

Retiring legacy agreement-level line/form requires removing their schema declarations and applying the column drops in the same change. Until that cleanup lands, the nullable agreement copies remain part of the declared shape; seasonal values remain authoritative.

**Why:** The owner clarified that the season backfill only relaxed the original columns to nullable. Dropping them outside the migration/declaration change caused shared development drift and blocked unrelated work; it was not fork staleness.

**How to apply:** Keep the Contract Center cleanup's schema edits and guarded drop migration together, and validate schema drift against that matching pair. Never remove the development columns ahead of the declarations or introduce an unrelated repair migration.
