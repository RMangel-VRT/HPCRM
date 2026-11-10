---
name: Slice-pack workflow
description: Required repository-first workflow and handoff boundaries for slice-pack tasks.
---

1. One slice per task. The task names the repository rules file, pack `STATUS.md` and slice file by path.
2. Read all three from the repository. Never implement from a pasted or attached copy.
3. Run the slice's pre-flight first. Stop and report any failure; never rebuild a piece an earlier slice owns.
4. Build only that slice. Do not start the next one.
5. Finish by adding the slice's block to the pack's `STATUS.md`, naming exact tables, columns, functions, endpoints, migration file and deviations, and write verification to the area's `reports/` directory.

Slice source files remain user-controlled: do not edit them; Randy replaces them when requirements change.

**Why:** Pack tasks share integration contracts and must see predecessors' actual results instead of relying on chat attachments or assumed interfaces.

**How to apply:** Follow `docs/slices/README.md` for every slice-pack task. If a required pack file is absent, report the missing prerequisite rather than inventing it or silently using an attached version.
