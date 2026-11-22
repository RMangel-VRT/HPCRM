---
name: Phone sign-in identity
description: Nullable user email is intentional for accounts that sign in by phone.
---

Keep email nullable for user accounts. Treat the original historical bootstrap's
email `NOT NULL` declaration as obsolete rather than replaying it or changing
current definitions to match it.

**Why:** The user confirmed that people who sign in with a phone number do not
have to have an email address.

**How to apply:** When reviewing schema parity or updating authentication
fixtures, do not require an email or invent placeholder addresses for phone-only
users. Check that email-based sign-in still works for accounts that have one.
