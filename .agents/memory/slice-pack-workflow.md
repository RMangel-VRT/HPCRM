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

A prerequisite's merged task status does not refresh an already-running successor's
checkout. Fetch the actual GitHub `origin/main` before concluding that the merged
implementation is absent; integrate its handoff without overwriting local work.

**Why:** A successor retained its original audit-only base after its prerequisite
merged, making repeated local pre-flights report obsolete missing-code failures.

**How to apply:** Verify the latest fetched source and handoff separately from the
task status. A successful prerequisite merge does not waive a successor's separate
specification-revision gate; obtain explicit owner authorization for that deviation.

The owner deliberately kept the obsolete numbered Campaigns slice documents
removed and separately authorized building campaign demand/generation,
contract-driven membership, and crew-list/calendar work from their assigned task requirements. Each exception
was approved after its own source gate stopped work. Do not restore those old
specifications.

**Why:** The checked-in versions predated the reviewed count/status/gap decisions;
restoring them would reintroduce the version ambiguity the owner removed.

**How to apply:** For subsequent Campaigns work, obtain the current owner-approved
requirements and actual predecessor handoff. Do not treat this one-slice source
authorizations as approval to invent or automatically begin later slices.
