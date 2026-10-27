---
name: Migration filename stability
description: Preserve historical filenames even when numeric prefixes collide.
---

Do not rename existing SQL migrations to resolve duplicated numeric prefixes. Allocate a new, unused number for new work.

**Why:** The user explicitly required retaining both pre-existing, duplicate-numbered migrations rather than rewriting their identities.

**How to apply:** Preserve historical filenames when adding migrations; inspect the runner's tracking semantics and document them rather than attempting to repair numbering by renaming files.
