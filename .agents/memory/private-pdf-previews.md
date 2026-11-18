---
name: Private PDF preview safety
description: Preserve private-file sandbox headers while making compliance-document previews usable.
---

Render private PDFs as PDF.js canvas pixels rather than using the browser's PDF-plugin iframe. Keep the authorized file route's `Content-Security-Policy: sandbox` response.

**Why:** Chromium blocked a valid authenticated PDF inside the sandboxed iframe even though downloading the same bytes worked. Removing the sandbox would weaken the deliberate untrusted-document boundary.

**How to apply:** Fetch bytes through the company/visibility-checking no-store route, render only pixels, and destroy the renderer when document/company scope changes. Image blob URLs must be short-lived and revoked. Do not replace authorization with signed object URLs.
