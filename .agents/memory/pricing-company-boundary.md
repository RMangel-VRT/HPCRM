---
name: Pricing company-switch boundary
description: Why company-aware browser caches alone do not isolate requests during active-company session switches.
---

Pricing requests should carry the company they were initiated for, and the server
should reject that request if it no longer matches the session's active company.
Keep authorization based on the session, not the supplied company.

**Why:** active-company selection is mutable session state. A queued old-company
request can reach the server after a switch, otherwise reading or creating
new-company data under the old browser operation. Query keys and ignored late
responses protect display state but cannot prevent a misdirected write.

**How to apply:** preserve this expected-company guard for catalog/pricing
requests. Scope cache keys and transient UI state by company, user and role too;
the request guard and client isolation solve different parts of the race.
