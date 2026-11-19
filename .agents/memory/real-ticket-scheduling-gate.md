---
name: Real ticket scheduling gate
description: Why ticket status intent, legacy mirrors and estimate lifecycle events are not scheduling authority.
---

For Task, Project and Estimate Request workflows with a stable Scheduled step, entering Scheduled requires a planned or in-progress visit. From New or Needs scheduling, a direct jump beyond Scheduled requires the dedicated, reasoned skip action. These rules apply to automation and administrators as well as ordinary ticket edits.

**Why:** Explicit status intent used to move a job out of the queue without putting it on a crew's schedule. A legacy crew/date mirror or closed visit does not prove that a job will reach a crew. An estimate's commercial lifecycle is independent of the operations workflow.

**How to apply:** Keep new status writers behind the same transactional gate and company-before-ticket lock order. Treat explicit placement and skip as distinct actions; never infer authority from a PATCH note or a lifecycle callback. Verify unplaced Scheduled rows before any startup synthesis so a legacy mirror cannot mask them.

For legacy edits, unchanged crew and Colorado calendar day are not placement, regardless of how much closed stop history exists. A browser can resubmit the same day using a different noon instant, so comparing timestamps can misclassify an unrelated edit.
