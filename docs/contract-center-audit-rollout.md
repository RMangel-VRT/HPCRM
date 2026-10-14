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

## Template and limits

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
other customers can succeed independently. Reimport replaces only the matching
company-owned import reference and adds new attributable import history.

Editable CSV text beginning with a spreadsheet formula marker (including leading
whitespace) is prefixed with an apostrophe so Excel treats it as text, not an
executable formula. Ordinary IDs and decimal amounts are unchanged.
