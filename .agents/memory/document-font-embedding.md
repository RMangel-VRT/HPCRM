---
name: Shared document font embedding
description: Why Chromium and pdf-lib use different encodings of the same licensed Inter face.
---

Use WOFF2 for Chromium CSS but a losslessly decompressed TTF of the same face
for pdf-lib/fontkit stamping.

**Why:** Fontkit accepted Inter WOFF2 at load time but asynchronously failed
during subset glyph encoding, leaving renders unresolved until their deadlines.
Changing browser launch, fonts-ready waits or timeouts cannot fix that failure.

**How to apply:** Keep the license with both formats and test actual saved PDFs,
not just embedFont. Preserve typography identity when regenerating assets;
do not replace Inter with standard PDF fonts to hide encoding errors.
