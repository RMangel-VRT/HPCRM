import { google } from "googleapis";
import { db } from "../db";
import { mailboxAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getOAuth2Client, getValidAccessToken } from "./googleOAuth";
import { randomBytes } from "crypto";

interface SendEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

interface SendEmailResult {
  messageId: string;
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

function buildMimeMessage(
  from: string,
  opts: SendEmailOptions
): string {
  const boundary = `boundary_${randomBytes(12).toString("hex")}`;
  const messageId = `<${randomBytes(16).toString("hex")}@highplains.crm>`;
  const date = new Date().toUTCString();

  const headers = [
    `From: ${from}`,
    `To: ${opts.to.join(", ")}`,
    opts.cc?.length ? `Cc: ${opts.cc.join(", ")}` : null,
    opts.bcc?.length ? `Bcc: ${opts.bcc.join(", ")}` : null,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
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

  return headers.join("\r\n") + "\r\n\r\n" + body;
}

function base64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail(
  mailboxAccountId: string,
  opts: SendEmailOptions
): Promise<SendEmailResult> {
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

  const mimeMessage = buildMimeMessage(fromAddress, opts);
  const encodedMessage = base64urlEncode(mimeMessage);

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    return {
      messageId: response.data.id ?? "",
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
