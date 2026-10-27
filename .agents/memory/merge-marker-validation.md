---
name: Merge marker validation
description: False positives from decorative source comments during merge continuation
---

The merge continuation check can reject a resolved source file if an existing
comment contains seven or more consecutive equals signs, even with no actual
conflict blocks remaining.

**Why:** A route-registration merge was fully resolved, but the continuation
check still reported markers because of pre-existing section-heading comments.
Replacing only those decorative separators with dashes allowed continuation.

**How to apply:** If continuation reports remaining markers after the actual
conflict blocks are gone, search the whole file for marker substrings, including
inside comments. Preserve functionality and replace only decorative separators
that cause the false positive.
