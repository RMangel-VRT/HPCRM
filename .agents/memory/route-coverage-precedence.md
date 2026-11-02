---
name: Route coverage precedence
description: Approved precedence when branch and parent contracts overlap for routes.
---

A property's own qualifying contract governs routes. Parent coverage applies only
when no qualifying property contract exists; a service excluded by the governing
property contract must not be restored from the parent.

**Why:** The owner explicitly chose property-contract precedence when the existing
Contract Center list exposed both agreements without choosing a coverage winner.

**How to apply:** Share the coverage resolver with Contract Center. Keep contract
eligibility separate from display selectors that can fall back to unsigned or
historical terms. Do not combine entitlements across property and parent contracts.
