---
name: Estimate ticket recovery decisions
description: Why recovery reconciles field values at the target, and how merged lifecycle history is interpreted without a failure flag.
---

Estimate lifecycle and ticket lifecycle remain separate. Recovery treats a
committed event's mapped fields as desired state only while the ticket is at
that event's target; at-target retries repair fields without replaying the
status transition. Already-past tickets retain their operational progress.

**Why:** A successful status PATCH followed by a failed field write otherwise
looks complete on reload. A persisted failure flag is explicitly forbidden,
so missing/mismatched mapped field values must participate in recovery. This
necessarily also reconciles manually missing/changed values at that target;
there is no evidence to distinguish them from a failed write.

**How to apply:** Keep the target-status field reconciliation when changing
the panel or builder. Read the event-precedence and single-decline-reason
interpretation in `docs/estimate-ticket-integration.md`; do not infer the
effective lifecycle event from the current-version pointer alone.
