# CG5 pre-flight verification

Date: 2026-11-11. Result: **blocked; implementation not started**.

**Historical result, superseded:** the owner later changed project policy to
task-plan-led requirements. CG5 resumed under that policy and CG4's merge was
subsequently confirmed on fetched main. See [CG5 verification](CG5-verification.md)
for the current outcome; the evidence below records the earlier stop only.

## Required sources

Read the repository slice workflow, complete Campaigns rules and STATUS ledger,
master scheduling design, ownership map, relevant slice-pack memory and actual
CG4 verification/handoff. The required owner-controlled source
`docs/slices/campaigns/CG5-owed-done-calculation.md` is absent.
It is also absent from freshly fetched `origin/main`.

The ledger records that the numbered Campaigns specifications were deliberately
removed. Previous permissions to use assigned task requirements were specific
to their respective slices, including CG4. They do not authorize rebuilding a
CG5 specification or silently implementing from the assigned task summary.
CG5's named pre-flight cannot be executed without its source.

## Predecessor merge gate

Executed `git fetch origin main` successfully. Fetched `origin/main` ends at
`3f4beefa` (CG3); this checkout's HEAD is `a5bb028b` (CG4). The local CG4 ledger
and `docs/scheduling/reports/CG4-verification.md` still say awaiting merge.
The report records CG4 functional verification and its authorization corrections;
those are predecessor evidence, not CG5 checks.

Read-only source checks:

| Check | Result |
| --- | --- |
| `test -f docs/slices/campaigns/CG5-owed-done-calculation.md` | Exit 1: absent locally |
| `git ls-tree --name-only origin/main docs/slices/campaigns/CG5-owed-done-calculation.md` | No entry: absent on fetched main |
| `git cat-file -e origin/main:artifacts/api-server/src/lib/campaignRoundWork.ts` | Exit 128: absent on fetched main |
| `git cat-file -e origin/main:.migration-backup/migrations/0076_campaign_crew_lists.sql` | Exit 128: absent on fetched main |

CG4 code being present in the task checkout does not establish that CG4 merged.
Do not rebuild its recorder, schema or crew-list behavior to bypass this gate.

## Changes and verification boundaries

Only the Campaigns STATUS ledger and this report were changed.
No migrations, tables, columns, functions, endpoints or consumer response
contracts were added. No application code or owner-controlled slice specification
was edited. No database reads/writes, Generate runs, backfills, workflow changes,
production operations or publishing were performed.

Cross-year owed figures, timing/status precedence, route activity, manual-work
separation, authorization and batch loading remain **unimplemented and untested**
for CG5. No passing functional verification or integration handoff is claimed.
Application tests and screenshots are not appropriate for this documentation-only
blocked pre-flight; the source gates above are the verification evidence.

## Required next action

Merge CG4 and make its verified handoff available on main, then supply the current
approved CG5 repository specification. Rerun CG5 pre-flight against both before
implementation. The task remains incomplete.
