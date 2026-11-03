/** CRM/outbound US ZIP policy, deliberately separate from tolerant QBO parsing.
 * Empty optional addresses stay optional; completeness is checked by their owner. */
export function validCustomerZip(value: string | null | undefined): boolean {
  return value == null || value.trim() === "" || /^\d{5}(?:-?\d{4})?$/.test(value.trim());
}

export function validateOutgoingZips(fields: {
  billAddr: { zip: string | null } | null;
  shipAddr: { zip: string | null } | null;
}): void {
  if (!validCustomerZip(fields.shipAddr?.zip))
    throw new Error("Service ZIP must be five digits or nine digits (ZIP+4)");
  if (!validCustomerZip(fields.billAddr?.zip))
    throw new Error("Billing ZIP must be five digits or nine digits (ZIP+4)");
}
