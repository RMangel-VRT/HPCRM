---
name: Service calendar direction
description: Named service windows, standard-round counts, service classification changes and SC1 safety boundaries.
---

Read `attached_assets/Pasted--SC1-The-service-calendar-replaces-month-based-Service-_1794432695181.txt` when planning the service calendar. The November 11, 2026 brief replaces month/count-based Service timing with company-owned named rounds, opening dates and deadlines. Assigned task plans are primary; inspect actual code and predecessor handoffs. Reference intake alone does not authorize implementation or task creation.

**Why:** The user times services as named windows rather than counts per month. The brief states that timing rows and production generation have not been used; verify that dated assertion before any retirement.

**How to apply:** SC1 covers catalog, persistence, settings and scope-editor changes only. SC2 changes generation; SC3 handles the customer schedule. Do not expand SC1 into those later slices or reinstate repository-only specification gates.

Contract counts and stated months always win. The calendar fills only silent contract details and never writes timing back to contracts. The standard count is the number of rounds marked in the standard, not an independent count. Windows use month/day without a year and may cross New Year; reject February 29 and equal opening/deadline dates. Preserve row identities through editing and ordering because later generated rounds reference them.

**Why:** Separate timing ownership avoids rewriting signed obligations; stable identities prevent later generation links from breaking.

**How to apply:** Use one company calendar owner and atomic, company/service-locked replacement of ordered entries. Allow clearing every standard only explicitly, with a warning that blank-count contracts then become gaps. Starting-calendar loading is an explicit admin action into an empty company calendar, not automatic seeding or a production operation during this slice.

Fertilization and broadleaf weed control become separately counted services. Existing combined chemical scope stays readable as legacy; never rewrite it automatically. A user-confirmed Split prefills fertilization with the old count and broadleaf blank, persisting nothing until save. Native full mowing becomes counted spring/fall rounds; beauty bands remain recurring. Backflow is an annual checklist, never pre-dated onto crew days or the customer schedule. Recurring and on-request displays do not change Routes.

**Why:** The user distinguishes separately owed treatments, full native mowing versus recurring bands, and completion checklists versus scheduled trips.

**How to apply:** Retain existing chemical lines on renewal unless explicitly edited, hide legacy chemical from new-service selection, and flag legacy combined counts for review. Preserve the exact starting windows and recurring descriptions from the full brief rather than guessing.

Retiring the former timing table is narrowly permitted only when a migration verifies it has zero rows. If populated, stop and report rather than dropping or converting data. No production calendar load is authorized.

**Why:** The replacement depends on the old configuration being unused, not permission to delete entered company data.

**How to apply:** Keep the empty-table guard and production boundary explicit in any task plan. Update ownership references and document removals when implementation is authorized.

The replacement endpoint accepts every kind permitted for a service, not one kind per service. Native areas has spring/fall full-mow rounds and a recurring beauty-band entry simultaneously. Positions are independent per kind, matching company/service/kind/position uniqueness; every row still requires kind/service compatibility validation.

**Why:** The user explicitly resolved the brief's one-kind wording, which would otherwise exclude required native-area entries.

**How to apply:** Preserve mixed-kind rows and stable IDs across edits and UI sections; do not overwrite recurring rows when editing rounds or enforce service-wide position uniqueness.

During the SC1-to-SC2 transition, retiring the old timing owner must give the existing demand engine, reconcile and customer fulfillment an empty program list. They keep compiling/running, while seasons formerly relying on program timing show gaps in Generate preview. No calendar-based generation belongs in SC1. The user confirmed on November 11, 2026 that Generate has never run in production.

**Why:** The user approved a bounded compatibility transition rather than keeping retired-table reads or implementing SC2 early.

**How to apply:** Replace old program loading with empty inputs in all three consumers, preserving contract-stated timing, recorded-work protections and safe gap behavior. Do not infer authorization to run Generate or load production data from this historical fact. Only an explicitly authorized later slice may introduce calendar-based allocation.

The owner's contract-year rule is that a round belongs to the season containing
its deadline, not a season overlapping its opening window. In particular an
October–September season owes the preceding fall shrub trim, not a second fall
trim at its end. Backflow quantities describe devices, not repeated annual trips.

**Why:** The November 11 calendar brief explicitly resolves the disputed extra
fall trim and distinguishes annual checklist fulfillment from service counts.

**How to apply:** Preserve deadline-based ownership across later customer
schedule/reporting work, including mid-month season boundaries and windows
opening in the preceding year. Do not turn annual checklist device quantities
into scheduled crew-day trips.
