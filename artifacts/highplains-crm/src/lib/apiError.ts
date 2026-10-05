/** Scoped structured errors. Unlike extractApiErrorMessage, message beats code. */
export function parseApiValidationError(err: unknown): {
  status?: number; code?: string; message?: string;
} {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const match = raw.match(/^(\d{3}):\s*/);
  let body: unknown = err;
  try {
    if (raw) body = JSON.parse(match ? raw.slice(match[0].length) : raw);
  } catch {
    return { status: match ? Number(match[1]) : undefined };
  }
  if (!body || typeof body !== "object") return {};
  const data = body as Record<string, unknown>;
  return {
    status: match ? Number(match[1]) : typeof data.status === "number" ? data.status : undefined,
    code: typeof data.code === "string" ? data.code : typeof data.error === "string" ? data.error : undefined,
    message: typeof data.message === "string" && data.message.trim() ? data.message : undefined,
  };
}

export function taskValidationMessage(err: unknown): string | undefined {
  const { status, code, message } = parseApiValidationError(err);
  if (status !== 422) return undefined;
  if (message) return message;
  if (code === "TASK_WORK_TYPE") return "That work type can't be used on a Task.";
  if (code === "BILLING_MISMATCH") return "Billing and work type don't match. Refresh and try again.";
  return "That change isn't allowed. Refresh and try again.";
}

export function extractApiErrorMessage(err: unknown): string | undefined {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return undefined;

  const match = msg.match(/^\d{3}:\s*/);
  const body = match ? msg.slice(match[0].length).trim() : msg.trim();
  if (!body) return undefined;

  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
      if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    }
  } catch {
    // not JSON — return raw text
  }

  return body;
}
