---
name: Colorado calendar days
description: Business-calendar dates must stay Colorado-local even on UTC hosts.
---

Treat Colorado business-calendar days separately from elapsed 24-hour intervals and from the host's timezone.

**Why:** The development host was observed running UTC, despite scheduling helper documentation describing server-local days as Colorado. Evening instants can belong to different dates in UTC and Colorado, and daylight-saving transitions make calendar days differ from 24-hour intervals.

**How to apply:** Verify the runtime timezone when adding calendar-day calculations. For billing age, explicitly project instants to America/Denver before shared local-date formatting and compare calendar day numbers. Do not globally change the server timezone as an incidental billing change, because other scheduling behavior must remain intact.
