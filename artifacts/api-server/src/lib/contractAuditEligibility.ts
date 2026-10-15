import type { AuditData } from "./contractAuditData";

/** Replacement and removal must protect the same provenance, including on locked revalidation. */
export function destructiveAgreementIssues(data: AuditData, agreementId: string) {
  const errors: string[] = [], warnings: string[] = [];
  for (const old of data.terms.filter(t => t.agreementId === agreementId)) {
    const imports = data.history.filter(h => h.termId === old.id && h.note?.startsWith("Imported from audit ("));
    const lastImport = imports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    // Renewal imports deliberately do not grant permission to destroy a season.
    const importedCreation = imports.some(h => h.oldStatus === null);
    if (!importedCreation)
      errors.push(`Season ${old.seasonLabel} (${old.id}) was created in Contract Center, not by audit import. This agreement cannot be replaced; its season and documents are left untouched.`);
    for (const doc of data.termDocs.filter(d => d.termId === old.id)) {
      const importedSource = data.documents.some(source =>
        source.companyId === doc.companyId &&
        source.storageObjectPath === doc.storageObjectPath && source.filename === doc.filename &&
        source.mimeType === doc.mimeType && source.fileSize === doc.fileSize &&
        source.uploadedBy === doc.uploadedBy && source.version === doc.version &&
        source.uploadedAt.getTime() === doc.createdAt.getTime());
      if (!importedCreation || !importedSource)
        errors.push(`Document ${doc.filename} (${doc.id}) on season ${old.seasonLabel} was attached in Contract Center. This agreement cannot be replaced; the document is left untouched.`);
    }
    if (lastImport && old.updatedAt > lastImport.createdAt)
      warnings.push(`Season ${old.seasonLabel}: Was edited after the last import; importing replaces those edits`);
  }
  return { errors, warnings };
}

export function auditOwnsCustomer(data: AuditData, customerId: string, sourceCustomerId: string) {
  return sourceCustomerId === customerId || data.customers.some(c =>
    c.id === sourceCustomerId && c.parentCustomerId === customerId &&
    data.customers.some(parent => parent.id === customerId && parent.isParent === "true"));
}
