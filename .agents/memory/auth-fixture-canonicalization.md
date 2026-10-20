---
name: Auth fixture canonicalization
description: Avoid misleading password failures when seeding temporary web verification accounts directly.
---

Directly seeded authentication fixtures must follow sign-in identifier canonicalization; use entirely lowercase test email addresses, including random suffixes.

**Why:** A mixed-case generated fixture failed sign-in despite a correct independently verified password hash and active company membership. This looked like a database mismatch but was an identifier mismatch before password comparison.

**How to apply:** When an isolated verification account fails sign-in, first compare its canonical identifier with the login path's normalization. Do not reset an existing user's password to work around a fixture failure. Remove disposable users and memberships after verification.

Do not assume the documented demo login or business records are present in a task fork's development database. If they are absent, use an isolated temporary company and canonical disposable accounts for authenticated verification, then remove the fixtures.

**Why:** A missing documented account has blocked visual verification even though the app's authentication was functioning. Reusing or resetting real accounts would change unrelated user data; an isolated company also makes fixture cleanup unambiguous.

**How to apply:** Confirm absence with a read-only development lookup first. Provision only the minimum data needed for the requested checks; never use production data writes or change an existing user's password to unblock tests.
