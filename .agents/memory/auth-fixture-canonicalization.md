---
name: Auth fixture canonicalization
description: Avoid misleading password failures when seeding temporary web verification accounts directly.
---

Directly seeded authentication fixtures must follow sign-in identifier canonicalization; use entirely lowercase test email addresses, including random suffixes.

**Why:** A mixed-case generated fixture failed sign-in despite a correct independently verified password hash and active company membership. This looked like a database mismatch but was an identifier mismatch before password comparison.

**How to apply:** When an isolated verification account fails sign-in, first compare its canonical identifier with the login path's normalization. Do not reset an existing user's password to work around a fixture failure. Remove disposable users and memberships after verification.
