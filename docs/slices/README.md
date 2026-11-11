# Slice packs

## Current workflow

Follow the [approved-task-plan workflow](../../replit.md#working-from-approved-task-plans).
The task plan refined through user discussion and codebase investigation is the
working implementation specification, approved through the normal task workflow.
Pasted and attached specifications are valid inputs. Existing repository packs
are contextual references unless the user explicitly designates them as governing.

Missing repository rules, `STATUS.md` or numbered slice files are not a blocker
and do not require an authorization question. Do not manufacture a pack or
synchronize task plans into repository specifications.

Keep one bounded objective per task; do not start the next slice without a task
authorizing it. Run relevant technical preflight checks, verify predecessor
integration and actual interfaces, preserve ownership boundaries, and stop
dependent work on genuine technical failures. A predecessor's merged task status
does not prove its code is in the checkout. Never duplicate its work to compensate.

Write an integration handoff and verification report in the appropriate area's
`reports/` directory (see the [documentation map](../README.md)), including exact
tables, columns, functions, endpoints and migration files where applicable,
deviations, checks and limitations. An existing pack's status can be consulted or
updated when useful or explicitly requested; creating one is not required.

## Retained references and history

Existing packs may contain `00-RULES-<pack>.md`, numbered specifications,
`STATUS.md` and a README describing their original order. These are not required
filenames or a required structure for new tasks. Preserve their contents and
links; do not edit user-owned specifications merely to meet a workflow convention.

This current workflow supersedes older instructions in retained packs that
require repository-only sources, missing-pack authorization, or mandatory status
updates. It does not change product requirements, ownership, technical sequencing,
preflight safeguards or acceptance contracts.

- [Campaigns references](campaigns/README.md) retain the intended technical order.
- [H2 documentation tree report](H2-docs-tree-report.md) records the earlier
  reorganization and the repository-first policy installed at that time; it is
  historical evidence, not current workflow policy.
- Dated audits, preflight reports and status entries remain unchanged, including
  descriptions of old source gates and one-task exceptions. Those descriptions
  do not reinstate the revoked repository-only requirement.
