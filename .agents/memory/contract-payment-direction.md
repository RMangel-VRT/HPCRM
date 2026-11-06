---
name: Contract fees and exact payment schedules
description: Fee separation, explicit dated payments, annual versus total semantics, and production-repair boundaries.
---

Read `attached_assets/Pasted--CC2-18-Fee-payment-lines-and-payment-schedules-that-ma_1793997001619.txt` before changing contract payments. The November 6, 2026 brief is marked “Run next”; reference intake does not itself reorder tasks, implement or publish.

Fee components are billed but excluded from contract annual price and billing-type classification. Show fees separately, with a computed annual fee total. All rows in a component share its fee flag. Renewal increases and target annual amounts apply only to non-fee components; fees carry unchanged. Snow T&M still forbids contract payments but permits fee components. CSV import/export round-trips the fee flag.

**Why:** Recurring fees are additional charges, not part of the signed contract price; combining them inflated displayed contract values.

**How to apply:** Check contract headers, Payments, Customer Billing Revenue, active-customer views and dashboards. Keep fee and contract totals separate, including mixed-priced/T&M displays.

Contracts may use repeating monthly patterns or explicit dated payment rows. Explicit schedules store exactly the supplied rows and never re-expand on date changes. Validate month-first dates, nonnegative amounts, unique component/month pairs and term bounds. Up to two months before the start are allowed only with explicit `allowPreStart` authorization and history. Reject date edits that would invalidate explicit rows, listing those rows.

**Why:** Multi-year contracts can contain nonrepeating schedules and legitimate payments preceding service start; shifting dates or repeating a pattern changes the signed obligations.

**How to apply:** Explicit annual contract value is the non-fee sum in the first twelve months beginning with the start month; contract total is the non-fee sum over all stored rows, returned for every season. Preserve dated CSV months. Explicit-season renewal requires rebuilding the schedule, prefilled from the source's first twelve months as a pattern; never copy old dated rows forward.

The brief requests additive schema fields with existing rows defaulting to non-fee/pattern, but no data backfill. Named fee corrections and the example eighteen-month schedule load are separate post-publication operations requiring the user's approval. The proposed migration number is a dated reference, not permission to overwrite an existing migration.

**Why:** The user explicitly reserves production data repair for after publishing and with their OK.

**How to apply:** Keep reference handling, implementation, schema publication and real customer-data changes separate. Read the full brief's fixtures and acceptance checks before implementation; do not silently normalize ambiguous fee or pre-start renewal semantics.
