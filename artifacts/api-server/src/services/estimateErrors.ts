export class EstimateError extends Error {
  constructor(public status: number, public error: string, public extra: Record<string, unknown> = {}) { super(error); }
}
export function requireEstimate<T>(value: T | null | undefined): T {
  if (value == null) throw new EstimateError(404, "NOT_FOUND");
  return value;
}
export function postgresCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}
