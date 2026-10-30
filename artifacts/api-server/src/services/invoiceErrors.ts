export class InvoiceError extends Error {
  constructor(public status: number, public error: string) { super(error); }
}
export function requireInvoice<T>(value: T | null | undefined): T {
  if (value == null) throw new InvoiceError(404, "NOT_FOUND");
  return value;
}
