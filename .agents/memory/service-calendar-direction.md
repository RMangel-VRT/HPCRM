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
