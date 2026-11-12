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
interpretation in `docs/estimates/estimate-ticket-integration.md`; do not infer the
effective lifecycle event from the current-version pointer alone.

Estimate follow-up initialization/clearing belongs to an actual linked-ticket
status move, not at-target recovery replay.

**Why:** Reinitializing a send's date on every recovery would keep postponing
customer follow-ups. Clearing a date while already at the acceptance target
could erase a new follow-up that Scheduling legitimately set after the win.
Recovery's field reconciliation and the next section's follow-ups have
different ownership.

**How to apply:** Keep follow-up changes in the combined transition PATCH while
leaving the recovery planner unchanged. Do not add repeated follow-up repair to
at-target retries or duplicate it in individual lifecycle callers.
