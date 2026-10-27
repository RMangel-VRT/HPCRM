---
name: Data ownership policy
description: User-supplied ownership and retirement rules, including deliberately separate facts.
---

Read `attached_assets/Pasted--High-Plains-CRM-Data-ownership-map-The-rule-every-fact_1793114169866.txt` before planning data consolidation or retirement. It defines intended owners and allowed copies; its status column and drift counts are dated observations, not verified current state.

Also read `attached_assets/Pasted--Data-ownership-consolidation-rules-paste-once-at-sessi_1793114190500.txt`. It requires reading the audit and ownership map before planning and applies the ownership rule to every future slice, not just the consolidation pack.

Every fact has exactly one owner. Other copies must be intentional frozen snapshots or automatic mirrors maintained by one named function. Independently mutable duplicates with no reconciliation are bugs.

**Why:** The user supplied this as the governing ownership map for staged consolidation.

**How to apply:** Identify whether each apparent duplicate is a separate fact, a snapshot, or a mirror before changing it. Preserve completed-work crew history, negotiated signed-term prices/scope, and other intentional snapshots.

Retire holders in this order: choose the owner, copy data into it, switch every reader and writer, freeze the old holder by rejecting writes, and drop only after a full season with no readers. Never drop first. The map separately identifies empty dead-table candidates requiring confirmation at a publish; their listing alone does not authorize deletion or publishing.

**Why:** Consumers and seasonal workflows may still rely on old data after replacement screens ship.

**How to apply:** Audit all consumers, including mobile and reporting, before freezing or dropping. Treat the upload's planned ownership as direction, not proof that migration is complete.

Campaign team membership is deliberately distinct from standing crew identity. Other reviewed distinctions include rates versus term snapshots, template families, message history versus mailbox import, notes/photos by source, equipment tickets, seasons versus term dates, and documents.

**Why:** The ownership review explicitly kept these separate as different facts rather than contradictions.

**How to apply:** Do not merge these merely to reduce table count. Revisit only under a separately scoped decision.

Plans must name the owner before adding any table or column, classify each copy, and label intentional snapshots in code comments. Freeze old write paths with HTTP 409 and a message pointing to the editing destination. No table or column drops are allowed anywhere in this consolidation pack; destructive diffs require their own later reviewed slice.

**Why:** The user explicitly supplied stricter pack-wide safety requirements following a prior destructive publication proposal. These override any suggestion in the map that dead tables could simply be removed at a publish.

**How to apply:** Permit only additive schema changes with guarded numbered migrations and synchronized server/client schemas. Data steps must be guarded, idempotent DML through the actual route-registration path, not the unwired startup runner. Use stable identities, provided-field patch semantics, company scoping, bulk lookups and Colorado dates. Production evidence must be read-only and exclude customer data; report changed files, call sites, Vitest results, baseline failures and typecheck delta. Integrate UI into the navigation structure that actually exists.
