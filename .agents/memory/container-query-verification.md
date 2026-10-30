---
name: Container query verification
description: Keep responsive estimate layout independent of sidebar width and populated row content.
---

Use native CSS container queries for the estimate section/rail split and narrow row/add controls, rather than viewport rules or measured-width effects.

**Why:** A measured-width implementation passed mocked layout tests and worked while empty, but populated content could retain a wide grid in the narrow sidebar-reduced column and clip the entire rail. Native queries applied the available width before paint and fixed the real-browser failure.

**How to apply:** Verify responsive work with populated sections and expanded/collapsed navigation, measuring actual section/rail rectangles. Mocked jsdom dimensions cannot establish that content fits.
