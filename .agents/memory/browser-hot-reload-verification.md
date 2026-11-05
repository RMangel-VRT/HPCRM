---
name: Browser verification and hot reload
description: Distinguish editor-navigation failures from development hot-reload remounts.
---

Freeze application and locale files during signed-in browser checks of unsaved
drafts. A development hot reload can remount the routed editor and reset local
state independently of the navigation action being tested.

**Why:** Concurrent component/locale edits produced a one-off apparent
section-anchor data-loss failure. With files unchanged, the same anchor flow
preserved the draft and editor root identity. A separate browser Back failure
still reproduced and required an actual router-event ordering fix.

**How to apply:** Inspect Vite messages and setup/network requests around an
unexpected draft reset. Recheck the exact failed action after a fresh load with
files held unchanged; do not dismiss a repeatable failure as hot reload merely
because development tooling is present.
