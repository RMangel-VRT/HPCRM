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
