---
name: PDF decoration preservation
description: Preserve text state and legacy proposal pagination during shared PDF branding changes.
---

PDFKit graphics save/restore is not enough to protect body typography when page decorations draw text. Explicitly restore the intended body font, size, fill and cursor, with a recursion guard.

**Why:** Footer text leaked into body rendering on automatic page breaks. Independently rendered proposal exhibits already depended on that legacy overflow typography; normalizing it during extraction changed existing caption geometry and raster output.

**How to apply:** Treat proposal rendering as pixel-sensitive. Keep legacy exhibit overflow state distinct from new document defaults unless a proposal restyle is explicitly approved. Compare independently rendered/merged exhibit pages, not just the main document.
