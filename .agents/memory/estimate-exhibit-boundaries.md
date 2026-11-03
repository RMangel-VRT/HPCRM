---
name: Estimate exhibit boundaries
description: Why live exhibit display metadata must stay separate from captured commercial line facts.
---

Keep live palette display defaults outside the immutable commercial line payload. A version may expose separate read-only display metadata for the editor.

**Why:** Catalog deletion can legitimately change a display default, but must not make captured line snapshots appear to have changed. The existing source-deletion invariants deliberately compare those snapshots.

**How to apply:** Future exhibit/template work may use live catalog/enrichment projections without adding their mutable values to commercial line snapshots or recalculating commercial values. Finalized proposal exhibit rows are intentional printed snapshots.

The approved palette intro default applies only to estimate-linked proposals. NULL selects that default; explicit empty text suppresses it. Historical unlinked palettes must not acquire it.

**Why:** The user explicitly corrected the brief's assumption that an intro default already existed and approved the distinction between absent text and deliberately cleared text.

**How to apply:** Preserve null and empty text through validation, editing, preview, and future shared-template rendering.
