---
name: PDF image-size verification
description: Why repeated flat-color fixtures badly underestimate customer PDF image size.
---

Use distinct high-detail images when measuring a multi-photo document's size,
not repeated tiny or solid-color images.

**Why:** Chromium deduplicates identical image resources. Twenty copies of a
flat-color fixture produced a small PDF dominated by fonts; twenty distinct
high-detail images at the same bounded dimensions produced a much larger PDF.
The first result was not representative of a customer attachment set.

**How to apply:** Keep cheap repeated-image fixtures for page-count and layout
regressions, but use deterministic, distinct high-detail synthetic images for
size evidence without copying customer photos into test fixtures. Report both
embedded dimensions and final byte size, and identify synthetic evidence.
