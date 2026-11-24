---
name: Container query verification
description: Keep responsive estimate layout independent of sidebar width and populated row content.
---

Use native CSS container queries for the estimate section/rail split and narrow row/add controls, rather than viewport rules or measured-width effects.

**Why:** A measured-width implementation passed mocked layout tests and worked while empty, but populated content could retain a wide grid in the narrow sidebar-reduced column and clip the entire rail. Native queries applied the available width before paint and fixed the real-browser failure.

**How to apply:** Verify responsive work with populated sections and expanded/collapsed navigation, measuring actual section/rail rectangles. Mocked jsdom dimensions cannot establish that content fits.

For controlled Chromium measurements on the running CRM, intercept only API
requests, not Vite's module loads. Use the managed dev service directly for the
local check. Routing every module through request interception and the preview
proxy made fresh lazy-route loads time out even when the editor was sound.

Check the workspace's scroll width, not just table or scroller rectangles,
when verifying populated matrices with screen-reader-only cell labels.

**Why:** Absolutely positioned hidden labels can escape an unpositioned
overflow container and enlarge the outer workspace. Long sticky labels can
also obscure every amount column even when horizontal scrolling works.

**How to apply:** Give the table scroller a positioning context, let sticky
labels wrap, and compare outer `scrollWidth` to `clientWidth` at both sidebar
widths.
