---
name: Task name conflict policy
description: Why Task backfill must not claim unkeyed exact-name custom types.
---

Task conversion and seeding own the stable Task identity. The generic startup backfill must not assign the Task key or capabilities to an unkeyed custom type named exactly Task.

**Why:** A conversion must skip a company that already has a hand-made exact-name Task. Claiming that custom row in a later generic name-based backfill defeats that protection and silently changes a user's workflow.

**How to apply:** Keep Task backfill key-only. Legacy conversion may compare the exact legacy name to discover old rows, but custom Quick Task and unkeyed exact-name Task must not be adopted automatically.