---
name: Scoped dependency peer resolution
description: Avoid unrelated workspace changes when resolving peers for a scoped package addition.
---

Treat temporary automatic peer resolution as a workspace-wide operation, even when the install command targets one package.

**Why:** Resolving missing testing-library peers with automatic peers enabled also changed unrelated mobile peer metadata and frontend toolchain resolutions. A scoped command alone did not keep the dependency change scoped.

**How to apply:** Compare lockfile importer and snapshot contents with the baseline, retain only the added packages' necessary dependency closure, preserve the project's existing automatic-peer policy, and confirm a frozen-lockfile install succeeds. Necessary peers may be resolved transitively without adding extra direct development dependencies.

Compare parsed package/snapshot values, not only textual placement: restoring
existing entries can reorder a lockfile without changing its resolutions.
**Why:** Textual removals/reinsertions can otherwise hide an unrelated peer
resolution change or be mistaken for one.
