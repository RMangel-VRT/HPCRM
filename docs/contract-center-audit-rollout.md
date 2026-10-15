# Contract Center: freeze and audit-import rollout

The revised audit-import attachment supersedes the Phase 2 instruction to run
Copy after publishing the freeze. Copy Preview is a reference only; Copy is
disabled. Standard-rate seeding remains an explicit admin action.

## Manual release order

1. Merge the create/renew flows, then the legacy write freeze, then audit import.
   The freeze was present in the implementation baseline for this slice.
2. Publish the freeze and audit import **together**, with owner approval.
   This task does not publish or import production data.
3. Only then export production batches. Legacy records must be read-only during
   the entire signed-document audit and Excel review.
4. Replace the worked template's ID placeholders with IDs from the export.
   Review the signed documents manually, review every Preview diagnostic, and
   explicitly confirm each real import. Drift warnings remain a safety net.
5. Contracts created or renewed in Contract Center during the audit have a null
   import reference. They remain untouched; the auditor skips those seasons in
   the CSVs. The import warns when such agreements already exist.
   A renewal added to an already-imported agreement still belongs to that
   agreement. Replacement is blocked if it contains Contract Center-created
   seasons or new direct document attachments, so those additions cannot be
   removed by an omitted CSV row.

The customer provenance message is “These records were moved into the Contract
Center on <date>”. The copy-status response is unchanged: imported legacy links
provide the earliest moved timestamp and distinct old-contract count.

Dashboard, revenue, reports, tickets, snow events and mobile still read frozen
legacy data until Phase 4. New Contract Center contracts do not yet appear there.

## Phase 7: shared-object retention

Imported term documents reference the existing storage objects; no blob is
copied or deleted by audit import. **Removing old document or contract rows must
never delete a stored blob that is still referenced by a term document.**
Any future cleanup must check all references before deleting objects.

The “Contract Center — Design & Impact Map” was not supplied. This discoverable
rollout note is the retention-rule reference until that document is available;
carry this rule into its Phase 7 section when it is supplied.

## Audit template and limits

The authoritative reusable worked template is
`attached_assets/contract-import-template_1791932139984.zip`:
`phase2/contract-import-template/README.md` and all five CSVs. The server accepts
this nested folder without extraction. Blank cells omit values; placeholders
must be replaced. Uploads are limited to 10 MB, ZIP contents to 30 MB expanded
and 20 entries. README and directory entries are ignored; other files, traversal
paths, symlinks, encrypted entries and duplicate tables are rejected.

Signed dates are noon America/Denver; old timestamp dates export using UTC
components with the original ISO timestamp alongside them. Money is parsed
directly into bounded integer cents. Each customer's import is atomic, while
other customers can succeed independently, except for removal-bearing audit
uploads, which are atomic across the entire upload (see below). Reimport replaces only the matching
company-owned import reference and adds new attributable import history.

Editable CSV text beginning with a spreadsheet formula marker (including leading
whitespace) is prefixed with an apostrophe so Excel treats it as text, not an
executable formula. Ordinary IDs and decimal amounts are unchanged.

## Externally signed renewal imports

Settings › Contracts also offers **Download current contracts**, an admin-only,
active-company export of every Contract Center season, payment pattern, rate
difference/custom rate and the rate card. The audit batch export uses the same
season columns, without changing its legacy customer batching or documents.

A renewal upload has `renewals.csv`, not `contracts.csv`. Never include both.
Each row's `renews_term_id` comes from the current export's `term_id`.
Optional `payments.csv`, `rates.csv`, `scope.csv` and `documents.csv` use
`contract_ref` to link to the main row. Payments are required except for
snow-only time-and-materials. Renewal documents use `contract_ref,file,kind`,
where `file` is a PDF path under `files/` inside the ZIP; legacy `document_id`
references are not accepted.

Renewals allow **40 MB uploaded, 60 MB expanded and 60 ZIP entries**, including
directories and README entries. Each PDF is at most **15 MB**. CSV-only audit
uploads retain their **10 MB / 30 MB / 20-entry** limits and cannot upload PDFs.
No migration or package installation is needed.

Blank optional season/snow fields keep the source values; dates determine the
default season label. Supplied payments are a complete new yearly pattern,
not an increase applied to old payments. `renewal_increase_pct` is information
only. No scope rows copies the original scope; any scope rows replace it.
Rates carry forward exactly as Renew, with only supplied cells overridden.

Preview writes nothing. Real Import reads the upload again and rechecks current
data under agreement locks, one transaction per customer. Signed imports set
only the source's status to Renewed; draft/sent imports leave it alone. Existing
draft/sent renewals must be cancelled first; replacement is not implemented.
An already-imported same-start season is skipped, including on repeated Import.
New PDF paths are private and unique; rollback removes only that customer's new
objects, never historical files or earlier customers' committed objects. A
cleanup failure is reported explicitly, not presented as a successful import.

Production renewal preparation, signed-document review and imports remain
explicit manual work. This implementation did not publish or import production
data. See [renewal verification](contract-center-renewal-verification.md).

## Parent-owned agreements and guarded removals

Contract Center Create, audit import and renewal import accept parent customers.
Parent and branch agreements can coexist. A branch's Contracts tab shows its own
agreements first, then read-only inherited cards through its direct parent, then
the frozen old-system section. The parent's Contracts tab is available on its
separate parent dashboard. Board/list contracts stay under the actual owner with
the active company's child count; they are never duplicated into branch groups.
Branch payment-line prefix matches against customer number or name are only
display hints, not billing relationships.

An audit upload may include `remove_agreements.csv`, with required
`agreement_ref` values identifying existing active-company import references.
Renewal mode rejects this file. Unknown, duplicate and blank references, or a
reference also present in `contracts.csv`, block Import. The five audit tables
remain required; the manifest remains optional. Multi-file uploads now allow the
six CSVs plus a manifest (seven files); byte and ZIP limits are unchanged.

Removal and replacement share the same provenance guard. A manually created or
renewed season, a renewal-imported season, or a direct Contract Center attachment
blocks destruction with the named season/document diagnostic. Having an
`import_ref` does not make all later history replaceable.

With any removals, the entire upload is one transaction. After the established
company import gate, deterministic company-scoped customer/hierarchy, agreement,
season/document, legacy-contract/document and source-link locks are acquired.
The entire upload is replanned against fresh data before deletion. Safely
removed/replaced agreements release their links before additions are written.
Any failure rolls back every removal and addition; there is no partial success.
Audit uploads without removals and renewal uploads retain per-customer behavior.

A parent may take legacy IDs and document metadata from itself or direct
children in the active company only. Uncovered-record warnings include those
children. Every new season records both normal import history and
`Replaces imported contracts: <refs>`. Committed removals are logged only after
commit, with identities, importing administrator and time. No stored object is
copied or deleted, and no frozen legacy row is modified.

See [parent/removal development verification](contract-center-parent-verification.md).
