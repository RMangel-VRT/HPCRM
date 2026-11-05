---
name: Recurring schedule ownership
description: Permanent boundary after the owner cancelled legacy schedule import
---

The Maintenance planner was removed Nov 2026; Routes (`route_stops`) is the only recurring schedule. Don't reintroduce planner tables.

**Why:** Randy had already built his replacement schedule by hand and explicitly cancelled bringing the old schedule over. Legacy schedule retention is not an app feature.

**How to apply:** Preserve handmade stop identities and values. Visits owns dated trips, crews owns standing identity, and Contract Center owns coverage. This narrow retirement authorization does not authorize unrelated schema drops.
