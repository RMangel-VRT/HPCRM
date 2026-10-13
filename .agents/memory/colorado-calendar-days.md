---
name: Colorado calendar days
description: Business-calendar dates must stay Colorado-local even on UTC hosts.
---

Treat Colorado business-calendar days separately from elapsed 24-hour intervals and from the host's timezone.

**Why:** The development host was observed running UTC, despite scheduling helper documentation describing server-local days as Colorado. Evening instants can belong to different dates in UTC and Colorado, and daylight-saving transitions make calendar days differ from 24-hour intervals.

**How to apply:** Verify the runtime timezone when adding calendar-day calculations. Project instants to America/Denver exactly once and compare calendar day numbers for billing age. Resolve each midnight independently across DST, not by adding 24 hours. Date-picker Dates represent selected calendar components, not instants: serialize their browser-local components without Denver projection. Do not globally change the server timezone, because raw PostgreSQL timestamp interpretation could shift stored values.

Keep pure calendar dates as validated strings in OpenAPI contracts; reserve date-time coercion for actual instants.

**Why:** With this workspace's Orval date-coercion configuration, `format: date` plus a regex generated an invalid `ZodDate.regex` call. Date coercion also changes the semantics of crew-day keys.

**How to apply:** Use a `YYYY-MM-DD` string pattern plus real-calendar validation at the API boundary. Generated request and response types should preserve calendar strings rather than turn them into JavaScript Dates.
