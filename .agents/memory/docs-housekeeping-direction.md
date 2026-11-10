---
name: Documentation housekeeping direction
description: Uploaded H2 docs reorganization brief and preservation boundaries, not a record of implementation.
---

The user supplied `attached_assets/Pasted--H2-Tidy-the-docs-tree-and-set-up-slice-packs-Housekeep_1794339585520.txt` as the H2 reference. It calls for docs/agent-note housekeeping before CG1: area folders with standing references at their roots, evidence and evidence scripts under area `reports/`, and canonical slice packs under `docs/slices/<pack>/`. Receiving the brief does not establish that this reorganization has happened.

**Why:** Loose references and chat-only slice packs can leave queued tasks without shared rules/results; moving documents can also break code comments, memory links and evidence scripts.

**How to apply:** When execution is requested, enforce the brief's clean-tree preflight, preserve existing slice-pack contents untouched, move without renaming, classify new files by the stated rules, fix absolute and relative references everywhere, and distinguish pre-existing missing paths from regressions. No behavior, schema, routes, UI or production change is in scope.

The intended slice-pack workflow is one slice per task, naming and reading repository rules, STATUS and slice files; stop on failed preflight, never rebuild an earlier slice's ownership, build only the named slice, then record exact integration details/deviations in STATUS and write area verification evidence. The slice source files remain user-controlled and are not edited by implementing tasks.

**Why:** Future slices need a stable shared source and explicit handoff instead of relying on pasted text or invented predecessor interfaces.

**How to apply:** H2 must create the requested repository guidance and report before claiming the workflow/tree is installed. Keep this reference note separate from the implementation's required slice-pack workflow note.
