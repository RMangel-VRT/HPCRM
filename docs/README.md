# Project documentation

Standing design documents, rules and API contracts live at each area's root.
Verification, implementation and release reports, handoffs, evidence JSON and
evidence-producing scripts live in that area's `reports/` directory.
Slice packs live in `slices/<pack>/`, not as loose files or chat-only attachments.

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
| [Slice packs](slices/README.md) | Repository-owned rules, individual slices and integration status |

## Where new files go

- A standing reference belongs at the appropriate area root.
- A slice's verification report belongs in that area's `reports/`, named after
  the slice (for example, `scheduling/reports/CG1-verification.md` relative to this directory).
- A pack belongs in `slices/<pack>/`; follow the [slice-pack workflow](slices/README.md).
- Keep large generated outputs in the ignored `generated-artifacts/` directory,
  with compact evidence in the report.
