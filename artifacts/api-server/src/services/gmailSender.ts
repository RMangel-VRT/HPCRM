import { google } from "googleapis";
import { db } from "../db";
import { mailboxAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOAuth2Client, getValidAccessToken } from "./googleOAuth";
import { randomBytes } from "crypto";
import { Readable } from "node:stream";

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
  attachments?: { filename: string; mimeType: string; content: Buffer }[];
}

interface SendEmailResult {
  /** RFC Message-ID header value (e.g. <abc@highplains.crm>) — stored as providerMessageId for dedup */
  messageId: string;
  /** Gmail's internal message ID — useful for deep-linking but NOT used as dedup key */
  gmailId: string;
  threadId: string;
}

function base64EncodeBody(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
}

function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

function formatAddressWithName(displayName: string | null | undefined, email: string): string {
  const name = displayName?.trim() ?? "";
  if (!name) {
    return email;
  }
  if (!/^[\x00-\x7F]*$/.test(name)) {
    return `${encodeHeaderValue(name)} <${email}>`;
  }
  if (/[,;<>@:"()[\]\\]/.test(name)) {
    const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}" <${email}>`;
  }
  return `${name} <${email}>`;
}

export const isRfcMessageId = (id: string) => /^<[^<>\s@]+@[^<>\s@]+>$/u.test(id) && !/[\u0000-\u001f\u007f]/u.test(id);

export function buildMimeMessage(
  from: string,
  opts: SendEmailOptions,
  rfcMessageId: string
): string {
  const references = opts.references ?? [];
  if ((opts.inReplyTo && !isRfcMessageId(opts.inReplyTo)) || references.some(id => !isRfcMessageId(id))) {
    throw new Error("Invalid email reply headers");
  }
  const boundary = `boundary_${randomBytes(12).toString("hex")}`;
  const date = new Date().toUTCString();

  const headers = [
    `From: ${from}`,
    `To: ${opts.to.join(", ")}`,
    opts.cc?.length ? `Cc: ${opts.cc.join(", ")}` : null,
    opts.bcc?.length ? `Bcc: ${opts.bcc.join(", ")}` : null,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${rfcMessageId}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : null,
    references.length ? `References: ${references.join("\r\n ")}` : null,
    `MIME-Version: 1.0`,
  ].filter(Boolean);

  let body: string;

  if (opts.bodyHtml) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64EncodeBody(opts.bodyText),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64EncodeBody(opts.bodyHtml),
      ``,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
    body = base64EncodeBody(opts.bodyText);
  }

  if (opts.attachments?.length) {
    const mixed = `mixed_${randomBytes(12).toString("hex")}`;
    const contentStart = headers.findIndex(h => h?.startsWith("Content-Type:"));
    const contentHeaders = headers.splice(contentStart);
    const parts = [`--${mixed}`, ...contentHeaders, "", body, ""];
    for (const attachment of opts.attachments) {
      const filename = attachment.filename.replace(/[\r\n\u0000-\u001f\u007f"\\/]/g, "_");
      const asciiName = filename.replace(/[^\x20-\x7e]/g, "_");
      const encoded = encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(attachment.mimeType) ? attachment.mimeType : "application/octet-stream";
      parts.push(`--${mixed}`, `Content-Type: ${mime}`,
        `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`,
        "Content-Transfer-Encoding: base64", "", attachment.content.toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "", "");
    }
    parts.push(`--${mixed}--`);
    headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
    body = parts.join("\r\n");
  }
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

function base64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const createGmailMessageId = () => `<${randomBytes(16).toString("hex")}@highplains.crm>`;

export async function sendEmail(
  mailboxAccountId: string,
  opts: SendEmailOptions,
  messageId?: string,
): Promise<SendEmailResult> {
  if ((opts.attachments ?? []).reduce((sum, a) => sum + a.content.length, 0) > 20 * 1024 * 1024)
    throw new Error("COMPANY_DOCUMENT_EMAIL_TOO_LARGE");
  const [account] = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.id, mailboxAccountId));

  if (!account) throw new Error("Mailbox account not found");

  const accessToken = await getValidAccessToken(mailboxAccountId);

  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  const fromAddress = formatAddressWithName(account.displayName, account.emailAddress);

  // Generate RFC Message-ID before building MIME — this is what gets stored as providerMessageId
  const rfcMessageId = messageId ?? createGmailMessageId();
  const mimeMessage = buildMimeMessage(fromAddress, opts, rfcMessageId);
  const encodedMessage = base64urlEncode(mimeMessage);

  try {
    const response = opts.attachments?.length ? await gmail.users.messages.send({
      userId: "me",
      media: { mimeType: "message/rfc822", body: Readable.from([mimeMessage]) },
    }, { retry: false }) : await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage, ...(opts.threadId ? { threadId: opts.threadId } : {}) },
    });

    return {
      messageId: rfcMessageId,                 // RFC Message-ID — used as providerMessageId for dedup
      gmailId: response.data.id ?? "",         // Gmail internal ID — reference only
      threadId: response.data.threadId ?? "",
    };
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string; errors?: Array<{ message?: string }> };
    const code = error?.code;
    const msg = error?.message ?? "Unknown error";

    if (code === 429 || msg.includes("quota")) {
      throw new Error("Gmail quota exceeded. Please try again later.");
    }
    if (code === 400 || msg.includes("invalid") || msg.includes("recipient")) {
      throw new Error(`Invalid recipient address: ${msg}`);
    }
    if (code === 401 || code === 403 || msg.includes("auth")) {
      throw new Error("Gmail authentication failed. Please reconnect your Gmail account.");
    }
    throw new Error(`Gmail send failed: ${msg}`);
  }
}
