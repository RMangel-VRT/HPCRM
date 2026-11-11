# Project documentation

Standing design documents, rules and API contracts live at each area's root.
Verification, implementation and release reports, handoffs, evidence JSON and
evidence-producing scripts live in that area's `reports/` directory.
The approved task plan, refined from user discussion, pasted or attached
requirements and codebase investigation, governs implementation through the normal
task workflow. Repository specifications are contextual references unless the user
explicitly designates them as governing requirements. See the
[project workflow](../replit.md#working-from-approved-task-plans).
Existing slice packs are retained in `slices/<pack>/` as optional references;
no rules file, `STATUS.md`, numbered slice file or new pack is a prerequisite.

| Area | Contents |
| --- | --- |
| [Contracts](contracts/) | Contract Center rollout references and contract verification reports |
| [Customers](customers/) | Customer/QuickBooks sync contracts and customer-page reports |
| [Documents](documents/) | Shared document design system, rendering kit and verification |
| [Estimates](estimates/) | Estimate builder, lifecycle, exhibits, proposals and catalog references |
| [Invoicing](invoicing/) | Invoice API contracts and billing verification reports |
| [Navigation](navigation/README.md) | Navigation design and implementation reports |
| [Ownership](ownership/) | Canonical fact ownership map and dated audit evidence |
| [Scheduling](scheduling/README.md) | Scheduling designs, rules, mockups and verification evidence |
| [Slice packs](slices/README.md) | Optional pack references, existing specifications and historical integration status |

## Where new files go

- A standing reference belongs at the appropriate area root.
- A task's integration handoff and verification report belong in that area's
  `reports/`, named after the task's objective or slice (for example,
  `scheduling/reports/CG1-verification.md` relative to this directory).
- If the user requests a repository pack, place it in `slices/<pack>/`; the
  [slice-pack reference guide](slices/README.md) explains its optional role.
  Do not create or synchronize specification files just to implement a task plan.
- Keep large generated outputs in the ignored `generated-artifacts/` directory,
  with compact evidence in the report.
