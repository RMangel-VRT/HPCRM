import { afterEach, expect, it, vi } from "vitest";
import sgMail from "@sendgrid/mail";
import { storage } from "../storage";
import { sendEmail } from "./emailService";

vi.mock("@sendgrid/mail", () => ({
  default: { setApiKey: vi.fn(), send: vi.fn().mockResolvedValue([{ headers: {} }]) },
}));
vi.mock("../storage", () => ({
  storage: {
    createEmailLog: vi.fn().mockResolvedValue({ id: "test-log" }),
    updateEmailLog: vi.fn().mockResolvedValue({ status: "sent" }),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockConnector() {
  vi.stubEnv("REPL_IDENTITY", "synthetic");
  vi.stubEnv("REPLIT_CONNECTORS_HOSTNAME", "connectors.example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    json: async () => ({ items: [{ settings: { api_key: "synthetic", from_email: "office@example.test" } }] }),
  }));
}

it("passes pre-rendered staff text and escaped HTML unchanged to SendGrid", async () => {
  mockConnector();
  const subject = "Flag at {{gate}}";
  const html = "<p>Note: &lt;gate&gt; {{gate}}</p>";
  const text = "Note: <gate> {{gate}}";
  await sendEmail("staff@example.test", subject, html, text, { companyId: "company", variables: {}, alreadyRendered: true });
  expect(sgMail.send).toHaveBeenCalledWith({ to: "staff@example.test", from: "office@example.test", subject, html, text });
  expect(storage.createEmailLog).toHaveBeenCalledWith(expect.objectContaining({ subject, htmlBody: html }));
});

it("still substitutes variables for existing SendGrid templates", async () => {
  mockConnector();
  await sendEmail("staff@example.test", "Flag at {{gate}}", "<p>{{gate}}</p>", "{{gate}}",
    { companyId: "company", variables: { gate: "North" } });
  expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Flag at North", html: "<p>North</p>", text: "North" }));
});
