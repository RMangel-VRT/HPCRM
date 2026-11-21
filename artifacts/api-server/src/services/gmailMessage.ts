import type { ParsedMessage } from "./emailRouter";

// ── Gmail MIME helpers ────────────────────────────────────────────────────────

function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

interface MimePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MimePart[];
  headers?: Array<{ name?: string; value?: string }>;
}

function extractTextFromParts(parts: MimePart[], mimeType: "text/plain" | "text/html"): string {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return base64UrlDecode(part.body.data);
    }
    if (part.parts) {
      const result = extractTextFromParts(part.parts, mimeType);
      if (result) return result;
    }
  }
  return "";
}

export function parseGmailMessage(message: {
  id?: string | null;
  threadId?: string | null;
  payload?: {
    headers?: Array<{ name?: string | null; value?: string | null }>;
    body?: { data?: string | null };
    parts?: MimePart[];
    mimeType?: string | null;
  } | null;
  internalDate?: string | null;
}): ParsedMessage | null {
  if (!message.id || !message.threadId) return null;

  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const fromRaw = getHeader("From");
  const fromNameMatch = fromRaw.match(/^"?(.+?)"?\s*<(.+)>$/);
  const fromAddress = fromNameMatch ? fromNameMatch[2].trim().toLowerCase() : fromRaw.trim().toLowerCase();
  const fromName = fromNameMatch ? fromNameMatch[1].trim() : undefined;

  const toRaw = getHeader("To");
  const toAddresses = toRaw ? toRaw.split(",").map(a => {
    const m = a.trim().match(/^"?(.+?)"?\s*<(.+)>$/);
    return m ? m[2].trim().toLowerCase() : a.trim().toLowerCase();
  }).filter(Boolean) : [];

  const ccRaw = getHeader("Cc");
  const ccAddresses = ccRaw ? ccRaw.split(",").map(a => {
    const m = a.trim().match(/^"?(.+?)"?\s*<(.+)>$/);
    return m ? m[2].trim().toLowerCase() : a.trim().toLowerCase();
  }).filter(Boolean) : [];

  const subject = getHeader("Subject") || "(No subject)";
  const inReplyTo = getHeader("In-Reply-To") || undefined;

  // Use Gmail’s stored RFC header for cross-system deduplication.
  const rfcMessageId = getHeader("Message-ID").trim();
  const providerMessageId = rfcMessageId || message.id;

  let bodyText = "";
  let bodyHtml = "";

  const payload = message.payload;
  if (payload) {
    if (payload.parts) {
      bodyText = extractTextFromParts(payload.parts, "text/plain");
      bodyHtml = extractTextFromParts(payload.parts, "text/html");
    } else if (payload.body?.data) {
      const decoded = base64UrlDecode(payload.body.data as string);
      if (payload.mimeType === "text/html") {
        bodyHtml = decoded;
        bodyText = decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        bodyText = decoded;
      }
    }
  }

  const internalDateMs = parseInt(message.internalDate ?? "0", 10);
  const receivedAt = internalDateMs ? new Date(internalDateMs) : new Date();

  if (!fromAddress) return null;

  return {
    providerMessageId,
    providerThreadId: message.threadId,
    fromAddress,
    fromName,
    toAddresses,
    ccAddresses,
    subject,
    bodyText,
    bodyHtml: bodyHtml || undefined,
    inReplyTo,
    receivedAt,
  };
}

