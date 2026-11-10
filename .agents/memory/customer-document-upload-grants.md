---
name: Customer document upload integrity
description: Why customer upload grants are stateless and accepted files cannot share a signed PUT path.
---

Parallel batch uploads must not depend solely on express-session's mutable upload-grant map. Use signed, session-bound grants and a stable idempotency identity for finalization.

**Why:** express-session writes the whole session; concurrent upload-url requests can overwrite each other's grants even when each request explicitly saves successfully.

**How to apply:** Preserve stateless grant validation when extending customer uploads. A final accepted file must be written to a separate private path that never received a signed PUT URL, so a still-valid upload URL cannot overwrite validated content.
