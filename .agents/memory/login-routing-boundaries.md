---
name: Login routing boundaries
description: Preserve login return destinations across the application's top-level authentication branch changes.
---

Login return behavior must be covered at the top-level router, not just the individual protected-route guard or login component.

**Why:** The application chooses separate signed-out and authenticated route trees. A signed-out catchall can discard the requested URL before an individual guard renders; updating the authentication cache can also unmount the login page before its own redirect runs. Isolated component tests passed while both full-app cases still lost the destination.

**How to apply:** Keep every signed-out catchall on the same pathname-plus-search capture rule, and keep a matching login route in the authenticated tree so it uses the same safe destination selector after the auth cache update. Verify the real top-level dispatch, not a test router that always leaves the login component mounted.
