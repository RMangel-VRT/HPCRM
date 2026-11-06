---
name: Contract-stated rates
description: Exact contract rate lists, card fallback boundaries, and signed-PDF re-audit requirement.
---

Read `attached_assets/Pasted--CC2-17-A-season-s-rates-are-exactly-the-rates-its-cont_1793988145429.txt` before changing contract rates. The user's rule is “Every contract is unique in the rates and billings that are included.” A season contains only explicitly supplied contract rates, in contract order, including label, unit, minimum and price or price text. Empty input means no stated rates. The company rate card is a picker/pre-fill and fallback for unstated keys, not an automatic source of contract rows. Subsequent card changes never rewrite a season's agreed rates.

**Why:** Copying all applicable card rows made contracts appear to state rates absent from their signed documents.

**How to apply:** Creation, exact-list replacement, imports and renewals must preserve this boundary. Renewals carry the source rows and prices unless an explicitly supplied replacement list is provided. “Start from the card” is a user-controlled editor action, not implicit persistence. Estimate fallback must retain governing-season selection; no older negotiated term may be revived.

Existing rows cannot be safely classified as stated versus copied in code. No migration, backfill, automatic cleanup or conversion is authorized. After an approved publication, current/upcoming seasons require signed-PDF re-audit and explicit replacement of their rates. Editable seasons include signed in-effect seasons under the existing editability rules; each replacement records one added/removed/changed history entry.

**Why:** The historical rows lack evidence distinguishing physical-contract terms from copied defaults.

**How to apply:** Leave existing season data untouched during implementation. Keep production re-audit and repair separate from code delivery. Display every stated rate, not only deviations from the card; present unstated card rates separately as collapsed “Standard rates (not in this contract)”, billed at standard rates unless agreed otherwise. The uploaded brief marks the work urgent and next in queue, but reference intake itself does not reorder tasks or publish.
