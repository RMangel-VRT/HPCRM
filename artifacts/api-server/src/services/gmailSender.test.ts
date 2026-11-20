import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), token: vi.fn(async () => "mock-access"), where: vi.fn() }));
vi.mock("googleapis", () => ({ google: { gmail: () => ({ users: { messages: { send: mocks.send } } }) } }));
vi.mock("./googleOAuth", () => ({ getValidAccessToken: mocks.token, getOAuth2Client: () => ({ setCredentials: vi.fn() }) }));
vi.mock("../db", () => ({ db: { select: () => ({ from: () => ({ where: mocks.where }) }) } }));
vi.mock("crypto", async importOriginal => ({ ...await importOriginal<typeof import("crypto")>(), randomBytes: (n: number) => Buffer.alloc(n, 0x11) }));
import { buildMimeMessage, sendEmail } from "./gmailSender";
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
  mocks.where.mockResolvedValue([{ id: "mail", emailAddress: "office@example.test", displayName: "Office" }]);
  mocks.send.mockResolvedValue({ data: { id: "gmail-internal", threadId: "thread" } });
});
afterEach(() => vi.useRealTimers());
const prefix = [
  "From: Office <office@example.test>", "To: to@example.test", "Cc: cc@example.test",
  "Bcc: bcc@example.test", "Subject: Hello", "Date: Wed, 18 Nov 2026 18:00:00 GMT",
  "Message-ID: <fixed@example.test>", "MIME-Version: 1.0",
];
const opts = { to: ["to@example.test"], cc: ["cc@example.test"], bcc: ["bcc@example.test"], subject: "Hello", bodyText: "Plain" };
it("preserves legacy no-attachment plain and HTML MIME byte for byte with fixed time/randomness", () => {
  expect(buildMimeMessage(prefix[0].slice(6), opts, "<fixed@example.test>")).toBe([
    ...prefix, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", "UGxhaW4=",
  ].join("\r\n"));
  const boundary = `boundary_${"11".repeat(12)}`;
  const expected = [...prefix, `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", "UGxhaW4=", "",
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", "PGI+SGk8L2I+", "", `--${boundary}--`].join("\r\n");
  expect(buildMimeMessage(prefix[0].slice(6), { ...opts, bodyHtml: "<b>Hi</b>" }, "<fixed@example.test>")).toBe(expected);
  expect(buildMimeMessage(prefix[0].slice(6), { ...opts, attachments: [] }, "<fixed@example.test>")).toBe(
    buildMimeMessage(prefix[0].slice(6), opts, "<fixed@example.test>"));
});
it("nests text/HTML inside mixed MIME, safely encodes filenames and wraps attachment base64", () => {
  const mime = buildMimeMessage("office@example.test", { ...opts, bodyHtml: "<b>Hi</b>",
    attachments: [{ filename: 'COI — "\r\nBcc:evil\\name.pdf', mimeType: "application/pdf", content: Buffer.alloc(200, 3) }] }, "<fixed@example.test>");
  expect(mime).toContain("multipart/mixed"); expect(mime).toContain("multipart/alternative");
  expect(mime).toContain("filename*=UTF-8''COI%20%E2%80%94%20"); expect(mime).not.toContain("\r\nBcc:evil");
  const encoded = mime.split("Content-Disposition: attachment")[1].split("\r\n\r\n")[1].split("\r\n--")[0].trim();
  expect(encoded.split("\r\n").every(line => line.length <= 76)).toBe(true);
  expect(Buffer.from(encoded, "base64")).toEqual(Buffer.alloc(200, 3));
});
it("uses media upload without automatic retries and preserves RFC ID rather than Gmail internal ID", async () => {
  const result = await sendEmail("mail", { ...opts, attachments: [{ filename: "a.pdf", mimeType: "application/pdf", content: Buffer.from("bytes") }] }, "<saved@example.test>");
  expect(result).toEqual({ messageId: "<saved@example.test>", gmailId: "gmail-internal", threadId: "thread" });
  expect(mocks.send.mock.calls[0][0].media.mimeType).toBe("message/rfc822");
  expect(mocks.send.mock.calls[0][1]).toEqual({ retry: false });
  const chunks = []; for await (const chunk of mocks.send.mock.calls[0][0].media.body) chunks.push(chunk);
  expect(chunks.join("")).toContain("Message-ID: <saved@example.test>");
});
it("rejects actual attachment bytes above 20 MB before token lookup or transport", async () => {
  await expect(sendEmail("mail", { ...opts, attachments: [{ filename: "a.pdf", mimeType: "application/pdf", content: Buffer.alloc(20 * 1024 * 1024 + 1) }] }))
    .rejects.toThrow("COMPANY_DOCUMENT_EMAIL_TOO_LARGE");
  expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it("submits replies to the Gmail thread with validated RFC headers and plain-text MIME", async () => {
  await sendEmail("mail", { ...opts, inReplyTo: "<parent@example.test>", references: ["<root@example.test>", "<parent@example.test>"],
    threadId: "existing-thread" }, "<reply@example.test>");
  const body = mocks.send.mock.calls[0][0].requestBody;
  expect(body.threadId).toBe("existing-thread");
  const mime = Buffer.from(body.raw, "base64url").toString();
  expect(mime).toContain("In-Reply-To: <parent@example.test>\r\nReferences: <root@example.test>\r\n <parent@example.test>");
  expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
  expect(mime).not.toContain("text/html");
  expect(() => buildMimeMessage("office@example.test", { ...opts, inReplyTo: "<p@example.test>\r\nBcc: another@example.test" }, "<reply@example.test>"))
    .toThrow("Invalid email reply headers");
});
