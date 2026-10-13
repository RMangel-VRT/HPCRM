---
name: Visit transaction order
description: Why visits currently serialize company writes before taking deterministic ticket locks.
---

Retain the company scheduling gate before ticket row locks for visit writes, compatibility PATCHes, and startup backfill. Multiple ticket locks must use stable sorted order.

**Why:** A narrower crew-day gate acquired after ticket locking can invert the lock order against reorder, which needs the day's whole ticket set. It also permits append/reorder phantoms unless the day membership is locked. The company gate deliberately trades some parallel throughput for a simple, consistent ordering across these paths.

**How to apply:** Do not replace the company gate independently in one producer. Any finer-grained scheme must coordinate old/new crew days, ticket locks, reorder membership and backfill in one lock order, and prove it with real parallel database tests.
